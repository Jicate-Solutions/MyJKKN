/**
 * Money helpers for the receipt entry form.
 *
 * Extracted from the form component so the arithmetic can be unit-tested
 * without pulling in React and the whole UI tree.
 */

/**
 * Amount still owed on a bill.
 *
 * `balance_amount` is authoritative, but it can be null on bills whose balance
 * was never populated — those fall back to the full amount. A balance of
 * exactly 0 means the bill is settled and nothing is due.
 *
 * The previous form, `balance_amount > 0 ? balance_amount : final_amount`,
 * could not tell "settled" from "never populated", so a fully paid bill was
 * shown with its entire original amount still pending and could be collected a
 * second time.
 */
export function pendingAmountFor(bill: {
  balance_amount?: number | null;
  final_amount: number;
}): number {
  const balance = bill.balance_amount;
  if (balance === null || balance === undefined) return bill.final_amount;
  return Math.max(0, balance);
}

/**
 * Round to paise.
 *
 * Bill amounts are NUMERIC(15,2). The form used to round to whole rupees, which
 * made any balance carrying paise impossible to clear: 4500.50 became 4501, was
 * then capped back to the 4500.50 balance... as 4500, leaving the bill stuck at
 * "partially paid" forever.
 */
export function toPaise(value: number): number {
  return Math.round(value * 100) / 100;
}
