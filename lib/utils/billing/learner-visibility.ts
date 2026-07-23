import type { MyReceiptItem } from '@/types/billing';

/**
 * Learner-side visibility gate for billing categories.
 *
 * A category flagged `visible_to_learners = false` stays completely normal for
 * Accounts — it is billable, payable, appears in fee structures, billing lists
 * and every dashboard. It is only hidden from the two LEARNER-facing surfaces:
 *
 *   1. /learners/my-bills            — user session, RLS also enforces this
 *   2. /api/parent/fees              — SERVICE ROLE client, so RLS does NOT
 *                                      apply and this filter is the only guard
 *
 * Those two surfaces do not share a data path, which is exactly why the rule
 * lives here instead of being written twice.
 *
 * Receipts are deliberately still shown in full: the learner really did hand
 * over that money, so hiding the receipt would make a payment disappear from
 * their history. Instead the hidden LINES of a receipt collapse into a single
 * unnamed row (`collapseHiddenReceiptItems`), which keeps the receipt total
 * tied to the amount paid while never naming the hidden category.
 */

/** Label shown to learners in place of hidden receipt lines. */
export const LEARNER_HIDDEN_LINE_LABEL = 'Other fees';

/**
 * Sentinel id for the single collapsed line. Only ever one per receipt, so it
 * is safe as a React key and it can never collide with a real bill UUID.
 */
export const LEARNER_HIDDEN_LINE_ID = '__hidden__';

/**
 * Any Supabase client — SSR, browser or service-role.
 *
 * Typed loosely on purpose. Threading the full generated `Database` generic
 * through this helper made TS give up with TS2589 ("type instantiation is
 * excessively deep and possibly infinite") at the my-bills call site, where the
 * client is already carrying a large inferred query type. The helper only ever
 * performs one two-column read, so there is nothing here worth that cost.
 */
type CategoryReader = { from: (table: string) => any };

/**
 * Ids of every category that must not reach a learner. One query against a
 * ~20-row global master table.
 *
 * Throws on a query error rather than returning an empty set: an empty set
 * would silently mean "hide nothing", which on the service-role parent route
 * would leak the very rows this function exists to hide. A loud failure is the
 * safe failure here.
 */
export async function getLearnerHiddenCategoryIds(
  db: CategoryReader
): Promise<Set<string>> {
  const { data, error } = await db
    .from('billing_categories')
    .select('id')
    .eq('visible_to_learners', false);

  if (error) {
    throw error;
  }

  return new Set(((data ?? []) as { id: string }[]).map((c) => c.id));
}

/**
 * True when a bill may be shown to a learner. Uncategorised bills (a legacy
 * handful) stay visible — hiding a bill nobody classified would silently drop
 * real money from the learner's statement.
 */
export function isBillLearnerVisible(
  itemCategoryId: string | null | undefined,
  hiddenCategoryIds: Set<string>
): boolean {
  if (!itemCategoryId) return true;
  return !hiddenCategoryIds.has(itemCategoryId);
}

/**
 * Collapses every line pointing at a hidden bill into one unnamed row, so the
 * receipt still totals to what was actually paid. Visible lines keep their
 * original order; the collapsed row is appended last.
 */
export function collapseHiddenReceiptItems(
  items: MyReceiptItem[],
  hiddenBillIds: Set<string>
): MyReceiptItem[] {
  if (hiddenBillIds.size === 0) return items;

  const visible: MyReceiptItem[] = [];
  let hiddenTotal = 0;

  for (const item of items) {
    if (hiddenBillIds.has(item.billId)) {
      hiddenTotal += item.amountPaid;
    } else {
      visible.push(item);
    }
  }

  if (hiddenTotal <= 0) return visible;

  visible.push({
    billId: LEARNER_HIDDEN_LINE_ID,
    billDescription: LEARNER_HIDDEN_LINE_LABEL,
    billDueDate: null,
    billAmount: null,
    amountPaid: hiddenTotal,
  });

  return visible;
}
