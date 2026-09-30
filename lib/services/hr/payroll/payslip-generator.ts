/**
 * T4.4 — Payslip Generation Engine
 *
 * Orchestrates payslip generation for a payroll period:
 *   1. Load active staff PAID BY the period's organisation (hr_staff_payroll)
 *   2. Take each person's salary IN FORCE FOR THE MONTH from hr_staff_salaries
 *   3. Apply LOP adjustment from the CLOSED attendance month
 *   4. PF = the flat amount HR typed on the salary; ESI/TDS/PT from the
 *      DeductionEngine on the LOP-adjusted monthly gross
 *   5. Insert hr_payslips, with the deductions one by one
 *   6. Update period aggregates and keep the run's notes on the period
 *
 * ── PAY COMES FROM THE MONTHLY GROSS (Director rulings, 2026-09-30) ───────
 *
 * "Payslips: take pay from each person's current monthly gross
 * (hr_staff_salaries), unblocking payslips." Refined at 08:25 the same day:
 *   - Which month: the pay IN FORCE FOR THAT MONTH, by effective_from, not the
 *     latest row. The salary register follows the same month rule. Both call
 *     loadSalaryRowsInForce, so the two screens cannot disagree.
 *   - PF: the flat PF amount HR typed on the salary row (epf_amount), as the
 *     salary register does. No Basic is recorded anywhere; never guess one.
 *   - Allowance: PAY IT (monthly gross + allowance_amount), as the register.
 *
 * Until then this engine read a TABLE, hr_pay_scales, that no screen, service
 * or import can write (the pay-scales screen saves a platform_policies row named
 * hr.pay_scales instead). Every person was skipped as "No pay scale configured"
 * before any other logic ran, so no payslip could ever be produced.
 *
 * NO BASIC IS RECORDED PER PERSON ANYWHERE TODAY. hr_staff_salaries has no
 * basic column; its import sheet's "Basic_Salary" is stored as monthly_gross
 * because it is the WHOLE monthly pay (20260821191000 states this); the
 * pay-scales policy is a designation-level scale, not a person's basic. So
 * every payslip records basic_pay NULL, shown as "basic not recorded". Nothing
 * is worked out from basic any more: PF is HR's typed amount.
 *
 * HR'S EXEMPTION FLAGS DECIDE, as on the register: eligible_for_pf off = no
 * PF; eligible_for_esi off = no ESI. The flag decides, not the amount.
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
import type { PayslipRunNotes } from '@/types/hr-payroll';
import {
  computeDeductions,
  loadPayrollPolicies,
  type DeductionResult,
  type PayrollPolicies,
} from './deduction-engine';
import {
  applyLop,
  BASIC_NOT_RECORDED,
  capDeductionsToGross,
  computeLopDays,
  LOP_SKIP_REASONS,
  type CappedDeductions,
} from '@/lib/hr/payroll/lop-engine';
// The basis rule (per-person scheduled days, falling back to the month's mode)
// is DEFINED ONCE, in the salary register, and imported here rather than
// restated. Two copies of a rule that decides pay drift, and the drift is
// invisible until somebody is paid twice for the same month on two screens.
//
// The MONTH rule (which salary row pays this month) is imported the same way,
// for the same reason.
import { loadSalaryRowsInForce, registerBasisFor } from './salary-register-service';

interface StaffPayInfo {
  id: string;
  first_name: string;
  last_name: string;
  institution_id: string;
}

/** What a payslip prints where no basic is recorded. Never a number. */
export { BASIC_NOT_RECORDED };

/** Why a person is left off for a reason about their SALARY, in the words HR reads. */
export const SALARY_SKIP_REASONS = {
  noSalary:
    'No current salary recorded for this person — record their monthly gross on the Salaries screen, then rerun. Nobody is paid a guessed figure.',
  salaryIsZero:
    'Their current salary records a monthly gross of 0 — correct it on the Salaries screen, then rerun.',
} as const;

/**
 * The skip reason for someone whose salary starts AFTER the month being paid.
 * Always starts with SALARY_STARTS_LATER_PREFIX, so it can be counted.
 */
export const SALARY_STARTS_LATER_PREFIX = 'Their salary starts on';
export function salaryStartsLaterReason(startDate: string): string {
  return `${SALARY_STARTS_LATER_PREFIX} ${startDate}, after this month, so nothing is paid to them for this month. If that date is wrong, correct it on the Salaries screen, then rerun.`;
}

/** One person's salary row, reduced to what a payslip needs. */
export interface PayslipSalaryInput {
  monthlyGross: number;
  /** allowance_amount. Paid on top of the gross, cut for loss of pay like it. */
  allowance: number;
  /** eligible_for_pf. Off = no PF, whatever amount is typed. */
  eligibleForPf: boolean;
  /** epf_amount: the flat monthly PF HR typed on the salary. */
  epfAmount: number;
  /** eligible_for_esi. Off = no ESI. */
  eligibleForEsi: boolean;
}

/** One person's pay for the month, before anything is written. */
export interface PayslipPay {
  /** Always null: no basic is recorded anywhere, and none is ever computed. */
  basicPay: null;
  /** Monthly gross + allowance, before loss of pay. */
  fullGross: number;
  /** What the month pays: gross + allowance, cut for loss of pay. */
  lopAdjustedGross: number;
  /** The allowance part of lopAdjustedGross. */
  allowancePaid: number;
  lopAmount: number;
  deductions: CappedDeductions;
  /** HR's flags said no PF / no ESI for this person. */
  pfExempt: boolean;
  esiExempt: boolean;
}

/** Whole paise, as the register keeps statutory amounts. */
function round2Money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * One person's pay from their salary row. PURE.
 *
 * EARNINGS. The monthly gross AND the allowance are paid (ruling 2026-09-30,
 * the register's rule), and both are cut by the LOP factor, as the register's
 * day rate divides gross + allowance.
 *
 * PF is the flat monthly amount HR typed (epf_amount), taken in full, not
 * pro-rated, exactly as the register takes it; nothing when eligible_for_pf
 * is off. Never worked out from a basic: none is recorded.
 *
 * ESI, INCOME TAX, PROFESSIONAL TAX are worked out by the deduction engine
 * from the LOP-cut MONTHLY GROSS, as before this change. The allowance is not
 * in their base, the same choice the register makes for tax ("a person pushed
 * over a band threshold by their allowance is not taxed for it"). ESI is left
 * out entirely when eligible_for_esi is off.
 *
 * Deductions are then held at the month's pay (capDeductionsToGross), PF
 * protected last, so net pay never goes below zero.
 */
export function payslipPayFor(
  input: PayslipSalaryInput & { factor: number; policies: PayrollPolicies },
): PayslipPay {
  const gross = Math.max(0, input.monthlyGross);
  const allowance = Math.max(0, input.allowance);

  const earnings = [{ component_id: 'monthly_gross', code: 'MONTHLY_GROSS', amount: gross }];
  if (allowance > 0) {
    earnings.push({ component_id: 'allowance', code: 'ALLOWANCE', amount: allowance });
  }
  const pay = applyLop({ basicPay: 0, earnings, factor: input.factor });
  const cutGross = pay.adjustedEarnings[0].amount;
  const allowancePaid = pay.adjustedEarnings[1]?.amount ?? 0;

  const pfExempt = !input.eligibleForPf;
  const esiExempt = !input.eligibleForEsi;

  // TAX CAVEAT, pre-existing and not changed here: computeTds ANNUALISES
  // the gross it is handed (this month × 12). A month with unpaid days is
  // therefore projected as if the whole year were docked the same way, and
  // withholds less income tax this month than the person's real annual
  // liability would call for. No year-to-date true-up exists in lib/ or
  // app/ to correct it later; Finance should know the monthly figure runs
  // low in a docked month.
  const engine: DeductionResult = computeDeductions(
    {
      basicPay: 0,
      grossPay: cutGross,
      paymentMode: 'neft',
      // PF never comes from the engine now (it would need a basic); ESI only
      // for people HR marked eligible.
      exemptions: { pf: true, esi: esiExempt },
    },
    input.policies,
  );

  const pf = pfExempt ? 0 : round2Money(Math.max(0, input.epfAmount));

  // Professional tax is a FLAT slab and PF is a flat amount, so on a fully
  // absent month the deductions can exceed a pay of zero and net pay would go
  // negative — which hr_payslips forbids, and which would fail the batch
  // insert for EVERYBODY. Hold the total at the pay; the tax is dropped first,
  // the provident fund last.
  const capped = capDeductionsToGross(
    { pf, esi: engine.esi, tds: engine.tds, pt: engine.pt },
    pay.lopAdjustedGross,
  );

  return {
    basicPay: null,
    fullGross: pay.fullGross,
    lopAdjustedGross: pay.lopAdjustedGross,
    allowancePaid,
    lopAmount: pay.lopAmount,
    deductions: capped,
    pfExempt,
    esiExempt,
  };
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
  /** Always null today = "basic not recorded"; never a computed figure. */
  basic_pay: number | null;
  /** The allowance paid this month (inside gross_after_lop), after loss of pay. */
  allowance_paid: number;
  /** PF taken off: HR's typed amount, 0 when exempt. */
  pf: number;
  /** ESI taken off, 0 when exempt. */
  esi: number;
  /** HR marked this person not eligible for PF / ESI. Skipped rows: false. */
  pf_exempt: boolean;
  esi_exempt: boolean;
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
   * People left off ONLY because their work location has not closed
   * attendance for this month. The one number the "close attendance first" advice
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

/**
 * A manual override was refused because of what was typed (a negative or
 * non-number amount, deductions above the pay, a blank field with nothing to
 * keep). A route answers 400 with the message as written.
 */
export class PayslipOverrideRefusal extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'PayslipOverrideRefusal';
  }
}

/** What HR typed in the override dialog. Blank (undefined / null / '') = unchanged. */
export type PayslipDeductionOverrides = Partial<
  Record<'pf' | 'esi' | 'tds' | 'pt', number | string | null | undefined>
>;

const DEDUCTION_NAMES: Record<'pf' | 'esi' | 'tds' | 'pt', string> = {
  pf: 'PF',
  esi: 'ESI',
  tds: 'Income tax (TDS)',
  pt: 'Professional tax',
};

/**
 * The four deductions after an override. PURE.
 *
 * A blank field keeps the slip's saved amount. A typed field must be a number,
 * 0 or more. A blank field on a slip with no saved amount is refused: keeping
 * "unchanged" is impossible, and 0 would be a guess.
 */
export function resolveDeductionOverrides(
  saved: Record<'pf' | 'esi' | 'tds' | 'pt', unknown>,
  typed: PayslipDeductionOverrides,
): Record<'pf' | 'esi' | 'tds' | 'pt', number> {
  const out = { pf: 0, esi: 0, tds: 0, pt: 0 };
  for (const key of ['pf', 'esi', 'tds', 'pt'] as const) {
    const t = typed[key];
    if (t === undefined || t === null || (typeof t === 'string' && t.trim() === '')) {
      const s = saved[key];
      if (s === null || s === undefined || !Number.isFinite(Number(s))) {
        throw new PayslipOverrideRefusal(
          `${DEDUCTION_NAMES[key]} was left blank, but this payslip was made before deductions were saved one by one, so there is no amount to keep. Fill in all four amounts.`,
        );
      }
      out[key] = Number(s);
      continue;
    }
    const n = typeof t === 'number' ? t : Number(t);
    if (!Number.isFinite(n) || n < 0) {
      throw new PayslipOverrideRefusal(
        `${DEDUCTION_NAMES[key]} must be an amount of 0 or more.`,
      );
    }
    out[key] = n;
  }
  return out;
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
    // so ask directly rather than infer from emptiness. Only runs in the
    // degenerate case.
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

    // Chunked: a single `.in()` over a whole organisation can truncate
    // silently at the PostgREST row cap, and the `in.(...)` list inflates the
    // query string past what a proxy will accept.
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

    const staffIds = staffList.map((s) => s.id);

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

    // 6c. Each person's CURRENT salary — the pay this run is worked out from.
    //
    // READ AFTER the attendance refusal above, so an account missing both keys
    // is told about attendance first, exactly as before this change.
    //
    // READABILITY IS DECIDED FROM THE PERMISSION, NEVER FROM THE ROW COUNT. The
    // hr_staff_salaries SELECT policy also returns the caller's OWN row, so an
    // operator on this payroll who lacks hr.payroll.salary.view reads exactly
    // one row and no error, and everybody else would be skipped as "no salary
    // recorded". Ask up front instead, the same way the day counts are asked.
    const [{ data: canSeeSalaries }, { data: isSuperAdminForSalary }] = await Promise.all([
      (supabase as any).rpc('user_has_permission', {
        permission_name: 'hr.payroll.salary.view',
      }),
      (supabase as any).rpc('is_super_admin'),
    ]);
    if (!canSeeSalaries && !isSuperAdminForSalary) {
      throw new PayrollPermissionError(
        'hr.payroll.salary.view',
        'Cannot read salaries: this account is missing hr.payroll.salary.view. Without it the account sees at most its own salary, so everybody else would be skipped as "no salary recorded", which is indistinguishable from the salaries genuinely not being entered. Ask an administrator to grant it.',
      );
    }

    // THE MONTH RULE: the row in force for THIS period's month, by
    // effective_from — not the newest row. Shared with the salary register.
    const inForce = await loadSalaryRowsInForce(
      supabase,
      staffIds,
      period.period_year,
      period.period_month,
    );
    const salaryByStaff = new Map<string, PayslipSalaryInput>();
    for (const row of inForce.rows) {
      salaryByStaff.set(row.staff_id, {
        monthlyGross: num(row.monthly_gross),
        allowance: num(row.allowance_amount),
        // The flag decides, not the amount — the register's rule. A NULL flag
        // is read as "not eligible", as the register reads it.
        eligibleForPf: row.eligible_for_pf === true,
        epfAmount: num(row.epf_amount),
        eligibleForEsi: row.eligible_for_esi === true,
      });
    }

    const payslipInserts: any[] = [];
    const lineItemInserts: any[] = [];
    const previewRows: LopPreviewRow[] = [];
    let unprocessedDaysAcrossRun = 0;
    let zeroPaidDayPeople = 0;
    const droppedDeductionPeople: string[] = [];
    let pfFlagButNoAmountPeople = 0;

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
        basic_pay: null,
        allowance_paid: 0,
        pf: 0,
        esi: 0,
        pf_exempt: false,
        esi_exempt: false,
      });
    };

    for (const staff of staffList as StaffPayInfo[]) {
      const name = `${staff.first_name} ${staff.last_name}`.trim();

      // A person with no salary in force is LISTED as skipped, never dropped
      // and never paid a guess. First, because it is the first thing to fix:
      // the salary register orders its exclusions the same way.
      const salary = salaryByStaff.get(staff.id);
      if (!salary) {
        const startsOn = inForce.startsAfterMonth.get(staff.id);
        skip(
          staff,
          name,
          startsOn ? salaryStartsLaterReason(startsOn) : SALARY_SKIP_REASONS.noSalary,
        );
        continue;
      }
      if (salary.monthlyGross <= 0) {
        skip(staff, name, SALARY_SKIP_REASONS.salaryIsZero);
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

      // Monthly gross + allowance, cut by the LOP factor; PF from HR's typed
      // amount; ESI/TDS/PT from the cut gross; HR's flags decide PF and ESI.
      const pay = payslipPayFor({ ...salary, factor: days.factor, policies });
      const capped = pay.deductions;
      if (capped.dropped > 0) {
        droppedDeductionPeople.push(name);
      }
      if (salary.eligibleForPf && salary.epfAmount <= 0) pfFlagButNoAmountPeople++;

      const slipId = crypto.randomUUID();

      payslipInserts.push({
        id: slipId,
        period_id: periodId,
        staff_id: staff.id,
        engine_type: period.engine_type,
        // NULL — which the payslip prints as "basic not recorded". No basic
        // is recorded anywhere, and none is worked out from the gross. What
        // the person is actually paid is gross_amount, which IS cut; lop_days
        // and working_days_attended next to it say why.
        basic_pay: pay.basicPay,
        // Pay no longer comes from a pay scale, so there is none to point at.
        pay_scale_snapshot_id: null,
        working_days_attended: days.paidDays,
        lop_days: days.lopDays,
        gross_amount: pay.lopAdjustedGross,
        total_deductions: capped.total,
        net_amount: capped.netPay,
        // One by one (20270523090000), so the slip can show what was taken
        // and a manual override can leave a field it was not given unchanged.
        allowance_paid: pay.allowancePaid,
        pf_deduction: capped.pf,
        esi_deduction: capped.esi,
        tds_deduction: capped.tds,
        pt_deduction: capped.pt,
        payment_mode: 'neft',
        correction_type: 'initial',
      });

      // NO earning line items. A line item must name an hr_pay_components
      // row, and the monthly gross is one figure with no recorded split into
      // components — inventing one would print amounts nobody authorised
      // (20260821191000 says the same). gross_amount and allowance_paid carry it.

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
        basic_pay: pay.basicPay,
        allowance_paid: pay.allowancePaid,
        pf: capped.pf,
        esi: capped.esi,
        pf_exempt: pay.pfExempt,
        esi_exempt: pay.esiExempt,
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
    if (pfFlagButNoAmountPeople > 0) {
      result.warnings.push(
        `${pfFlagButNoAmountPeople} person(s) are marked for PF on their salary, but no PF amount is typed there, so no PF is taken off their pay. Type the PF amount on the Salaries screen if PF is due, then rerun.`,
      );
    }
    const startsLaterCount = result.errors.filter((e) =>
      e.reason.startsWith(SALARY_STARTS_LATER_PREFIX),
    ).length;
    if (startsLaterCount > 0) {
      result.warnings.push(
        `${startsLaterCount} person(s) have a salary that starts after this month, so they are not paid for this month. Each one is listed with the start date.`,
      );
    }
    const monthNotClosedCount = result.errors.filter(
      (e) => e.reason === LOP_SKIP_REASONS.monthNotClosed,
    ).length;
    if (monthNotClosedCount > 0) {
      result.warnings.push(
        `${monthNotClosedCount} person(s) are not on this payroll because their work location has not closed attendance for this month. HR: close attendance for this month at each of those work locations before re-running this payroll.`,
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

    // 10. Update period aggregates, and KEEP the run's notes on the period
    //     (20270523090000), so the warnings and the people left off are still
    //     on the period page after the response that carried them is gone.
    const notes: PayslipRunNotes = {
      generated_at: new Date().toISOString(),
      generated: result.generated,
      skipped: result.skipped,
      warnings: result.warnings,
      skipped_people: result.errors,
    };
    const { error: notesErr } = await (supabase as any)
      .from('hr_payroll_periods')
      .update({
        generation_notes: notes,
        ...(result.generated > 0
          ? {
              total_gross: result.totals.gross,
              total_deductions: result.totals.deductions,
              total_net: result.totals.net,
              staff_count: result.generated,
            }
          : {}),
      })
      .eq('id', periodId);

    // The payslips are already written, so this must not turn a good run into
    // an error. It is said instead, in the response HR reads.
    if (notesErr) {
      result.warnings.push(
        `The payslips were made, but this run's notes and totals could not be saved on the period (${notesErr.message}). Keep this message; the period page will not show it later.`,
      );
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
   *
   * A FIELD LEFT BLANK IS UNCHANGED, never 0 (W12 review, 30 Sep). Entering
   * only PF used to set ESI, income tax and professional tax to 0. Now each
   * blank field keeps the amount the slip already carries, read from the
   * deductions saved one by one (20270523090000). A slip made before those
   * were saved has no amounts to keep, so every field must then be filled in:
   * refused, never guessed.
   */
  static async overrideDeductions(
    supabase: SupabaseClient,
    slipId: string,
    overrides: PayslipDeductionOverrides,
    reason: string,
  ): Promise<{ newSlipId: string }> {
    if (!reason || reason.trim().length === 0) {
      throw new PayslipOverrideRefusal('Manual override requires a reason for audit trail');
    }

    // Load the existing payslip
    const { data: existing, error } = await (supabase as any)
      .from('hr_payslips')
      .select('*')
      .eq('id', slipId)
      .is('superseded_by', null)
      .single();

    if (error || !existing) throw new Error('Payslip not found or already superseded');

    const next = resolveDeductionOverrides(
      {
        pf: existing.pf_deduction,
        esi: existing.esi_deduction,
        tds: existing.tds_deduction,
        pt: existing.pt_deduction,
      },
      overrides,
    );
    const newTotalDeductions = next.pf + next.esi + next.tds + next.pt;
    const newNetAmount = Number(existing.gross_amount) - newTotalDeductions;
    if (newNetAmount < 0) {
      throw new PayslipOverrideRefusal(
        `These deductions (₹${newTotalDeductions}) are more than this month's pay (₹${Number(existing.gross_amount)}). Net pay cannot go below zero.`,
      );
    }

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
        allowance_paid: existing.allowance_paid ?? null,
        pf_deduction: next.pf,
        esi_deduction: next.esi,
        tds_deduction: next.tds,
        pt_deduction: next.pt,
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
