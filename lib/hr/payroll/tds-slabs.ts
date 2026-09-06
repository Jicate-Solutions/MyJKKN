/**
 * TDS bands — resolving a monthly gross to a rate and an amount.
 * Created: 2026-09-02.
 *
 * THE SCHEME: a band selects a rate, and that rate applies to the WHOLE monthly
 * gross. A salary inside 1,06,250–2,00,000 at 5% pays 5% of its entire gross,
 * not 5% of the part above the floor. A salary matching no band pays nothing.
 *
 * THIS IS NOT THE STATUTORY CALCULATION, AND THAT IS THE POINT OF THIS FILE
 * EXISTING SEPARATELY. `lib/services/hr/payroll/deduction-engine.ts` already
 * holds the progressive annual computation — annualise, less the standard
 * deduction, walk 0/5/10/15/20/30, 87A rebate, cess, ÷12 — driven by the
 * platform_policies key 'hr.payroll.tds_slabs'. On a ₹1,50,000 gross that
 * yields ₹17,983/month against this file's ₹7,500.
 *
 * Do not "unify" the two. They answer different questions, and that engine is
 * dead: it feeds payslip-generator.ts and hr_payslips, which has zero rows. The
 * live Salary Register uses THIS one.
 *
 * PURE, AND EXPORTED, so the arithmetic that decides what people are taxed can
 * be tested without a database — the same reasoning as computeRegisterLine.
 * Imported by both the register (server) and the salaries screen (client), so
 * there is exactly one implementation of the rule.
 */

import type { HrTdsSlab } from '@/lib/services/hr/payroll/tds-slab-service';

/** Money is stored numeric(12,2); keep every computed figure at 2dp. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface TdsResolution {
  /** The band that matched, or null when the gross falls outside every band. */
  slab: HrTdsSlab | null;
  /** 0 when nothing matched — "no band" and "a 0% band" both mean no tax. */
  rate_pct: number;
  /** rate_pct% of the monthly gross, at 2dp. */
  amount: number;
}

/**
 * Which band claims this salary, and what it costs.
 *
 * BOUNDS ARE [min, max) — the floor is inside the band, the ceiling is not.
 * Bands written the way people say them ("1,06,250 to 2,00,000", the next one
 * starting at 2,00,001) leave every paise value between them matching NOTHING,
 * so a salary of ₹2,00,000.50 would be silently untaxed. Half-open, the next
 * band starts at exactly 2,00,000 and there is no crack. The database enforces
 * the same convention in hr_tds_slabs' EXCLUDE constraint, so the two agree by
 * construction rather than by discipline.
 *
 * A null `max_monthly_gross` is the open-ended top band. Exactly one band must
 * be open-ended whenever any exist — enforced by a deferred constraint trigger,
 * because a capped top band means the highest earner pays nothing at all.
 */
export function resolveTds(
  monthlyGross: number,
  slabs: readonly HrTdsSlab[]
): TdsResolution {
  const gross = Number(monthlyGross);

  // An unset or nonsensical salary is not a tax question. Guarded because this
  // runs against a directory row where monthly_gross is legitimately null for
  // everyone who has no salary recorded yet.
  if (!Number.isFinite(gross) || gross <= 0) {
    return { slab: null, rate_pct: 0, amount: 0 };
  }

  const slab =
    slabs.find(
      (s) =>
        gross >= Number(s.min_monthly_gross) &&
        (s.max_monthly_gross === null || gross < Number(s.max_monthly_gross))
    ) ?? null;

  if (!slab) return { slab: null, rate_pct: 0, amount: 0 };

  const rate = Number(slab.rate_pct) || 0;
  return { slab, rate_pct: rate, amount: round2((gross * rate) / 100) };
}

/**
 * Sort bands the way a person reads them: lowest floor first.
 *
 * The database does not guarantee an order, and an unordered list makes the
 * slab editor's rows jump around after every save.
 */
export function sortSlabs(slabs: readonly HrTdsSlab[]): HrTdsSlab[] {
  return [...slabs].sort(
    (a, b) => Number(a.min_monthly_gross) - Number(b.min_monthly_gross)
  );
}

/**
 * The bands, described the way the editor and the salary form should show them.
 * "₹2,00,000 and above" beats an empty cell for the open-ended band — a blank
 * there reads as unfinished configuration rather than a deliberate choice.
 */
export function describeSlab(slab: HrTdsSlab, format: (n: number) => string): string {
  const from = format(Number(slab.min_monthly_gross));
  return slab.max_monthly_gross === null
    ? `${from} and above`
    : `${from} – ${format(Number(slab.max_monthly_gross))}`;
}
