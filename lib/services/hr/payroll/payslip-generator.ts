/**
 * T4.4 — Payslip Generation Engine
 *
 * Orchestrates payslip generation for a payroll period:
 *   1. Load active staff PAID BY the period's organisation (hr_staff_payroll)
 *   2. Look up each staff member's pay scale (by designation/cadre)
 *   3. Calculate earnings from pay components
 *   4. Apply LOP adjustment from the CLOSED attendance month
 *   5. Run DeductionEngine for PF/ESI/TDS/PT on the LOP-adjusted basic/gross
 *   6. Insert hr_payslips + hr_payslip_line_items
 *   7. Update period aggregates (total_gross, total_deductions, total_net, staff_count)
 *
 * ── LOSS OF PAY (2026-09-29) ──────────────────────────────────────────────
 *
 * This engine used to carry `const lopDays = 0`, which paid everybody as if
 * they had been present every working day of the month. It now reads the day
 * counts frozen when each person's WORK LOCATION closed the attendance month
 * (hr_attendance_period_summaries behind a LOCKED hr_attendance_periods row)
 * and pays for the days the month actually pays for.
 *
 * The arithmetic lives in lib/hr/payroll/lop-engine.ts and is the same
 * calendar-pay-anchor / working-day-divisor rule the shipped salary register
 * already pays by. Two screens must not disagree about one person's pay.
 *
 * NOBODY IS PAID FROM A GUESS. A person whose work location has not closed the
 * month, who has no record in the closed month, or whose month records no
 * working days is SKIPPED with a stated reason — never paid a full month by
 * default and never docked on data nobody has judged.
 *
 * Design locks (T4.0, 2026-05-24):
 *   - Staff scope: all active staff whose RECORDED PAYER is this organisation.
 *     Revised 2026-07-31: was "all active staff in institution", which read
 *     staff.institution_id — that column now means WHERE SOMEONE WORKS, and a
 *     person's work location is not who bears their salary. No payroll row =
 *     no recorded payer = excluded from every run until HR records one.
 *   - Deductions: auto-calculate with manual override (override is a separate PATCH)
 *   - PDF: deferred to T4.5
 *   - Bank file: deferred (user will share format spec)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeDeductions,
  loadPayrollPolicies,
  type DeductionResult,
} from './deduction-engine';
import {
  applyLop,
  capDeductionsToGross,
  computeLopDays,
  LOP_SKIP_REASONS,
  type LopEarning,
} from '@/lib/hr/payroll/lop-engine';
// The basis rule (per-person scheduled days, falling back to the month's mode)
// is DEFINED ONCE, in the salary register, and imported here rather than
// restated. Two copies of a rule that decides pay drift, and the drift is
// invisible until somebody is paid twice for the same month on two screens.
import { registerBasisFor } from './salary-register-service';

interface StaffPayInfo {
  id: string;
  first_name: string;
  last_name: string;
  institution_id: string;
}

/**
 * designation_id / cadre_id live on hr_staff_details, NOT on staff.
 * Loaded as a separate lookup (never an `!inner` embed) because a large share of
 * staff rows have no hr_staff_details row at all — those people must still appear
 * in the run and be reported as skipped, not silently dropped.
 */
interface StaffHrMapping {
  designation_id: string | null;
  cadre_id: string | null;
}

interface PayScale {
  id: string;
  basic_pay: number;
  grade_pay: number;
}

interface PayComponent {
  id: string;
  code: string;
  component_type: string;
  calculation_basis: string;
  default_amount_or_percent: number;
}

export interface GenerationResult {
  generated: number;
  skipped: number;
  errors: { staff_id: string; name: string; reason: string }[];
  totals: { gross: number; deductions: number; net: number };
  /** Things a human must look at before trusting the run. Never fatal. */
  warnings: string[];
  /** LOP days summed across everybody paid in this run. 0 = nobody was absent. */
  lopDays: number;
}

/**
 * The frozen day counts for one person in one closed attendance month.
 * A subset of hr_attendance_period_summaries — only the columns that decide pay
 * or that a human needs in order to check it.
 */
interface AttendanceDayCounts {
  payable_days: number;
  scheduled_days: number | null;
  unprocessed_days: number;
  present_days: number;
  leave_days: number;
  on_duty_days: number;
  comp_off_days: number;
}

/** One line of the before-you-pay preview. */
export interface LopPreviewRow {
  staff_id: string;
  name: string;
  /** Where this person works — the location whose attendance month governs them. */
  work_institution_id: string;
  payable: boolean;
  /** Present on a skipped row; says what a human has to fix. */
  reason: string | null;
  business_working_days: number;
  paid_days: number;
  lop_days: number;
  /** Days the attendance evaluator could not judge. Counted as unpaid, like the register. */
  unprocessed_days: number;
  full_gross: number;
  /** The rupee cost of the absence: full gross minus gross after LOP. */
  lop_amount: number;
  gross_after_lop: number;
  total_deductions: number;
  net_pay: number;
}

/** What the preview screen renders. Computed by the SAME code path as a real run. */
export interface LopPreviewResult {
  period: {
    id: string;
    period_year: number;
    period_month: number;
    status: string;
    engine_type: string;
    institution_id: string;
  };
  rows: LopPreviewRow[];
  payable_count: number;
  skipped_count: number;
  /**
   * People left off ONLY because their work location has not locked this
   * month's attendance. The one number the "lock attendance first" advice
   * depends on — zero means that advice does not apply to this run.
   */
  month_not_closed_count: number;
  total_lop_days: number;
  totals: {
    full_gross: number;
    lop_amount: number;
    gross_after_lop: number;
    deductions: number;
    net: number;
  };
  warnings: string[];
}

/** Everything buildRun produces, whether it will be written or only shown. */
interface BuiltRun {
  period: Record<string, unknown> & {
    id: string;
    period_year: number;
    period_month: number;
    status: string;
    engine_type: string;
    institution_id: string;
    hr_organization_id: string;
  };
  payslipInserts: Record<string, unknown>[];
  lineItemInserts: Record<string, unknown>[];
  result: GenerationResult;
  previewRows: LopPreviewRow[];
}

/**
 * The run was refused because the ACCOUNT lacks a permission — not because
 * anything is wrong with the payroll. Typed so a route can answer 403 with the
 * message as written, and keep 500 for real faults, without matching strings.
 */
export class PayrollPermissionError extends Error {
  readonly status = 403;
  readonly missingPermission: string;

  constructor(missingPermission: string, message: string) {
    super(message);
    this.name = 'PayrollPermissionError';
    this.missingPermission = missingPermission;
  }
}

/** A full hr_payroll_periods row, as `select('*')` returns it. */
export type PayrollPeriodRow = BuiltRun['period'];

/** Day counts are held to 2dp — half-days exist. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** PostgREST returns numeric as a string. Every figure is coerced through this. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v) || 0;
}

/** A run over nobody. Shape-identical to a real one so callers need no branch. */
function emptyRun(period: BuiltRun['period']): BuiltRun {
  return {
    period,
    payslipInserts: [],
    lineItemInserts: [],
    result: {
      generated: 0,
      skipped: 0,
      errors: [],
      totals: { gross: 0, deductions: 0, net: 0 },
      warnings: [],
      lopDays: 0,
    },
    previewRows: [],
  };
}

export class PayslipGenerator {
  /**
   * Generate payslips for every active staff member whose recorded payer is
   * this period's organisation (hr_staff_payroll), not everyone who works there.
   * Period must be in 'prepared' status (draft → prepared transition triggers generation).
   */
  static async generate(
    supabase: SupabaseClient,
    periodId: string,
  ): Promise<GenerationResult> {
    // 1. Load the period
    const { data: period, error: periodErr } = await (supabase as any)
      .from('hr_payroll_periods')
      .select('*')
      .eq('id', periodId)
      .single();

    if (periodErr || !period) {
      throw new Error(`Period not found: ${periodErr?.message ?? 'null'}`);
    }

    if (period.status !== 'prepared') {
      throw new Error(`Period must be in 'prepared' status to generate payslips. Current: ${period.status}`);
    }

    // 2. Check for existing non-superseded payslips (idempotency guard)
    const { count: existingCount } = await (supabase as any)
      .from('hr_payslips')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', periodId)
      .is('superseded_by', null);

    if ((existingCount ?? 0) > 0) {
      throw new Error(`Period already has ${existingCount} active payslips. Delete or supersede them first.`);
    }

    const built = await this.buildRun(supabase, period);
    await this.persist(supabase, periodId, built);
    return built.result;
  }

  /**
   * What a real run WOULD pay, without writing anything.
   *
   * THE SAME CODE PATH AS `generate`. The preview and the run cannot disagree,
   * because there is only one computation and only `persist` is skipped. A
   * preview computed by a second, parallel implementation is worth nothing —
   * the first time the two drift, the screen a human checked stops describing
   * the payroll that was actually produced.
   *
   * Works on a period in ANY status, so the effect of absence can be inspected
   * while the period is still a draft. Writes nothing, ever.
   *
   * Pass the period row when the caller has already read it (the preview route
   * has, to check the college), so it is not fetched twice; pass an id otherwise.
   */
  static async previewLop(
    supabase: SupabaseClient,
    periodOrId: string | PayrollPeriodRow,
  ): Promise<LopPreviewResult> {
    let period: PayrollPeriodRow;
    if (typeof periodOrId === 'string') {
      const { data, error: periodErr } = await (supabase as any)
        .from('hr_payroll_periods')
        .select('*')
        .eq('id', periodOrId)
        .single();

      if (periodErr || !data) {
        throw new Error(`Period not found: ${periodErr?.message ?? 'null'}`);
      }
      period = data as PayrollPeriodRow;
    } else {
      period = periodOrId;
    }

    const built = await this.buildRun(supabase, period);
    const payable = built.previewRows.filter((r) => r.payable);

    return {
      period: {
        id: period.id,
        period_year: period.period_year,
        period_month: period.period_month,
        status: period.status,
        engine_type: period.engine_type,
        institution_id: period.institution_id,
      },
      rows: built.previewRows,
      payable_count: payable.length,
      skipped_count: built.previewRows.length - payable.length,
      month_not_closed_count: built.previewRows.filter(
        (r) => !r.payable && r.reason === LOP_SKIP_REASONS.monthNotClosed,
      ).length,
      total_lop_days: round2(payable.reduce((t, r) => t + r.lop_days, 0)),
      totals: {
        full_gross: payable.reduce((t, r) => t + r.full_gross, 0),
        lop_amount: payable.reduce((t, r) => t + r.lop_amount, 0),
        gross_after_lop: payable.reduce((t, r) => t + r.gross_after_lop, 0),
        deductions: payable.reduce((t, r) => t + r.total_deductions, 0),
        net: payable.reduce((t, r) => t + r.net_pay, 0),
      },
      warnings: built.result.warnings,
    };
  }

  /**
   * Compute one run: load everybody, work out their pay, produce the rows a
   * write would insert. WRITES NOTHING.
   */
  private static async buildRun(
    supabase: SupabaseClient,
    period: BuiltRun['period'],
  ): Promise<BuiltRun> {
    const periodId = period.id;

    // 3. Load the active staff PAID BY this period's organisation.
    //
    // The payer comes from hr_staff_payroll, NOT from staff.institution_id.
    // Since 2026-07-31 staff.institution_id means WHERE SOMEONE WORKS, so
    // reading it here would pay the wrong people the moment a central officer's
    // work location is corrected — the CEO is paid by Engineering but works at
    // Main Office, and correcting that would move them into Main Office's run.
    //
    // Someone with NO hr_staff_payroll row has no recorded payer and is
    // deliberately NOT swept into any run: they surface in the "payer not
    // recorded" queue instead, so HR records the answer rather than a payroll
    // run guessing it. That is the state of everyone whose work location does
    // not run a payroll (the shared campus-services team at Main Office).
    const { data: payerRows, error: payerErr } = await (supabase as any)
      .from('hr_staff_payroll')
      .select('staff_id')
      .eq('hr_organization_id', period.hr_organization_id);

    if (payerErr) throw new Error(`Failed to load payroll assignments: ${payerErr.message}`);

    const payeeIds: string[] = (payerRows ?? []).map((r: { staff_id: string }) => r.staff_id);

    // hr_staff_payroll is gated on hr.payroll.institution.view, so an operator
    // without that key reads ZERO rows and NO error — indistinguishable from
    // "nobody here has a payer recorded yet". Those two demand OPPOSITE actions,
    // so ask directly rather than infer from emptiness. Same reasoning as the
    // hr_staff_details check below; only runs in the degenerate case.
    if (payeeIds.length === 0) {
      const { data: canSeePayroll } = await (supabase as any).rpc('user_has_permission', {
        permission_name: 'hr.payroll.institution.view',
      });
      if (!canSeePayroll) {
        throw new PayrollPermissionError(
          'hr.payroll.institution.view',
          'Cannot read payroll organisation assignments: this account is missing hr.payroll.institution.view. Generating here would produce zero payslips and look like an empty organisation. Ask an administrator to grant it.',
        );
      }
      return emptyRun(period);
    }

    // Chunked for the same reason as hr_staff_details below: a single `.in()`
    // over a whole organisation can truncate silently, and the `in.(...)` list
    // inflates the query string past what a proxy will accept.
    const STAFF_CHUNK = 100;
    const staffList: StaffPayInfo[] = [];

    for (let i = 0; i < payeeIds.length; i += STAFF_CHUNK) {
      const { data: chunk, error: staffErr } = await supabase
        .from('staff')
        .select('id, first_name, last_name, institution_id')
        .in('id', payeeIds.slice(i, i + STAFF_CHUNK))
        .eq('is_active', true);

      // Abort rather than continue: a partial staff read produces a PARTIAL
      // payroll run that reports success, which is not obvious until somebody
      // is paid twice on the rerun.
      if (staffErr) throw new Error(`Failed to load team members: ${staffErr.message}`);
      staffList.push(...((chunk ?? []) as StaffPayInfo[]));
    }

    if (staffList.length === 0) {
      return emptyRun(period);
    }

    // 3b. Load designation/cadre mapping from hr_staff_details (separate query, not an embed).
    //
    // Chunked deliberately. A single `.in()` over a whole institution has two silent
    // failure modes: PostgREST caps the rows it returns, so a big institution would
    // truncate and the missing people would be misreported as "no HR record"; and the
    // `in.(...)` list inflates the query string (156 ids already costs ~5.8KB), which a
    // proxy can reject outright. Chunking removes both without changing the result.
    const staffIds = (staffList as StaffPayInfo[]).map((s) => s.id);
    const HR_DETAILS_CHUNK = 100;
    const hrMappingByStaffId = new Map<string, StaffHrMapping>();

    for (let i = 0; i < staffIds.length; i += HR_DETAILS_CHUNK) {
      const { data: hrDetails, error: hrDetailsErr } = await (supabase as any)
        .from('hr_staff_details')
        .select('staff_id, designation_id, cadre_id')
        .in('staff_id', staffIds.slice(i, i + HR_DETAILS_CHUNK));

      // Abort the whole run if any chunk fails to read. Carrying on would generate
      // payslips for the people whose chunk already loaded and skip everyone after —
      // a PARTIAL payroll run that reports success. A failed run is obvious and
      // recoverable; a partial one is not obvious until somebody is paid twice on the
      // rerun. This is the one place where failing loudly beats degrading.
      if (hrDetailsErr) {
        throw new Error(`Failed to load HR team member details: ${hrDetailsErr.message}`);
      }

      // staff_id is the PRIMARY KEY of hr_staff_details, so one row per person: no
      // last-write-wins ambiguity in this Map.
      for (const d of (hrDetails ?? [])) {
        hrMappingByStaffId.set(d.staff_id, {
          designation_id: d.designation_id ?? null,
          cadre_id: d.cadre_id ?? null,
        });
      }
    }

    // This runs on the caller's RLS-scoped client, and hr_staff_details is tenant-gated
    // by `hr_organization_id = auth_hr_organization_id()`, which reads the caller's row
    // in user_hr_access. An operator without such a row gets ZERO rows and NO error.
    //
    // An empty result is therefore ambiguous — "nobody here has a record yet" and "you
    // are not allowed to see them" look identical — and the two demand OPPOSITE actions.
    // Do not infer which it is from emptiness: a brand-new organisation legitimately has
    // no records, and telling its HR team to stop creating them would dead-end go-live.
    // Ask directly instead. Only runs in the already-degenerate case, so it costs nothing
    // on a normal run.
    let hrDetailsUnreadable = false;
    if (hrMappingByStaffId.size === 0 && staffIds.length > 0) {
      const [{ data: hrOrgId }, { data: isSuperAdmin }] = await Promise.all([
        (supabase as any).rpc('auth_hr_organization_id'),
        (supabase as any).rpc('is_super_admin'),
      ]);
      // A super admin bypasses the policy, so an empty result for them is genuinely empty.
      hrDetailsUnreadable = !isSuperAdmin && !hrOrgId;
    }

    // 4. Load pay scales for the institution (keyed by designation_id)
    const { data: payScales } = await (supabase as any)
      .from('hr_pay_scales')
      .select('id, designation_id, cadre_id, basic_pay, grade_pay')
      .eq('hr_organization_id', period.hr_organization_id)
      .is('superseded_by', null);

    const scaleByDesignation = new Map<string, PayScale>();
    const scaleByCadre = new Map<string, PayScale>();
    for (const s of (payScales ?? [])) {
      if (s.designation_id) scaleByDesignation.set(s.designation_id, s);
      if (s.cadre_id) scaleByCadre.set(s.cadre_id, s);
    }

    // 5. Load active pay components for the institution
    const { data: components } = await (supabase as any)
      .from('hr_pay_components')
      .select('id, code, component_type, calculation_basis, default_amount_or_percent, applies_to_engine_types')
      .eq('institution_id', period.institution_id)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    const earningComponents = (components ?? []).filter(
      (c: PayComponent) =>
        c.component_type === 'earning' &&
        (c as any).applies_to_engine_types?.includes(period.engine_type),
    );

    // 6. Load payroll policies for deduction calculation
    const policies = await loadPayrollPolicies(period.institution_id);
    if (!policies) {
      throw new Error('Payroll policies not configured for this institution. Configure PF/ESI/TDS/PT policies first.');
    }

    // 6b. The CLOSED attendance months and the day counts frozen inside them.
    //
    // One month per WORK LOCATION, not one for the payer: attendance is closed
    // where somebody actually works, and this organisation pays people who work
    // at several locations. staff.institution_id has meant WHERE SOMEONE WORKS
    // since 2026-07-31, so it is the right key here (and the wrong one for
    // deciding who is paid, which is why the roster above comes from
    // hr_staff_payroll instead).
    const lop = await this.loadAttendance(supabase, period, staffList as StaffPayInfo[]);

    // 7. Generate payslips for each staff member
    const result: GenerationResult = {
      generated: 0,
      skipped: 0,
      errors: [],
      totals: { gross: 0, deductions: 0, net: 0 },
      warnings: [],
      lopDays: 0,
    };

    if (lop.summariesUnreadable) {
      throw new PayrollPermissionError(
        'hr.attendance.period.view',
        'Cannot read the closed month’s day counts: this account is missing hr.attendance.period.view. Without it the account sees at most its own row, so everybody else would be skipped as "no attendance record", which is indistinguishable from the month having no records — and the difference decides whether anyone gets paid. Ask an administrator to grant it.',
      );
    }

    const payslipInserts: any[] = [];
    const lineItemInserts: any[] = [];
    const previewRows: LopPreviewRow[] = [];
    let unprocessedDaysAcrossRun = 0;
    let zeroPaidDayPeople = 0;
    const droppedDeductionPeople: string[] = [];

    /**
     * Record one person as not payable, with the reason a human has to act on.
     *
     * Every skip lands in BOTH places: `result.errors`, which HR works as a
     * backlog, and `previewRows`, so the preview screen shows the whole roster
     * rather than only the people who happened to be payable. A person missing
     * from the preview is the one failure mode nobody notices.
     */
    const skip = (staff: StaffPayInfo, name: string, reason: string) => {
      result.skipped++;
      result.errors.push({ staff_id: staff.id, name, reason });
      previewRows.push({
        staff_id: staff.id,
        name,
        work_institution_id: staff.institution_id,
        payable: false,
        reason,
        business_working_days: 0,
        paid_days: 0,
        lop_days: 0,
        unprocessed_days: 0,
        full_gross: 0,
        lop_amount: 0,
        gross_after_lop: 0,
        total_deductions: 0,
        net_pay: 0,
      });
    };

    for (const staff of staffList as StaffPayInfo[]) {
      const name = `${staff.first_name} ${staff.last_name}`.trim();
      const hrMapping = hrMappingByStaffId.get(staff.id);

      // Distinguish the three blockers so HR can work the backlog by reason.
      if (!hrMapping) {
        // Backing table for this reason is hr_staff_details.
        skip(
          staff,
          name,
          hrDetailsUnreadable
            ? 'HR records are not visible to this account — grant it HR organisation access, then rerun. Do not create records until then; they may already exist.'
            : 'No HR record for this team member — create one and set designation/cadre',
        );
        continue;
      }

      if (!hrMapping.designation_id && !hrMapping.cadre_id) {
        skip(
          staff,
          name,
          'HR record exists but designation and cadre are both unset',
        );
        continue;
      }

      // Find pay scale (try designation first, then cadre)
      const scale = (hrMapping.designation_id ? scaleByDesignation.get(hrMapping.designation_id) : null)
        ?? (hrMapping.cadre_id ? scaleByCadre.get(hrMapping.cadre_id) : null);

      if (!scale) {
        skip(
          staff,
          name,
          'No pay scale configured for this designation/cadre',
        );
        continue;
      }

      const basicPay = Number(scale.basic_pay) || 0;
      if (basicPay <= 0) {
        skip(
          staff,
          name,
          'Basic pay is 0',
        );
        continue;
      }

      // ── LOP: refuse before computing, never guess ──────────────────────
      //
      // Three ways the attendance data cannot answer "how much of this month
      // does this person get paid for". Each one skips the person. Paying a
      // full month instead would silently reinstate exactly the bug this
      // change exists to fix; docking days nobody has judged would be worse.
      const attendanceMonth = lop.lockedPeriodByInstitution.get(staff.institution_id);
      if (!attendanceMonth) {
        skip(staff, name, LOP_SKIP_REASONS.monthNotClosed);
        continue;
      }

      const dayCounts = lop.summaryByStaff.get(staff.id);
      if (!dayCounts) {
        skip(staff, name, LOP_SKIP_REASONS.noSummary);
        continue;
      }

      // The person's own full-month expectation, frozen at close; the month's
      // mode only for rows frozen before that column existed. Defined in the
      // salary register and imported, not restated.
      const basis = registerBasisFor(dayCounts, attendanceMonth.workingDays);
      const days = computeLopDays({ basis, payableDays: dayCounts.payable_days });

      if (days.basis <= 0) {
        skip(staff, name, LOP_SKIP_REASONS.basisMissing);
        continue;
      }

      // Calculate earnings from components (full month, before the LOP cut)
      const earnings: LopEarning[] = [];

      for (const comp of earningComponents) {
        let amount = 0;
        if (comp.code === 'BASIC') {
          amount = basicPay;
        } else if (comp.calculation_basis === 'percent_of_basic') {
          amount = Math.round((basicPay * Number(comp.default_amount_or_percent)) / 100);
        } else {
          amount = Number(comp.default_amount_or_percent) || 0;
        }
        if (amount > 0) {
          earnings.push({ component_id: comp.id, code: comp.code, amount });
        }
      }

      // LOP adjustment — every earning cut by paid-days / working-days.
      const pay = applyLop({ basicPay, earnings, factor: days.factor });

      // Run deduction engine on the LOP-ADJUSTED figures, so PF, ESI and the
      // professional-tax slab follow what the month actually earns.
      //
      // TAX CAVEAT, pre-existing and not changed here: computeTds ANNUALISES
      // the gross it is handed (this month × 12). A month with unpaid days is
      // therefore projected as if the whole year were docked the same way, and
      // withholds less income tax this month than the person's real annual
      // liability would call for. No year-to-date true-up exists in lib/ or
      // app/ to correct it later; Finance should know the monthly figure runs
      // low in a docked month.
      const deductions: DeductionResult = computeDeductions(
        { basicPay: pay.lopAdjustedBasic, grossPay: pay.lopAdjustedGross, paymentMode: 'neft' },
        policies,
      );

      // Professional tax is a FLAT slab, so on a fully-absent month the
      // deductions can exceed a gross of zero and net pay would go negative —
      // which hr_payslips forbids, and which would fail the batch insert for
      // EVERYBODY. Hold the total at the gross; the provident fund survives and
      // the tax is dropped first.
      const capped = capDeductionsToGross(deductions, pay.lopAdjustedGross);
      if (capped.dropped > 0) {
        droppedDeductionPeople.push(name);
      }

      const slipId = crypto.randomUUID();

      payslipInserts.push({
        id: slipId,
        period_id: periodId,
        staff_id: staff.id,
        engine_type: period.engine_type,
        // The CONTRACTUAL basic, deliberately not cut. The column has always
        // held the scale figure and other screens read it as such; what the
        // person is actually paid is gross_amount, which IS cut. lop_days and
        // working_days_attended next to it say why the two differ.
        basic_pay: basicPay,
        pay_scale_snapshot_id: scale.id,
        working_days_attended: days.paidDays,
        lop_days: days.lopDays,
        gross_amount: pay.lopAdjustedGross,
        total_deductions: capped.total,
        net_amount: capped.netPay,
        payment_mode: 'neft',
        correction_type: 'initial',
      });

      // Line items for each earning component, at their LOP-adjusted amounts,
      // so the lines on a payslip add up to the gross printed on it.
      for (const e of pay.adjustedEarnings) {
        lineItemInserts.push({
          slip_id: slipId,
          component_id: e.component_id,
          amount: e.amount,
          is_one_off: false,
        });
      }

      previewRows.push({
        staff_id: staff.id,
        name,
        work_institution_id: staff.institution_id,
        payable: true,
        reason: null,
        business_working_days: days.basis,
        paid_days: days.paidDays,
        lop_days: days.lopDays,
        unprocessed_days: dayCounts.unprocessed_days,
        full_gross: pay.fullGross,
        lop_amount: pay.lopAmount,
        gross_after_lop: pay.lopAdjustedGross,
        total_deductions: capped.total,
        net_pay: capped.netPay,
      });

      unprocessedDaysAcrossRun += dayCounts.unprocessed_days;
      if (days.paidDays <= 0) zeroPaidDayPeople++;

      result.generated++;
      result.lopDays = round2(result.lopDays + days.lopDays);
      result.totals.gross += pay.lopAdjustedGross;
      result.totals.deductions += capped.total;
      result.totals.net += capped.netPay;
    }

    // Warnings, not refusals. Each one is a thing a human should look at; none
    // of them is a reason to stop a payroll that is otherwise computable.
    if (unprocessedDaysAcrossRun > 0) {
      result.warnings.push(
        `${round2(unprocessedDaysAcrossRun)} day(s) across this payroll could not be judged by the attendance evaluator. They are counted as unpaid — the same as on the salary register. Review them before paying.`,
      );
    }
    if (zeroPaidDayPeople > 0) {
      result.warnings.push(
        `${zeroPaidDayPeople} person(s) have no paid days in this month and will be paid nothing. Check that this is right before approving.`,
      );
    }
    if (droppedDeductionPeople.length > 0) {
      result.warnings.push(
        `Deductions had to be reduced for ${droppedDeductionPeople.length} person(s) because the month earns less than the fixed deductions: ${droppedDeductionPeople.slice(0, 5).join(', ')}${droppedDeductionPeople.length > 5 ? ', …' : ''}. Income tax is dropped first and the provident fund last; net pay is held at zero rather than going negative.`,
      );
    }
    const monthNotClosedCount = result.errors.filter(
      (e) => e.reason === LOP_SKIP_REASONS.monthNotClosed,
    ).length;
    if (monthNotClosedCount > 0) {
      result.warnings.push(
        `${monthNotClosedCount} person(s) are not on this payroll because their work location has not closed attendance for this month. HR: lock attendance for this month at each of those work locations before re-running this payroll.`,
      );
    }

    return { period, payslipInserts, lineItemInserts, result, previewRows };
  }

  /**
   * Write a built run. The ONLY place in this class that inserts a payslip.
   * `previewLop` never reaches it, which is what makes the preview safe.
   */
  private static async persist(
    supabase: SupabaseClient,
    periodId: string,
    built: BuiltRun,
  ): Promise<void> {
    const { payslipInserts, lineItemInserts, result } = built;

    // 8. Batch insert payslips
    if (payslipInserts.length > 0) {
      const { error: insertErr } = await (supabase as any)
        .from('hr_payslips')
        .insert(payslipInserts);

      if (insertErr) throw new Error(`Failed to insert payslips: ${insertErr.message}`);
    }

    // 9. Batch insert line items
    if (lineItemInserts.length > 0) {
      const { error: lineErr } = await (supabase as any)
        .from('hr_payslip_line_items')
        .insert(lineItemInserts);

      if (lineErr) throw new Error(`Failed to insert line items: ${lineErr.message}`);
    }

    // 10. Update period aggregates
    if (result.generated > 0) {
      await (supabase as any)
        .from('hr_payroll_periods')
        .update({
          total_gross: result.totals.gross,
          total_deductions: result.totals.deductions,
          total_net: result.totals.net,
          staff_count: result.generated,
        })
        .eq('id', periodId);
    }
  }

  /**
   * Load the CLOSED attendance month for every work location on this payroll,
   * and the day counts frozen inside it for these people.
   *
   * Only LOCKED months are collected. An open month is not a smaller number —
   * it is an unanswered question, and everybody under it is skipped by name.
   *
   * Read straight from hr_attendance_period_summaries rather than recomputed:
   * that is the entire point of freezing them at close, and it is how the
   * salary register reads them, so the two screens cannot disagree.
   */
  private static async loadAttendance(
    supabase: SupabaseClient,
    period: BuiltRun['period'],
    staffList: StaffPayInfo[],
  ): Promise<{
    lockedPeriodByInstitution: Map<string, { id: string; workingDays: number }>;
    summaryByStaff: Map<string, AttendanceDayCounts>;
    summariesUnreadable: boolean;
  }> {
    const lockedPeriodByInstitution = new Map<string, { id: string; workingDays: number }>();
    const summaryByStaff = new Map<string, AttendanceDayCounts>();

    const workInstitutionIds = Array.from(
      new Set(staffList.map((s) => s.institution_id).filter(Boolean)),
    );
    if (workInstitutionIds.length === 0) {
      return { lockedPeriodByInstitution, summaryByStaff, summariesUnreadable: false };
    }

    const { data: periodRows, error: periodErr } = await (supabase as any)
      .from('hr_attendance_periods')
      .select('id, institution_id, status, working_days_count')
      .in('institution_id', workInstitutionIds)
      .eq('period_year', period.period_year)
      .eq('period_month', period.period_month);

    // Abort rather than continue. A failed read here would skip EVERYBODY as
    // "month not closed", which reads like a real answer and is not one.
    if (periodErr) {
      throw new Error(`Failed to load the closed attendance months: ${periodErr.message}`);
    }

    for (const p of (periodRows ?? []) as Record<string, unknown>[]) {
      if (p.status === 'locked' && p.id) {
        lockedPeriodByInstitution.set(String(p.institution_id), {
          id: String(p.id),
          workingDays: num(p.working_days_count),
        });
      }
    }

    const lockedPeriodIds = Array.from(lockedPeriodByInstitution.values()).map((p) => p.id);
    if (lockedPeriodIds.length === 0) {
      return { lockedPeriodByInstitution, summaryByStaff, summariesUnreadable: false };
    }

    // READABILITY IS DECIDED FROM THE PERMISSION, NEVER FROM THE ROW COUNT.
    //
    // hr_attendance_period_summaries is readable with hr.attendance.period.view
    // OR for your OWN row (staff_id IN fn_my_staff_ids()). An operator without
    // the key gets no error and only the rows that are theirs: ZERO if they are
    // not on the payroll, exactly ONE if they are. Inferring "unreadable" from
    // an empty result misses the second case, and everybody else would then be
    // skipped as "no attendance record" when the real cause is a missing
    // permission. A partial read must never pass for "no record", so ask up
    // front, before reading anything.
    const [{ data: canSeePeriods }, { data: isSuperAdmin }] = await Promise.all([
      (supabase as any).rpc('user_has_permission', {
        permission_name: 'hr.attendance.period.view',
      }),
      (supabase as any).rpc('is_super_admin'),
    ]);
    if (!canSeePeriods && !isSuperAdmin) {
      return { lockedPeriodByInstitution, summaryByStaff, summariesUnreadable: true };
    }

    // Chunked for the same reason as every other `.in()` in this file: a single
    // list over a whole organisation can truncate at the PostgREST row cap, and
    // a truncated read here would dock a full month from people whose chunk was
    // dropped. Truncation must not be able to change anybody's pay.
    const staffIds = staffList.map((s) => s.id);
    const SUMMARY_CHUNK = 100;

    for (let i = 0; i < staffIds.length; i += SUMMARY_CHUNK) {
      const { data, error } = await (supabase as any)
        .from('hr_attendance_period_summaries')
        .select(
          'staff_id, payable_days, scheduled_days, unprocessed_days, present_days, leave_days, on_duty_days, comp_off_days',
        )
        .in('period_id', lockedPeriodIds)
        .in('staff_id', staffIds.slice(i, i + SUMMARY_CHUNK));

      if (error) {
        throw new Error(`Failed to load the frozen day counts: ${error.message}`);
      }

      for (const s of (data ?? []) as Record<string, unknown>[]) {
        summaryByStaff.set(String(s.staff_id), {
          payable_days: num(s.payable_days),
          scheduled_days: s.scheduled_days == null ? null : num(s.scheduled_days),
          unprocessed_days: num(s.unprocessed_days),
          present_days: num(s.present_days),
          leave_days: num(s.leave_days),
          on_duty_days: num(s.on_duty_days),
          comp_off_days: num(s.comp_off_days),
        });
      }
    }

    return { lockedPeriodByInstitution, summaryByStaff, summariesUnreadable: false };
  }

  /**
   * Override a single payslip's deduction amounts (manual adjustment).
   * Creates a new 'adjustment' payslip superseding the original.
   */
  static async overrideDeductions(
    supabase: SupabaseClient,
    slipId: string,
    overrides: { pf?: number; esi?: number; tds?: number; pt?: number },
    reason: string,
  ): Promise<{ newSlipId: string }> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Manual override requires a reason for audit trail');
    }

    // Load the existing payslip
    const { data: existing, error } = await (supabase as any)
      .from('hr_payslips')
      .select('*')
      .eq('id', slipId)
      .is('superseded_by', null)
      .single();

    if (error || !existing) throw new Error('Payslip not found or already superseded');

    const newTotalDeductions = (overrides.pf ?? 0) + (overrides.esi ?? 0) + (overrides.tds ?? 0) + (overrides.pt ?? 0);
    const newNetAmount = Number(existing.gross_amount) - newTotalDeductions;

    const newSlipId = crypto.randomUUID();

    // Insert the adjustment payslip
    const { error: insertErr } = await (supabase as any)
      .from('hr_payslips')
      .insert({
        id: newSlipId,
        period_id: existing.period_id,
        staff_id: existing.staff_id,
        engine_type: existing.engine_type,
        basic_pay: existing.basic_pay,
        pay_scale_snapshot_id: existing.pay_scale_snapshot_id,
        working_days_attended: existing.working_days_attended,
        lop_days: existing.lop_days,
        gross_amount: existing.gross_amount,
        total_deductions: newTotalDeductions,
        net_amount: newNetAmount,
        payment_mode: existing.payment_mode,
        correction_type: 'adjustment',
        reason,
      });

    if (insertErr) throw new Error(`Failed to create adjustment payslip: ${insertErr.message}`);

    // Supersede the original
    await (supabase as any)
      .from('hr_payslips')
      .update({ superseded_by: newSlipId })
      .eq('id', slipId);

    // Update period aggregates (re-sum from non-superseded payslips)
    const { data: activeSlips } = await (supabase as any)
      .from('hr_payslips')
      .select('gross_amount, total_deductions, net_amount')
      .eq('period_id', existing.period_id)
      .is('superseded_by', null);

    if (activeSlips) {
      const totals = activeSlips.reduce(
        (acc: any, s: any) => ({
          gross: acc.gross + Number(s.gross_amount),
          deductions: acc.deductions + Number(s.total_deductions),
          net: acc.net + Number(s.net_amount),
        }),
        { gross: 0, deductions: 0, net: 0 },
      );

      await (supabase as any)
        .from('hr_payroll_periods')
        .update({
          total_gross: totals.gross,
          total_deductions: totals.deductions,
          total_net: totals.net,
        })
        .eq('id', existing.period_id);
    }

    return { newSlipId };
  }
}
