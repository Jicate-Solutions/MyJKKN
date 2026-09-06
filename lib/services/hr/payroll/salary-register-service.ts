/**
 * Salary Register Service (2026-08-30)
 *
 * Substrate: 20260830150000_hr_salary_register.sql
 *            20260830150001_hr_salary_register_superseded_at.sql
 *
 * THE LAST LINK IN THE CHAIN. Punches are imported, requests are approved and
 * the attendance recomputed, HR Head closes the month and the per-staff day
 * counts freeze in hr_attendance_period_summaries. This service turns those
 * frozen counts plus hr_staff_salaries.monthly_gross into a register.
 *
 * NOT PayslipGenerator. That one still carries `const lopDays = 0 // deferred
 * to attendance linkage` and sources pay from hr_pay_scales, which has no rows.
 * It is left alone rather than rewritten: it belongs to a five-signature
 * approval chain with PF/ESI/TDS deductions that this register does not use.
 *
 * THE ROSTER IS THE WORK LOCATION (revised 2026-08-30, see migration
 * 20260830160000). staff.institution_id groups the register, which is also what
 * the attendance month close is keyed on — so a register maps 1:1 onto the month
 * that feeds it and waits on exactly one close.
 *
 * Payer scoping came first and did not survive contact: Main Office is a real
 * workplace that pays NOBODY, so it could never have a register, and 105 active
 * staff have no payer recorded and so landed on no register at all. WHO PAYS is
 * still carried — per line, plus per-payer subtotals in the export — so one Main
 * Office register still answers "what does each institution owe for the people
 * working here".
 *
 * THE ROSTER READS v_hr_staff, NOT staff. `employment_categories.included_in_hr`
 * gates the whole HR module, and payroll is no exception: Ayaah, Driver,
 * Security, Warden, Hostel and Cooking Master are deliberately outside it — 161
 * active people, 88 of them at Main Office. None has a frozen attendance
 * summary, so reading `staff` listed them only to exclude them again.
 *
 * Static class, SupabaseClient passed in — the convention across
 * lib/services/hr/payroll/.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/utils';
import { resolveTds } from '@/lib/hr/payroll/tds-slabs';
import { TdsSlabService } from '@/lib/services/hr/payroll/tds-slab-service';
import type {
  HRSalaryRegisterLine,
  HRSalaryRegisterRun,
  SalaryRegisterExclusionReason,
  SalaryRegisterPeriodDependency,
  SalaryRegisterPreflight,
  SalaryRegisterRunDetail,
} from '@/types/hr-payroll';

/**
 * Leave-type codes that mean DUTY, not absence.
 *
 * "OD" (On-Duty Leave) and "CD" (Clinical Duty) are recorded as leave
 * APPLICATIONS, so their days land in the summary's leave_days, not in
 * on_duty_days — which only counts the ON_DUTY / on_clinical_posting attendance
 * STATUS. Without this list an on-duty day would print in the Paid Leave column.
 *
 * Getting this set wrong moves a day between two PAID columns and cannot change
 * net pay: both feed payable_days identically. It is presentation only.
 * "Clinical" (Clinical Leave) is deliberately NOT here — it is named leave.
 */
const ON_DUTY_LEAVE_CODES = new Set(['OD', 'CD']);

/** PostgREST returns numeric as a string. Every figure is coerced through this. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v) || 0;
}

/** Money is stored numeric(12,2); keep every computed figure at 2dp. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Chunk size for `.in()` lookups.
 *
 * Same reasoning as payslip-generator.ts: a single `.in()` over a whole
 * organisation can silently truncate at the PostgREST row cap, and the
 * `in.(...)` list inflates the query string past what a proxy will accept.
 */
const CHUNK = 100;

function chunk<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? String(month)} ${year}`;
}

export const EXCLUSION_LABELS: Record<SalaryRegisterExclusionReason, string> = {
  no_salary_recorded: 'No salary recorded',
  salary_is_zero: 'Recorded salary is zero',
  no_attendance_summary: 'No attendance in the closed month',
  attendance_month_not_closed: 'Their work location has not closed this month',
};

export interface SalaryRegisterInput {
  hrOrganizationId: string;
  year: number;
  month: number;
}

interface RosterMember {
  staff_id: string;
  employee_code: string | null;
  staff_name: string;
  designation: string | null;
  department_name: string | null;
  date_of_joining: string | null;
  work_institution_id: string;
}

/** Everything a preflight or a generate needs, loaded once. */
interface RegisterContext {
  organisationName: string;
  institutionId: string;
  /** hr_organizations.is_payroll_entity — false means this org pays nobody by design. */
  isPayrollEntity: boolean;
  roster: RosterMember[];
  dependencies: SalaryRegisterPeriodDependency[];
  /** work institution id -> its locked period (only locked ones are present). */
  lockedPeriodByInstitution: Map<string, { id: string; workingDays: number }>;
  salaryByStaff: Map<string, number>;
  /**
   * EPF/ESI in force, already zeroed where the eligibility flag is off.
   *
   * A SEPARATE MAP rather than a reshaped salaryByStaff: that map's value is
   * read as a bare number in two places to decide inclusion (`salary <= 0`),
   * and widening it to an object would turn both of those into silently-true
   * comparisons against an object.
   */
  statutoryByStaff: Map<string, { epf: number; esi: number; allowance: number; tds: number }>;
  bankByStaff: Map<string, string>;
  /** Who bears each salary. Absent for the 105 staff with no payer recorded. */
  payerByStaff: Map<string, { id: string; name: string }>;
  summaryByStaff: Map<string, AttendanceSummaryRow>;
  bankUnreadable: boolean;
  /** hr.payroll.institution.view is missing, so every payer reads as unrecorded. */
  payerUnreadable: boolean;
}

/** Exported so computeRegisterLine's signature is nameable by its tests. */
export interface AttendanceSummaryRow {
  period_id: string;
  present_days: number;
  half_days: number;
  leave_days: number;
  on_duty_days: number;
  comp_off_days: number;
  lop_days: number;
  payable_days: number;
  leave_by_type: Record<string, number>;
  unprocessed_days: number;
  /**
   * Days the resolver expected this person to work in the month, pattern-aware
   * (2026-09-04). NULL on months closed before the column existed.
   */
  scheduled_days: number | null;
  /**
   * The work pattern held on any day of the month. When set, the day rate
   * divides by scheduled_days — the person's own week — instead of the
   * institution standard. See registerBasisFor.
   */
  work_pattern_id: string | null;
}

/**
 * The divisor for one register line.
 *
 * A person on a work pattern (a 3-day or 5-day week at an institution that
 * otherwise runs six) is paid on THEIR scheduled days, not the institution's
 * month standard — dividing a Tue/Wed/Thu person's salary by 26 would charge
 * them ~13 unpaid days every month. Everyone else keeps the period basis.
 *
 * scheduled_days is the resolver's full-month expectation, NOT the person's
 * recorded working days, for the same reason the institution basis is used for
 * everyone else: a mid-month joiner is unpaid for the days before they joined,
 * not paid a full month for half of one.
 */
export function registerBasisFor(
  summary: Pick<AttendanceSummaryRow, 'scheduled_days' | 'work_pattern_id'>,
  periodBasis: number,
): number {
  if (summary.work_pattern_id && (summary.scheduled_days ?? 0) > 0) {
    return summary.scheduled_days as number;
  }
  return periodBasis;
}

/** The computed half of a register row — everything that is not identity. */
export interface RegisterLineFigures {
  business_working_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  on_duty_days: number;
  worked_days: number;
  paid_days: number;
  actual_gross: number;
  basic_pay: number;
  allowance: number;
  unpaid_leave_deduction: number;
  epf_deduction: number;
  esi_deduction: number;
  tds_deduction: number;
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
}

/**
 * Every figure at zero — the shape of a line that produced no payment.
 *
 * EXCLUDED ROWS MUST CARRY THE SAME KEYS AS INCLUDED ONES. supabase-js sends a
 * batch insert as ONE PostgREST request, and PostgREST builds a single INSERT
 * from the union of the objects' keys, sending an explicit NULL for any key an
 * object leaves out. An explicit NULL does NOT fall back to the column DEFAULT,
 * so an excluded row that simply omitted `business_working_days` violated its
 * NOT NULL constraint and failed the whole batch:
 *
 *   null value in column "business_working_days" ... violates not-null constraint
 *
 * It only bites when a register has at least one exclusion, so a fully-covered
 * institution generates fine and the first one with a gap does not. Spreading
 * this makes both shapes identical by construction rather than by discipline.
 */
export const ZERO_FIGURES: RegisterLineFigures = {
  business_working_days: 0,
  paid_leave_days: 0,
  unpaid_leave_days: 0,
  on_duty_days: 0,
  worked_days: 0,
  paid_days: 0,
  actual_gross: 0,
  basic_pay: 0,
  allowance: 0,
  unpaid_leave_deduction: 0,
  epf_deduction: 0,
  esi_deduction: 0,
  tds_deduction: 0,
  total_earnings: 0,
  total_deductions: 0,
  net_pay: 0,
};

/**
 * Turn one person's frozen day counts and monthly gross into register figures.
 *
 * PURE, AND EXPORTED, so the arithmetic that decides what people are paid can
 * be tested without a database. Everything money-related in this module happens
 * here — see __tests__/hr/salary-register-line.test.ts.
 *
 * The three identities the register must satisfy, and does:
 *   Paid Days   = Business Working Days - Unpaid
 *   Paid Days   = Worked + Paid Leave + On Duty
 *   Worked      = Business Working Days - Paid Leave - Unpaid - On Duty
 */
export function computeRegisterLine(input: {
  monthlyGross: number;
  /** The month standard for the calendar this person actually worked. */
  workingDaysBasis: number;
  /**
   * The statutory contributions in force for this person, already zeroed by the
   * caller when the corresponding eligibility flag is off.
   *
   * DEDUCTED IN FULL, NOT PRO-RATED. These are stored as a flat monthly rupee
   * figure per employee, so the number recorded is the number withheld even in
   * a month with unpaid days — unlike the unpaid-leave deduction above, which is
   * day-rated by definition.
   */
  epfAmount?: number;
  esiAmount?: number;
  /**
   * Paid on top of the gross, and PRO-RATED WITH IT: the day rate below divides
   * gross + allowance, so an absent day costs a slice of both. That is the one
   * behaviour that separates it from the flat statutory amounts around it.
   */
  allowance?: number;
  /**
   * Resolved from hr_tds_slabs against the MONTHLY GROSS ALONE — never the
   * allowance. Passed in already computed so this stays a pure function of
   * numbers, with the band lookup living in lib/hr/payroll/tds-slabs.ts.
   */
  tdsAmount?: number;
  summary: Pick<
    AttendanceSummaryRow,
    'present_days' | 'leave_days' | 'on_duty_days' | 'comp_off_days' | 'payable_days' | 'leave_by_type'
  >;
}): RegisterLineFigures {
  const { monthlyGross, workingDaysBasis: basis, summary: s } = input;

  // Days recorded as ON-DUTY LEAVE sit in leave_days, not on_duty_days. Move
  // them across so the On Duty column means on duty. Both are paid, so this
  // cannot change net pay — it decides which column a day is printed in.
  let odLeaveDays = 0;
  for (const [code, days] of Object.entries(s.leave_by_type ?? {})) {
    if (ON_DUTY_LEAVE_CODES.has(code)) odLeaveDays += num(days);
  }

  const paidLeaveDays = Math.max(0, s.leave_days - odLeaveDays) + s.comp_off_days;
  const onDutyDays = s.on_duty_days + odLeaveDays;
  const workedDays = s.present_days;

  // Capped at the basis: someone whose work location runs a 6-day week while
  // their payer runs a 5-day one can be credited more days than the month they
  // are paid for, and nobody is paid more than a full month.
  const paidDays = Math.min(s.payable_days, basis);

  /**
   * UNPAID DAYS ARE THE MONTH MINUS WHAT IS PAID FOR — not the summary's
   * lop_days.
   *
   * lop_days counts only days a person was EXPECTED to work and did not.
   * Someone who joined on the 15th has no records before that date, so those
   * days are not LOP, and paying on lop_days would hand them a full month's
   * gross for half a month.
   *
   * The hand-kept register already works this way: on every row of the sample,
   * Unpaid = Business Working Days - Paid Days (22-20=2, 22-16=6, 22-17=5).
   * For a full-month employee the two definitions agree exactly — verified
   * against all 29 rows of the one closed month.
   */
  const unpaidLeaveDays = Math.max(0, basis - paidDays);

  const allowance = round2(Math.max(0, input.allowance ?? 0));

  // The day rate divides by the month's WORKING days, not calendar days. The
  // sample register does the same: 16000 / 22 x 6 = 4363.64.
  //
  // IT DIVIDES GROSS + ALLOWANCE. The allowance is earnings, so an absent day
  // costs a proportional slice of it too — unlike EPF/ESI/TDS below, which are
  // flat monthly figures and are withheld in full.
  const dayRate = basis > 0 ? (monthlyGross + allowance) / basis : 0;
  const unpaidLeaveDeduction = round2(dayRate * unpaidLeaveDays);
  const totalEarnings = round2(monthlyGross + allowance);

  /**
   * The statutory pair, capped at what is left after the unpaid-leave deduction.
   *
   * Deducting a flat EPF + ESI in full is right for an ordinary partial month,
   * but a line with ZERO paid days earns nothing to deduct from and would
   * otherwise net a negative figure — the register would be asking the employee
   * to pay the institution. The cap takes EPF first, then ESI from whatever
   * remains, so net_pay floors at 0 and the shortfall is visible as a reduced
   * contribution rather than a negative payment.
   */
  const afterUnpaid = Math.max(0, round2(totalEarnings - unpaidLeaveDeduction));
  const epfDeduction = round2(Math.min(Math.max(0, input.epfAmount ?? 0), afterUnpaid));
  const esiDeduction = round2(
    Math.min(Math.max(0, input.esiAmount ?? 0), round2(afterUnpaid - epfDeduction))
  );
  // TDS is capped LAST, so a month with almost nothing left drops the tax
  // rather than the provident fund.
  const tdsDeduction = round2(
    Math.min(
      Math.max(0, input.tdsAmount ?? 0),
      round2(afterUnpaid - epfDeduction - esiDeduction)
    )
  );
  const totalDeductions = round2(
    unpaidLeaveDeduction + epfDeduction + esiDeduction + tdsDeduction
  );

  return {
    business_working_days: basis,
    paid_leave_days: paidLeaveDays,
    unpaid_leave_days: unpaidLeaveDays,
    on_duty_days: onDutyDays,
    worked_days: workedDays,
    paid_days: paidDays,
    actual_gross: totalEarnings,
    // These finally differ. Before the allowance existed there was no component
    // breakdown and both columns carried the same figure; now basic_pay is the
    // contractual gross and actual_gross is what the person actually earns.
    basic_pay: round2(monthlyGross),
    allowance,
    unpaid_leave_deduction: unpaidLeaveDeduction,
    epf_deduction: epfDeduction,
    esi_deduction: esiDeduction,
    tds_deduction: tdsDeduction,
    total_earnings: totalEarnings,
    // Carries the statutory pair as well, so net_pay, the run totals and the
    // per-payer split subtotals all keep deriving from this one figure.
    total_deductions: totalDeductions,
    // Whole rupees, as the hand-kept register pays. An adjustment recorded
    // later re-derives this the same way.
    net_pay: Math.round(totalEarnings - totalDeductions),
  };
}

export class SalaryRegisterService {
  // ───────────────────────────────────────────────────────────────────────
  // Shared loader
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Load the roster, its month dependencies, and the three per-staff lookups.
   *
   * EVERY READ HERE IS SEPARATELY RLS-GATED and returns ZERO ROWS AND NO ERROR
   * when the caller lacks the key — indistinguishable from "there is nothing
   * here", and the two demand opposite actions. Where an empty result is
   * ambiguous this asks `user_has_permission` directly rather than inferring,
   * exactly as payslip-generator.ts does. Only runs in the degenerate case, so
   * it costs nothing on a normal load.
   */
  private static async loadContext(
    supabase: SupabaseClient,
    input: SalaryRegisterInput,
  ): Promise<RegisterContext> {
    const { hrOrganizationId, year, month } = input;

    // 1. The paying organisation.
    const { data: org, error: orgErr } = await (supabase as any)
      .from('hr_organizations')
      .select('id, name, institution_id, is_payroll_entity')
      .eq('id', hrOrganizationId)
      .maybeSingle();

    if (orgErr) throw new Error(`Failed to load the paying institution: ${getErrorMessage(orgErr)}`);
    if (!org) throw new Error('That paying institution does not exist, or is not visible to this account.');

    // 2. The roster — everyone in an HR CATEGORY who WORKS here.
    //
    // v_hr_staff, NOT the staff table. The view is `staff JOIN
    // employment_categories WHERE included_in_hr`, and it is the gate the whole
    // HR module already runs on — so payroll must respect it too. Reading staff
    // directly put 161 people on registers who are deliberately outside HR:
    // Ayaah (105), Driver (31), Security (15), Warden (5), Hostel (4), Cooking
    // Master (1). At Main Office that alone was 88 of the 121 rows.
    //
    // The attendance side already agrees: not one of those 161 appears in a
    // frozen period summary, so they were being listed only to be excluded as
    // "No attendance" — noise that buried the real gaps.
    //
    // staff.institution_id, NOT hr_staff_payroll: the register is grouped by
    // work location because that is what the attendance close is keyed on, so a
    // register maps 1:1 onto the month feeding it. Who PAYS rides on the line.
    //
    // The view is security_invoker, so RLS on staff still applies through it.
    const roster: RosterMember[] = [];
    const { data: staffRows, error: staffErr } = await (supabase as any)
      .from('v_hr_staff')
      .select('id, staff_id, first_name, last_name, designation, date_of_joining, institution_id, department_id')
      .eq('institution_id', org.institution_id)
      .eq('is_active', true)
      .limit(2000);

    // Abort rather than continue. A partial roster produces a register that
    // reports success while omitting people — not obvious until somebody is
    // not paid.
    if (staffErr) throw new Error(`Failed to load team members: ${getErrorMessage(staffErr)}`);

    // Departments in a SEPARATE query, not a PostgREST embed: v_hr_staff is a
    // view, and embedding relies on foreign keys the view does not carry.
    // Fetching them by id also keeps the null case honest — a person with no
    // department still belongs on their own payroll.
    const departmentIds = Array.from(
      new Set(((staffRows ?? []) as any[]).map((r) => r.department_id).filter(Boolean)),
    ) as string[];

    const departmentNameById = new Map<string, string>();
    for (const ids of chunk(departmentIds)) {
      const { data: deptRows, error: deptErr } = await (supabase as any)
        .from('departments')
        .select('id, department_name')
        .in('id', ids);

      if (deptErr) throw new Error(`Failed to load departments: ${getErrorMessage(deptErr)}`);
      for (const d of ((deptRows ?? []) as any[])) departmentNameById.set(d.id, d.department_name);
    }

    for (const st of ((staffRows ?? []) as any[])) {
      roster.push({
        staff_id: st.id,
        employee_code: st.staff_id ?? null,
        staff_name: `${st.first_name ?? ''} ${st.last_name ?? ''}`.trim(),
        designation: st.designation ?? null,
        department_name: st.department_id ? departmentNameById.get(st.department_id) ?? null : null,
        date_of_joining: st.date_of_joining ?? null,
        work_institution_id: st.institution_id,
      });
    }

    roster.sort((a, b) => (a.employee_code ?? '￿').localeCompare(b.employee_code ?? '￿'));

    const staffIds = roster.map((r) => r.staff_id);

    if (staffIds.length === 0) {
      return {
        organisationName: org.name,
        institutionId: org.institution_id,
        isPayrollEntity: org.is_payroll_entity !== false,
        roster: [],
        dependencies: [],
        lockedPeriodByInstitution: new Map(),
        salaryByStaff: new Map(),
        statutoryByStaff: new Map(),
        bankByStaff: new Map(),
        payerByStaff: new Map(),
        summaryByStaff: new Map(),
        bankUnreadable: false,
        payerUnreadable: false,
      };
    }

    // 3. WHO PAYS each of them. No longer the grouping key — an attribute of the
    //    row, and the basis of the per-payer subtotals in the export. A person
    //    with no row here is NOT excluded: 105 active staff have no payer
    //    recorded, and omitting them would be the silent gap this module exists
    //    to prevent. They appear with the payer reported as unrecorded.
    const payerByStaff = new Map<string, { id: string; name: string }>();
    for (const ids of chunk(staffIds)) {
      const { data: payRows, error: payErr } = await (supabase as any)
        .from('hr_staff_payroll')
        .select('staff_id, hr_organization_id, hr_organizations:hr_organization_id(name)')
        .in('staff_id', ids);

      if (payErr) throw new Error(`Failed to load the payer directory: ${getErrorMessage(payErr)}`);

      for (const r of ((payRows ?? []) as any[])) {
        if (!r.hr_organization_id) continue;
        payerByStaff.set(r.staff_id, {
          id: r.hr_organization_id,
          name: r.hr_organizations?.name ?? 'Unknown institution',
        });
      }
    }

    // hr_staff_payroll is gated on hr.payroll.institution.view. Without it the
    // read returns zero rows and no error — indistinguishable from "no payers
    // recorded". That no longer blocks a register (the roster does not come from
    // here any more), so it is a WARNING rather than a throw; the preflight says
    // so instead of printing a whole column of "not recorded".
    let payerUnreadable = false;
    if (payerByStaff.size === 0) {
      const { data: canSeePayroll } = await (supabase as any).rpc('user_has_permission', {
        permission_name: 'hr.payroll.institution.view',
      });
      const { data: isSuperAdmin } = await (supabase as any).rpc('is_super_admin');
      payerUnreadable = !canSeePayroll && !isSuperAdmin;
    }

    // 4. The attendance month. Exactly one now — this institution's own.
    const { data: periodRows, error: periodErr } = await (supabase as any)
      .from('hr_attendance_periods')
      .select('id, institution_id, status, working_days_count, locked_at')
      .eq('institution_id', org.institution_id)
      .eq('period_year', year)
      .eq('period_month', month)
      .maybeSingle();

    if (periodErr) throw new Error(`Failed to load the attendance month: ${getErrorMessage(periodErr)}`);

    const dependencies: SalaryRegisterPeriodDependency[] = [{
      institution_id: org.institution_id,
      institution_name: org.name,
      staff_count: roster.length,
      period_id: periodRows?.id ?? null,
      status: !periodRows ? 'not_created' : periodRows.status === 'locked' ? 'locked' : 'open',
      working_days_count: periodRows?.working_days_count ?? null,
      locked_at: periodRows?.locked_at ?? null,
    }];

    const lockedPeriodByInstitution = new Map<string, { id: string; workingDays: number }>();
    if (periodRows?.status === 'locked' && periodRows.id) {
      lockedPeriodByInstitution.set(org.institution_id, {
        id: periodRows.id,
        workingDays: num(periodRows.working_days_count),
      });
    }

    // 5. Salaries. superseded_by IS NULL = the currently effective row.
    // THE BANDS ARE LOADED WITH throwOnDenied. A slab read that RLS empties looks
    // exactly like "TDS is switched off", and the two demand opposite outcomes:
    // one generates a register with no tax on it, the other must not generate at
    // all. TdsSlabService.list asks user_has_permission rather than inferring
    // from the row count.
    const tdsSlabs = await TdsSlabService.list(supabase, { throwOnDenied: true });

    const salaryByStaff = new Map<string, number>();
    const statutoryByStaff = new Map<
      string,
      { epf: number; esi: number; allowance: number; tds: number }
    >();
    for (const ids of chunk(staffIds)) {
      const { data, error } = await (supabase as any)
        .from('hr_staff_salaries')
        .select(
          'staff_id, monthly_gross, eligible_for_pf, epf_amount, eligible_for_esi, esi_amount, allowance_amount'
        )
        .in('staff_id', ids)
        .is('superseded_by', null);

      if (error) throw new Error(`Failed to load salaries: ${getErrorMessage(error)}`);
      for (const s of (data ?? []) as any[]) {
        const gross = num(s.monthly_gross);
        salaryByStaff.set(s.staff_id, gross);
        // The flag decides, not the amount. fn_hr_set_staff_salary already
        // zeroes an amount whose flag is off, but the register must not depend
        // on that: a row written before this feature existed, or by the
        // service-role path, can carry a figure the flag does not authorise.
        statutoryByStaff.set(s.staff_id, {
          epf: s.eligible_for_pf ? num(s.epf_amount) : 0,
          esi: s.eligible_for_esi ? num(s.esi_amount) : 0,
          allowance: num(s.allowance_amount),
          // Resolved against the GROSS ALONE. The allowance is deliberately not
          // in the tax base, so a person pushed over a band threshold by their
          // allowance is not taxed for it.
          tds: resolveTds(gross, tdsSlabs).amount,
        });
      }
    }

    // Empty salaries across a non-empty roster is ambiguous the same way the
    // payer directory is: four institutions genuinely have zero salary rows.
    if (salaryByStaff.size === 0 && staffIds.length > 0) {
      const { data: canSeeSalary } = await (supabase as any).rpc('user_has_permission', {
        permission_name: 'hr.payroll.salary.view',
      });
      const { data: isSuperAdmin } = await (supabase as any).rpc('is_super_admin');
      if (!canSeeSalary && !isSuperAdmin) {
        throw new Error(
          'Cannot read salaries: this account is missing hr.payroll.salary.view. Every person would be excluded as "No salary recorded", which is indistinguishable from the salaries genuinely not being entered. Ask an administrator to grant it.',
        );
      }
    }

    // 6. Bank accounts. Unlike salary, an empty read here is NOT escalated —
    //    hr_staff_bank_accounts is legitimately empty for all 755 staff today,
    //    so throwing would block every register. The permission is probed only
    //    to turn a silent blank column into a stated warning.
    const bankByStaff = new Map<string, string>();
    for (const ids of chunk(staffIds)) {
      const { data, error } = await (supabase as any)
        .from('hr_staff_bank_accounts')
        .select('staff_id, account_number')
        .in('staff_id', ids)
        .is('superseded_by', null);

      if (error) throw new Error(`Failed to load bank accounts: ${getErrorMessage(error)}`);
      for (const b of (data ?? []) as any[]) {
        if (b.account_number) bankByStaff.set(b.staff_id, String(b.account_number));
      }
    }

    let bankUnreadable = false;
    if (bankByStaff.size === 0 && staffIds.length > 0) {
      const { data: canSeeBank } = await (supabase as any).rpc('user_has_permission', {
        permission_name: 'hr.payroll.bank.view',
      });
      const { data: isSuperAdmin } = await (supabase as any).rpc('is_super_admin');
      bankUnreadable = !canSeeBank && !isSuperAdmin;
    }

    // 7. The frozen day counts, read from the LOCKED periods only. Read straight
    //    from the table rather than recomputed — that is the point of freezing.
    const summaryByStaff = new Map<string, AttendanceSummaryRow>();
    const lockedPeriodIds = Array.from(lockedPeriodByInstitution.values()).map((p) => p.id);

    if (lockedPeriodIds.length > 0) {
      for (const ids of chunk(staffIds)) {
        const { data, error } = await (supabase as any)
          .from('hr_attendance_period_summaries')
          .select('period_id, staff_id, present_days, half_days, leave_days, on_duty_days, comp_off_days, lop_days, payable_days, leave_by_type, unprocessed_days, scheduled_days, work_pattern_id')
          .in('period_id', lockedPeriodIds)
          .in('staff_id', ids);

        if (error) throw new Error(`Failed to load the frozen day counts: ${getErrorMessage(error)}`);

        for (const s of (data ?? []) as any[]) {
          summaryByStaff.set(s.staff_id, {
            period_id: s.period_id,
            present_days: num(s.present_days),
            half_days: num(s.half_days),
            leave_days: num(s.leave_days),
            on_duty_days: num(s.on_duty_days),
            comp_off_days: num(s.comp_off_days),
            lop_days: num(s.lop_days),
            payable_days: num(s.payable_days),
            leave_by_type: (s.leave_by_type ?? {}) as Record<string, number>,
            unprocessed_days: num(s.unprocessed_days),
            scheduled_days: s.scheduled_days == null ? null : num(s.scheduled_days),
            work_pattern_id: (s.work_pattern_id as string | null) ?? null,
          });
        }
      }

      if (summaryByStaff.size === 0) {
        const { data: canSeePeriods } = await (supabase as any).rpc('user_has_permission', {
          permission_name: 'hr.attendance.period.view',
        });
        const { data: isSuperAdmin } = await (supabase as any).rpc('is_super_admin');
        if (!canSeePeriods && !isSuperAdmin) {
          throw new Error(
            'Cannot read the closed month’s day counts: this account is missing hr.attendance.period.view. Every person would be excluded as "No attendance", which is indistinguishable from the month having no records. Ask an administrator to grant it.',
          );
        }
      }
    }

    return {
      organisationName: org.name,
      institutionId: org.institution_id,
      isPayrollEntity: org.is_payroll_entity !== false,
      roster,
      dependencies,
      lockedPeriodByInstitution,
      salaryByStaff,
      statutoryByStaff,
      bankByStaff,
      payerByStaff,
      summaryByStaff,
      bankUnreadable,
      payerUnreadable,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Preflight
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Can this register be generated, and if not, exactly why.
   *
   * This is the surface that answers the user's question, so every blocker is
   * named with its count and the institution it belongs to. A bare "not ready"
   * would send HR looking in the wrong module.
   */
  static async preflight(
    supabase: SupabaseClient,
    input: SalaryRegisterInput,
  ): Promise<SalaryRegisterPreflight> {
    const ctx = await SalaryRegisterService.loadContext(supabase, input);
    const { year, month } = input;
    const label = monthLabel(year, month);

    const blockers: string[] = [];
    const warnings: string[] = [];

    // An empty roster now means exactly one thing — nobody works here. Under the
    // old payer scoping it meant "no payer recorded", which sent operators to
    // Payroll Organisation to record payers on an institution that pays nobody.
    if (ctx.roster.length === 0) {
      blockers.push(
        `No active staff in an HR employment category are posted to ${ctx.organisationName}, so there is nobody to pay. Either their work location is wrong on the staff records, or their employment category is not marked "included in HR".`,
      );
    }

    // An unclosed dependency is a HARD blocker: its day counts are still moving.
    //
    // 'open' and 'not_created' get the SAME instruction on purpose. A period row
    // only comes into existence when the month is closed, so "never opened" does
    // not mean the biometric data is missing — Allied Health had 556 July
    // records and still showed not_created. Both states are fixed in one place,
    // and the close itself refuses if the data really is absent.
    for (const d of ctx.dependencies) {
      if (d.status === 'locked') continue;
      const who =
        d.institution_id === ctx.institutionId
          ? `${d.staff_count} staff affected`
          : `${d.staff_count} of the staff you pay work there`;
      blockers.push(
        `${label} is not closed for ${d.institution_name} (${who}). Close it in Attendance · Month Close.`,
      );
    }

    let missingSalary = 0;
    let missingBank = 0;
    let missingPayer = 0;
    let payable = 0;
    let unprocessedDays = 0;
    let halfDayCount = 0;

    for (const member of ctx.roster) {
      const salary = ctx.salaryByStaff.get(member.staff_id);
      const summary = ctx.summaryByStaff.get(member.staff_id);

      if (salary === undefined || salary <= 0) missingSalary++;
      if (!ctx.bankByStaff.has(member.staff_id)) missingBank++;
      if (!ctx.payerByStaff.has(member.staff_id)) missingPayer++;
      if (salary !== undefined && salary > 0 && summary) payable++;

      if (summary) {
        unprocessedDays += summary.unprocessed_days;
        halfDayCount += summary.half_days;
      }
    }

    if (missingSalary > 0) {
      warnings.push(
        missingSalary === ctx.roster.length
          ? `No salary is recorded for anyone paid by ${ctx.organisationName}. Enter salaries in Employee Salaries — there is nothing to generate until then.`
          : `${missingSalary} of ${ctx.roster.length} staff have no salary recorded. They will be listed as excluded, not paid zero.`,
      );
    }

    // Every dependency closed, yet nobody payable, means the register would be
    // an empty file. Refuse rather than produce one.
    if (blockers.length === 0 && payable === 0) {
      blockers.push(
        `Nothing to generate: none of the ${ctx.roster.length} staff paid by ${ctx.organisationName} have both a recorded salary and attendance in ${label}.`,
      );
    }

    if (missingBank > 0) {
      warnings.push(
        ctx.bankUnreadable
          ? 'Bank account numbers are not visible to this account (missing hr.payroll.bank.view). The BANK STATEMENT sheet will export blank.'
          : `${missingBank} of ${ctx.roster.length} staff have no bank account recorded. Their BANK STATEMENT rows will export blank.`,
      );
    }

    if (ctx.payerUnreadable) {
      warnings.push(
        'Who pays each person is not visible to this account (missing hr.payroll.institution.view), so the Paid By column and the per-payer subtotals will be blank. The amounts are unaffected.',
      );
    } else if (missingPayer > 0) {
      warnings.push(
        missingPayer === ctx.roster.length
          ? `No paying institution is recorded for anyone here. They are still on the register and still paid; the Paid By column and the per-payer subtotals will be blank until Payroll Organisation is filled in.`
          : `${missingPayer} of ${ctx.roster.length} staff have no paying institution recorded. They stay on the register and are still paid — only the per-payer subtotals are short by their amounts.`,
      );
    }

    // Not a warning about a fault: it is the fact that makes the Paid By column
    // worth reading. Main Office is the whole reason this register is grouped by
    // work location rather than by payer.
    if (!ctx.isPayrollEntity && ctx.roster.length > 0) {
      warnings.push(
        `${ctx.organisationName} does not pay salaries itself — everyone here is paid by another institution. The register lists them all; use the Paid By column and the per-payer totals to see what each institution owes.`,
      );
    }

    if (unprocessedDays > 0) {
      warnings.push(
        `${unprocessedDays} day(s) across this roster could not be judged by the attendance evaluator. They are treated as unpaid. Review them before paying.`,
      );
    }

    // Half-days deduct real money, and a heavy count usually means missing
    // punch-outs rather than genuine half-days. Warned, not blocked: only HR
    // can tell the two apart.
    if (halfDayCount > 0 && payable > 0 && halfDayCount / payable >= 2) {
      warnings.push(
        `${halfDayCount} half-days across ${payable} payable staff — unusually high. A missing punch-out records as a half-day and would under-pay. Check the biometric import before issuing.`,
      );
    }

    // The divisor. The paying institution's own month standard when it has one;
    // otherwise the largest among the dependencies, so the day rate is never
    // inflated by dividing by a short month.
    const own = ctx.lockedPeriodByInstitution.get(ctx.institutionId);
    const allLocked = Array.from(ctx.lockedPeriodByInstitution.values());
    const workingDaysBasis =
      own?.workingDays ??
      (allLocked.length > 0 ? Math.max(...allLocked.map((p) => p.workingDays)) : null);

    if (blockers.length === 0 && (!workingDaysBasis || workingDaysBasis <= 0)) {
      blockers.push(
        `The closed month for ${ctx.organisationName} reports no working days, so a day rate cannot be calculated. Reopen and re-close the month.`,
      );
    }

    const { data: existing } = await (supabase as any)
      .from('hr_salary_register_runs')
      .select('id')
      .eq('hr_organization_id', input.hrOrganizationId)
      .eq('period_year', year)
      .eq('period_month', month)
      .is('superseded_at', null)
      .maybeSingle();

    return {
      hr_organization_id: input.hrOrganizationId,
      institution_id: ctx.institutionId,
      organisation_name: ctx.organisationName,
      period_year: year,
      period_month: month,
      can_generate: blockers.length === 0,
      blockers,
      warnings,
      roster_count: ctx.roster.length,
      payable_count: payable,
      missing_salary_count: missingSalary,
      missing_bank_count: missingBank,
      missing_payer_count: missingPayer,
      unprocessed_days: unprocessedDays,
      half_day_count: halfDayCount,
      dependencies: ctx.dependencies,
      working_days_basis: workingDaysBasis,
      existing_run_id: existing?.id ?? null,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Generate
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Freeze a register for one payer-organisation month.
   *
   * Refuses unless preflight passes — the same verdict the UI showed,
   * re-evaluated server-side so a stale page cannot generate over an open month.
   */
  static async generate(
    supabase: SupabaseClient,
    input: SalaryRegisterInput,
  ): Promise<{ run_id: string; included: number; excluded: number }> {
    const pre = await SalaryRegisterService.preflight(supabase, input);
    if (!pre.can_generate) {
      throw new Error(pre.blockers.join(' '));
    }

    const ctx = await SalaryRegisterService.loadContext(supabase, input);
    const runBasis = pre.working_days_basis as number;

    // Names for the Remarks column of anyone paid on their own week. One query
    // for the whole run; an unreadable name only blanks the remark.
    const patternIds = Array.from(
      new Set(
        Array.from(ctx.summaryByStaff.values())
          .map((s) => s.work_pattern_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const patternNameById = new Map<string, string>();
    if (patternIds.length > 0) {
      const { data: patterns, error: patternErr } = await (supabase as any)
        .from('hr_work_patterns')
        .select('id, name')
        .in('id', patternIds);
      if (patternErr) {
        throw new Error(`Failed to load work pattern names: ${getErrorMessage(patternErr)}`);
      }
      for (const p of (patterns ?? []) as Array<{ id: string; name: string }>) {
        patternNameById.set(p.id, p.name);
      }
    }

    /**
     * Working days per SOURCE MONTH, so each person is measured against the
     * calendar they actually worked.
     *
     * Almost always one entry, and then every row carries the same figure —
     * exactly like the hand-kept register. It differs only for the 36 staff
     * paid by one institution and working at another, where a 5-day week and a
     * 6-day week meet: dividing a Main Office person's salary by Pharmacy's 22
     * would deduct for days Pharmacy never expected them to work.
     */
    const workingDaysByPeriod = new Map<string, number>();
    for (const p of ctx.lockedPeriodByInstitution.values()) {
      workingDaysByPeriod.set(p.id, p.workingDays);
    }

    const { data: userRes } = await supabase.auth.getUser();
    const generatedBy = userRes?.user?.id ?? null;

    const runId = crypto.randomUUID();
    const lines: Record<string, unknown>[] = [];

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let included = 0;
    let excluded = 0;
    let serial = 0;

    for (const member of ctx.roster) {
      serial++;
      const salary = ctx.salaryByStaff.get(member.staff_id);
      const summary = ctx.summaryByStaff.get(member.staff_id);

      const base = {
        run_id: runId,
        staff_id: member.staff_id,
        serial_no: serial,
        employee_code: member.employee_code,
        staff_name: member.staff_name || '(unnamed)',
        designation: member.designation,
        department_name: member.department_name,
        date_of_joining: member.date_of_joining,
        bank_account_number: ctx.bankByStaff.get(member.staff_id) ?? null,
        attendance_period_id: summary?.period_id ?? null,
        // WHO BEARS THIS SALARY. Snapshotted with the rest of the identity so a
        // payer reassignment cannot rewrite an issued register. Null is a real
        // answer, not a gap in the code — 105 active staff have no payer
        // recorded, and they are still paid and still listed.
        paid_by_organization_id: ctx.payerByStaff.get(member.staff_id)?.id ?? null,
        paid_by_name: ctx.payerByStaff.get(member.staff_id)?.name ?? null,
      };

      // Exclusion order matters: report the FIRST thing HR has to fix, not all
      // of them at once. Attendance before salary — a person with neither needs
      // the month closed before their salary is worth entering.
      let reason: SalaryRegisterExclusionReason | null = null;
      if (!summary) reason = 'no_attendance_summary';
      else if (salary === undefined) reason = 'no_salary_recorded';
      else if (salary <= 0) reason = 'salary_is_zero';

      if (reason) {
        excluded++;
        // Same keys as an included row — see ZERO_FIGURES. A batch whose objects
        // differ in shape sends NULLs for the gaps and fails on NOT NULL.
        lines.push({
          ...base,
          ...ZERO_FIGURES,
          adjustment_amount: 0,
          is_included: false,
          exclusion_reason: reason,
          // Same key set as an included row — see the batch-shape note above.
          remarks: null,
        });
        continue;
      }

      const s = summary as AttendanceSummaryRow;
      const statutory = ctx.statutoryByStaff.get(member.staff_id);
      // A person on a work pattern is measured against THEIR week (see
      // registerBasisFor); everyone else against the source month's standard.
      const basis = registerBasisFor(s, workingDaysByPeriod.get(s.period_id) || runBasis);
      const patternName = s.work_pattern_id ? patternNameById.get(s.work_pattern_id) : undefined;
      const figures = computeRegisterLine({
        monthlyGross: salary as number,
        workingDaysBasis: basis,
        epfAmount: statutory?.epf ?? 0,
        esiAmount: statutory?.esi ?? 0,
        allowance: statutory?.allowance ?? 0,
        tdsAmount: statutory?.tds ?? 0,
        summary: s,
      });

      included++;
      totalGross += figures.total_earnings;
      totalDeductions += figures.total_deductions;
      totalNet += figures.net_pay;

      lines.push({
        ...base,
        ...figures,
        // The register HR reads has no other place to say WHY this row's
        // Business Working Days differs from the rest of the sheet.
        remarks: s.work_pattern_id ? `Work pattern: ${patternName ?? 'yes'}` : null,
        adjustment_amount: 0,
        is_included: true,
        exclusion_reason: null,
      });
    }

    // ORDER IS LOAD-BEARING. superseded_at frees the partial unique index and
    // needs no FK, so it can be set before the replacement exists; superseded_by
    // cannot. See 20260830150001. Reversing these leaves two live runs.
    const priorRunId = pre.existing_run_id;
    if (priorRunId) {
      const { error: supErr } = await (supabase as any)
        .from('hr_salary_register_runs')
        .update({ superseded_at: new Date().toISOString() })
        .eq('id', priorRunId)
        .is('superseded_at', null);

      if (supErr) {
        throw new Error(`Failed to supersede the previous register: ${getErrorMessage(supErr)}`);
      }
    }

    const { error: runErr } = await (supabase as any)
      .from('hr_salary_register_runs')
      .insert({
        id: runId,
        hr_organization_id: input.hrOrganizationId,
        institution_id: ctx.institutionId,
        period_year: input.year,
        period_month: input.month,
        // The PAYING institution's month standard. Individual rows may divide
        // by their own work location's figure instead — see the loop above —
        // so this is the header's reference, not necessarily every row's.
        working_days_basis: runBasis,
        source_attendance_period_ids: Array.from(ctx.lockedPeriodByInstitution.values()).map((p) => p.id),
        staff_total: ctx.roster.length,
        included_count: included,
        excluded_count: excluded,
        total_gross: round2(totalGross),
        total_deductions: round2(totalDeductions),
        total_net: round2(totalNet),
        generated_by: generatedBy,
      });

    if (runErr) throw new Error(`Failed to create the register: ${getErrorMessage(runErr)}`);

    for (const batch of chunk(lines, 200)) {
      const { error: lineErr } = await (supabase as any)
        .from('hr_salary_register_lines')
        .insert(batch);

      // Roll the header back so a half-written register cannot be exported.
      // The lines cascade with it.
      if (lineErr) {
        await (supabase as any).from('hr_salary_register_runs').delete().eq('id', runId);
        if (priorRunId) {
          await (supabase as any)
            .from('hr_salary_register_runs')
            .update({ superseded_at: null })
            .eq('id', priorRunId);
        }
        throw new Error(`Failed to write the register rows: ${getErrorMessage(lineErr)}`);
      }
    }

    // Provenance, best-effort. A failure here leaves the previous run superseded
    // without a forward pointer, which is degraded history, not a wrong register.
    if (priorRunId) {
      await (supabase as any)
        .from('hr_salary_register_runs')
        .update({ superseded_by: runId })
        .eq('id', priorRunId);
    }

    return { run_id: runId, included, excluded };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Reads
  // ───────────────────────────────────────────────────────────────────────

  static async listRuns(
    supabase: SupabaseClient,
    filters: { hrOrganizationId?: string; year?: number; includeSuperseded?: boolean } = {},
  ): Promise<HRSalaryRegisterRun[]> {
    let q = (supabase as any)
      .from('hr_salary_register_runs')
      .select('*')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(200);

    // `??`, never `||`: `||` coerces undefined to '' which travels as a real
    // parameter and matches zero rows.
    if (filters.hrOrganizationId) q = q.eq('hr_organization_id', filters.hrOrganizationId);
    if (filters.year !== undefined) q = q.eq('period_year', filters.year);
    if (!filters.includeSuperseded) q = q.is('superseded_at', null);

    const { data, error } = await q;
    if (error) throw new Error(`Failed to load registers: ${getErrorMessage(error)}`);

    return ((data ?? []) as any[]).map(SalaryRegisterService.mapRun);
  }

  static async getRunDetail(
    supabase: SupabaseClient,
    runId: string,
  ): Promise<SalaryRegisterRunDetail> {
    const { data: run, error: runErr } = await (supabase as any)
      .from('hr_salary_register_runs')
      .select('*, hr_organizations:hr_organization_id(name), institutions:institution_id(name)')
      .eq('id', runId)
      .maybeSingle();

    if (runErr) throw new Error(`Failed to load the register: ${getErrorMessage(runErr)}`);
    if (!run) throw new Error('That register does not exist, or is not visible to this account.');

    const { data: lineRows, error: lineErr } = await (supabase as any)
      .from('hr_salary_register_lines')
      .select('*')
      .eq('run_id', runId)
      .order('serial_no', { ascending: true })
      .limit(5000);

    if (lineErr) throw new Error(`Failed to load the register rows: ${getErrorMessage(lineErr)}`);

    return {
      run: SalaryRegisterService.mapRun(run),
      lines: ((lineRows ?? []) as any[]).map(SalaryRegisterService.mapLine),
      organisation_name: run.hr_organizations?.name ?? 'Unknown',
      institution_name: run.institutions?.name ?? 'Unknown',
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Adjustment
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Record a one-off correction and/or a remark against one register row.
   *
   * The adjustment is SUBTRACTED from net pay, matching the sample register
   * where a prior month's over-payment is recovered ("may month cpl issue one
   * day salary deducted"). A negative amount therefore pays extra.
   *
   * Refused on a superseded run: history is not editable.
   */
  static async updateLine(
    supabase: SupabaseClient,
    lineId: string,
    patch: { adjustmentAmount?: number; remarks?: string | null },
  ): Promise<HRSalaryRegisterLine> {
    const { data: line, error: readErr } = await (supabase as any)
      .from('hr_salary_register_lines')
      .select('*, hr_salary_register_runs:run_id(id, superseded_at)')
      .eq('id', lineId)
      .maybeSingle();

    if (readErr) throw new Error(`Failed to load the register row: ${getErrorMessage(readErr)}`);
    if (!line) throw new Error('That register row does not exist, or is not visible to this account.');

    if (line.hr_salary_register_runs?.superseded_at) {
      throw new Error('This register has been superseded by a newer generation and can no longer be edited.');
    }
    if (!line.is_included) {
      throw new Error('This person was excluded from the register, so there is nothing to adjust. Fix the underlying cause and regenerate.');
    }

    const adjustment = patch.adjustmentAmount === undefined
      ? num(line.adjustment_amount)
      : round2(patch.adjustmentAmount);

    const netPay = Math.round(num(line.total_earnings) - num(line.total_deductions) - adjustment);

    const update: Record<string, unknown> = { adjustment_amount: adjustment, net_pay: netPay };
    if (patch.remarks !== undefined) {
      const trimmed = patch.remarks?.trim();
      update.remarks = trimmed ? trimmed : null;
    }

    const { data: updated, error: updErr } = await (supabase as any)
      .from('hr_salary_register_lines')
      .update(update)
      .eq('id', lineId)
      .select('*')
      .maybeSingle();

    if (updErr) throw new Error(`Failed to save the adjustment: ${getErrorMessage(updErr)}`);
    if (!updated) throw new Error('The adjustment was not saved — this account may not hold hr.payroll.register.manage.');

    await SalaryRegisterService.recomputeRunTotals(supabase, line.run_id);

    return SalaryRegisterService.mapLine(updated);
  }

  /**
   * Re-sum the run header from its own rows.
   *
   * Recomputed from the lines rather than adjusted by a delta: a delta drifts
   * the moment any write is retried, and the totals are what the export's
   * footer and the bank sheet reconcile against.
   */
  private static async recomputeRunTotals(supabase: SupabaseClient, runId: string): Promise<void> {
    const { data, error } = await (supabase as any)
      .from('hr_salary_register_lines')
      .select('total_earnings, total_deductions, adjustment_amount, net_pay, is_included')
      .eq('run_id', runId)
      .limit(5000);

    if (error) throw new Error(`Failed to re-total the register: ${getErrorMessage(error)}`);

    let gross = 0;
    let deductions = 0;
    let net = 0;
    let included = 0;

    for (const l of (data ?? []) as any[]) {
      if (!l.is_included) continue;
      included++;
      gross += num(l.total_earnings);
      deductions += num(l.total_deductions) + num(l.adjustment_amount);
      net += num(l.net_pay);
    }

    const { error: updErr } = await (supabase as any)
      .from('hr_salary_register_runs')
      .update({
        total_gross: round2(gross),
        total_deductions: round2(deductions),
        total_net: round2(net),
        included_count: included,
      })
      .eq('id', runId);

    if (updErr) throw new Error(`Failed to save the register totals: ${getErrorMessage(updErr)}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Mappers — numeric arrives from PostgREST as a string
  // ───────────────────────────────────────────────────────────────────────

  private static mapRun(r: any): HRSalaryRegisterRun {
    return {
      ...r,
      working_days_basis: num(r.working_days_basis),
      source_attendance_period_ids: r.source_attendance_period_ids ?? [],
      staff_total: num(r.staff_total),
      included_count: num(r.included_count),
      excluded_count: num(r.excluded_count),
      total_gross: num(r.total_gross),
      total_deductions: num(r.total_deductions),
      total_net: num(r.total_net),
    } as HRSalaryRegisterRun;
  }

  private static mapLine(l: any): HRSalaryRegisterLine {
    return {
      ...l,
      serial_no: num(l.serial_no),
      business_working_days: num(l.business_working_days),
      paid_leave_days: num(l.paid_leave_days),
      unpaid_leave_days: num(l.unpaid_leave_days),
      on_duty_days: num(l.on_duty_days),
      worked_days: num(l.worked_days),
      paid_days: num(l.paid_days),
      actual_gross: num(l.actual_gross),
      basic_pay: num(l.basic_pay),
      unpaid_leave_deduction: num(l.unpaid_leave_deduction),
      total_earnings: num(l.total_earnings),
      total_deductions: num(l.total_deductions),
      adjustment_amount: num(l.adjustment_amount),
      net_pay: num(l.net_pay),
    } as HRSalaryRegisterLine;
  }
}
