// lib/services/billing/instalments/instalment-arithmetic.ts
//
// The rupee arithmetic of an instalment split, and NOTHING else — no Supabase
// client, no service class. It used to live inside instalment-plan-service.ts,
// which imports the browser client at module scope; the fee-structure sheet
// resolver (lib/utils/mappings/fee-structure-excel-mappings.ts) is a "pure,
// no DB access" module and needs this exact arithmetic to check a spreadsheet
// against the rupees a bill would actually carry. Pulling it out keeps ONE
// implementation instead of a third copy that would drift.
//
// The service re-exports computeInstalmentAmounts, so every existing import
// path still works.

/** Work in integer paise to keep sums exact — 2dp floats drift. */
export function toPaise(amount: number): number {
  return Math.round(amount * 100);
}

/** The two cells that size an instalment. Exactly one is set on a valid line. */
export interface InstalmentSizeInput {
  share_percent?: number | null;
  fixed_amount?: number | null;
}

/**
 * Splits `totalAmount` across `lines` (ordered by sequence_no):
 *   - lines 1..n-1 take their own size — fixed_amount, or share_percent of the
 *     total rounded to 2dp;
 *   - the LAST line absorbs rounding: total minus the sum of the earlier
 *     lines — so the instalments always sum EXACTLY to the total.
 * Returns null (meaning: do not split) when the plan has fewer than 2 lines or
 * any computed amount is not strictly positive.
 *
 * MIRROR NOTE: this is the TS reference implementation of the arithmetic in
 * `billing_instalment_split_for_learner` (migration 20260825013000). The SQL
 * engine is what generates bills at runtime; keep the two in step when either
 * changes. Used for authoring-time previews/validation and unit tests.
 */
export function computeInstalmentAmounts(
  totalAmount: number,
  lines: InstalmentSizeInput[]
): number[] | null {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;
  const n = lines.length;
  if (n < 2) return null;

  const totalPaise = toPaise(totalAmount);
  const amountsPaise: number[] = [];
  let sumPrev = 0;

  for (let i = 0; i < n; i++) {
    let paise: number;
    if (i < n - 1) {
      const line = lines[i];
      if (line.fixed_amount != null) {
        paise = toPaise(line.fixed_amount);
      } else if (line.share_percent != null) {
        // round(total * pct / 100, 2) — computed in paise
        paise = Math.round((totalPaise * line.share_percent) / 100);
      } else {
        return null; // malformed line
      }
    } else {
      paise = totalPaise - sumPrev; // last absorbs rounding
    }
    if (!Number.isFinite(paise) || paise <= 0) return null;
    sumPrev += paise;
    amountsPaise.push(paise);
  }

  return amountsPaise.map((p) => p / 100);
}
