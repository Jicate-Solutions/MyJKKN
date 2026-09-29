/**
 * Loss-of-pay (LOP) engine — the arithmetic that decides how much of a month
 * a person is actually paid for.
 *
 * PURE. No Supabase, no I/O, no imports. Every figure that changes what
 * somebody is paid happens here so it can be tested without a database
 * (__tests__/hr/payroll-lop.test.ts).
 *
 * ── The day-counting model ────────────────────────────────────────────────
 *
 * CALENDAR-PAY ANCHOR + WORKING-DAY LOP-DIVISOR. The salary is a fixed monthly
 * figure — it does not grow in a 31-day month or shrink in February. What an
 * absent day COSTS is the monthly figure divided by the month's BUSINESS
 * WORKING days (calendar days minus week-offs minus holidays), never by the
 * calendar days.
 *
 * This is not a new rule. It is the rule the shipped salary register already
 * pays by — `computeRegisterLine` in lib/services/hr/payroll/salary-register-service.ts,
 * pinned to a hand-kept spreadsheet to the paisa in
 * __tests__/hr/salary-register-line.test.ts ("16000 / 22 x 6 = 4363.64").
 * No written spec; the rule lives in `computeRegisterLine` and its test above.
 * That arithmetic, reconciled against a real month by HR, is the authority
 * this engine follows. The divisor is NOT invented here.
 *
 *   basis        = business working days for THIS person in THIS month
 *   paid days    = min(payable days credited by the attendance close, basis)
 *   LOP days     = basis - paid days
 *   factor       = paid days / basis
 *   every earning is multiplied by factor
 *
 * ── Why LOP days are derived by subtraction ───────────────────────────────
 *
 * NOT from the attendance summary's own `lop_days` column. That column counts
 * only days a person was EXPECTED to work and did not. Someone who joined on
 * the 15th has no records before that date, so those days are not LOP by that
 * definition — and paying on it would hand a mid-month joiner a full month's
 * salary for half a month. `basis - paid` is what the hand-kept register does
 * on every row, and for a full-month employee the two agree exactly.
 * Same reasoning, same words, as the register service.
 */

/** The unit every figure here is expressed in: whole days, halves allowed. */
export interface LopDayCounts {
  /** Business working days this person was expected to be available for. */
  basis: number;
  /** Days the month actually pays for: worked + paid leave + on duty, capped at basis. */
  paidDays: number;
  /** basis - paidDays. Fractional when half-days are in play. */
  lopDays: number;
  /** paidDays / basis. 1 when nobody is absent, 0 when everybody is. */
  factor: number;
}

/**
 * Turn one person's frozen day counts into LOP days and a pay factor.
 *
 * `payableDays` is `hr_attendance_period_summaries.payable_days`, frozen when
 * the work location closed the attendance month.
 *
 * Capped at the basis for the same reason the register caps it: somebody whose
 * work location runs a six-day week while their payer runs a five-day one can
 * be credited more days than the month they are paid for, and nobody is paid
 * more than a full month.
 */
export function computeLopDays(input: { basis: number; payableDays: number }): LopDayCounts {
  const basis = Number.isFinite(input.basis) ? Math.max(0, input.basis) : 0;
  const credited = Number.isFinite(input.payableDays) ? Math.max(0, input.payableDays) : 0;

  if (basis <= 0) {
    // No basis means no day rate. The caller must refuse to pay rather than
    // divide by zero — see `LOP_BASIS_MISSING_REASON`.
    return { basis: 0, paidDays: 0, lopDays: 0, factor: 0 };
  }

  const paidDays = Math.min(credited, basis);
  const lopDays = round2(basis - paidDays);

  return { basis, paidDays, lopDays, factor: paidDays / basis };
}

/** One earning component before and after the LOP cut. */
export interface LopEarning {
  component_id: string;
  code: string;
  amount: number;
}

export interface LopAdjustedPay {
  /** The contractual basic, untouched. What the payslip's basic_pay column keeps. */
  fullBasic: number;
  /** The sum of every earning at full month value. */
  fullGross: number;
  /** Basic after the LOP cut — what the deduction engine must be given. */
  lopAdjustedBasic: number;
  /** Gross after the LOP cut — what the deduction engine must be given. */
  lopAdjustedGross: number;
  /** fullGross - lopAdjustedGross. The rupee effect of the absence. */
  lopAmount: number;
  /** The same earnings, each cut by the factor. Sums EXACTLY to lopAdjustedGross. */
  adjustedEarnings: LopEarning[];
}

/**
 * Apply the LOP factor to basic and to every earning component.
 *
 * ALL EARNINGS ARE PRO-RATED, not just basic. The register does the same: its
 * day rate divides gross + allowance, "so an absent day costs a proportional
 * slice of it too". Statutory deductions are NOT touched here — the deduction
 * engine recomputes them from the reduced basic/gross, which is its documented
 * contract ("the caller is responsible for LOP-adjusting basic/gross BEFORE
 * calling").
 *
 * GROSS IS THE SUM OF THE CUT COMPONENTS, not a separately-rounded product.
 * Rounding each component and then rounding the gross independently lets the
 * two disagree by a rupee, and a payslip whose line items do not add up to its
 * gross is a payslip nobody can check. Deriving the gross from the components
 * makes the identity true by construction.
 *
 * Whole rupees, matching how the generator already rounds every component.
 */
export function applyLop(input: {
  basicPay: number;
  earnings: LopEarning[];
  factor: number;
}): LopAdjustedPay {
  const factor = clampFactor(input.factor);
  const fullBasic = Math.max(0, input.basicPay);
  const fullGross = input.earnings.reduce((t, e) => t + Math.max(0, e.amount), 0);

  const adjustedEarnings = input.earnings.map((e) => ({
    ...e,
    amount: Math.round(Math.max(0, e.amount) * factor),
  }));

  const lopAdjustedGross = adjustedEarnings.reduce((t, e) => t + e.amount, 0);

  return {
    fullBasic,
    fullGross,
    lopAdjustedBasic: Math.round(fullBasic * factor),
    lopAdjustedGross,
    lopAmount: fullGross - lopAdjustedGross,
    adjustedEarnings,
  };
}

/** A capped set of deductions, plus how much had to be dropped and from where. */
export interface CappedDeductions {
  pf: number;
  esi: number;
  tds: number;
  pt: number;
  total: number;
  netPay: number;
  /** total before capping minus total after. 0 on an ordinary month. */
  dropped: number;
}

/**
 * Hold total deductions at or below the gross, so net pay can never go below
 * zero.
 *
 * WHY THIS EXISTS. Professional Tax is a FLAT slab amount, not a percentage.
 * Before LOP was wired, gross was always a full month and comfortably larger
 * than it. Now somebody absent for the whole month earns nothing, and a flat PT
 * (or a flat anything) on a gross of zero produces a NEGATIVE net — the payroll
 * asking the employee to pay the institution. Worse, hr_payslips carries
 * `CHECK (net_amount >= 0)` and payslips are inserted as ONE batch, so a single
 * fully-absent person would fail the insert for the WHOLE payroll and nobody
 * would be paid at all.
 *
 * ORDER: the tax is dropped first, then professional tax, then ESI, and the
 * provident fund is protected last. That is the salary register's stated rule —
 * "TDS is capped LAST, so a month with almost nothing left drops the tax rather
 * than the provident fund" — read from the other end: what is capped last is
 * what survives.
 *
 * The shortfall is RETURNED, not hidden, so a human can be told that a
 * contribution was reduced rather than discovering it on a statutory return.
 */
export function capDeductionsToGross(
  deductions: { pf: number; esi: number; tds: number; pt: number },
  gross: number,
): CappedDeductions {
  const available = Math.max(0, gross);
  const pf = Math.max(0, deductions.pf);
  const esi = Math.max(0, deductions.esi);
  const pt = Math.max(0, deductions.pt);
  const tds = Math.max(0, deductions.tds);
  const requested = pf + esi + pt + tds;

  if (requested <= available) {
    return { pf, esi, tds, pt, total: requested, netPay: available - requested, dropped: 0 };
  }

  // Protected first, lost last.
  const keptPf = Math.min(pf, available);
  const keptEsi = Math.min(esi, available - keptPf);
  const keptPt = Math.min(pt, available - keptPf - keptEsi);
  const keptTds = Math.min(tds, available - keptPf - keptEsi - keptPt);
  const total = keptPf + keptEsi + keptPt + keptTds;

  return {
    pf: keptPf,
    esi: keptEsi,
    tds: keptTds,
    pt: keptPt,
    total,
    netPay: available - total,
    dropped: requested - total,
  };
}

/**
 * Why a person cannot be paid from attendance, in the words HR reads.
 *
 * Each of these makes the generator SKIP that person rather than pay them a
 * guessed figure in either direction. Same shape as the generator's existing
 * skip reasons, and the same principle as the salary register's exclusions:
 * a missing month is a question for a human, not a default.
 */
export const LOP_SKIP_REASONS = {
  monthNotClosed:
    'Their work location has not closed attendance for this month yet — close it, then rerun. Paying now would either pay a full month nobody has checked or dock days nobody has judged.',
  noSummary:
    'No attendance record for this person in the closed month — check whether they should be on this payroll at all, then rerun.',
  basisMissing:
    'The closed month records no working days for this person, so a day rate cannot be worked out. Recheck their work pattern for the month, then rerun.',
} as const;

// ── local helpers ───────────────────────────────────────────────────────────

/** Never above a full month, never below nothing. */
function clampFactor(f: number): number {
  if (!Number.isFinite(f)) return 0;
  return Math.min(1, Math.max(0, f));
}

/** Day counts are held to 2dp — half-days and the odd quarter-day exist. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
