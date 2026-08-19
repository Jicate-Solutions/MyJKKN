/**
 * Which bill statuses represent a real liability.
 *
 * `cancelled` and `superseded` are both VOID states — the bill exists for audit
 * purposes but the learner does not owe it and never will. Every "how much is
 * this learner billed" calculation has to exclude both.
 *
 * This lives in one place because the two were being handled inconsistently:
 * the learner billing page and the bills table each filtered out `superseded`
 * but not `cancelled`, so a cancelled bill still inflated Total Fees. Worse, the
 * bills table derives `paid = total - outstanding`, and a cancelled bill raises
 * `total` while contributing nothing to `outstanding` — so the difference was
 * silently reported as money received, overstating collections.
 *
 * The database already encodes the same rule in two places — the
 * `uq_bill_dedup_category` partial unique index and the
 * `billing_enforce_once_per_learner` trigger both use
 * `status NOT IN ('cancelled','superseded')`. Keep this list in step with them.
 */
export const VOID_BILL_STATUSES = ['cancelled', 'superseded'] as const;

export type VoidBillStatus = (typeof VOID_BILL_STATUSES)[number];

/**
 * True when a bill is void — cancelled or superseded — and must be excluded
 * from totals, counts, and anything describing what a learner owes or paid.
 */
export function isVoidBill(bill: { status?: string | null } | null | undefined): boolean {
  return VOID_BILL_STATUSES.includes(bill?.status as VoidBillStatus);
}

/**
 * True when a bill counts toward the learner's fees — i.e. it is not void.
 * Use for filtering before summing amounts or counting bills.
 */
export function isBillableBill(bill: { status?: string | null } | null | undefined): boolean {
  return !isVoidBill(bill);
}
