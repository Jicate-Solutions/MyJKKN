// lib/services/billing/instalments/bill-instalment-writer.ts
//
// Writes the payment schedule that sits INSIDE one bill.
//
// WHY THIS EXISTS. Three interactive surfaces (New Bill, Edit Bill, the
// quick-bill popup — all one form component) and the bulk-create importer all
// need to persist tranches after their bill row has an id. Each doing its own
// insert would be four places for the sum invariant, the sequence numbering and
// the error handling to drift.
//
// THE SUM INVARIANT IS ENFORCED IN POSTGRES, NOT HERE. trg_bbi_validate_sum is
// a DEFERRABLE INITIALLY DEFERRED constraint trigger: the tranches must total
// the bill's final_amount at COMMIT. That is what makes replace-in-place safe
// (the intermediate delete never trips it) and why the amounts written here
// come from computeInstalmentAmounts rather than from whatever the UI happened
// to render — the preview and the stored rupees must be the same arithmetic.

import { computeInstalmentAmounts } from './instalment-arithmetic';
import { getErrorMessage } from '@/lib/utils';

/** One authored line. Percent-only: manual bills do not take fixed amounts. */
export interface BillInstalmentLine {
  share_percent: number;
  due_date: string;
}

/** Minimal client surface, so callers can pass a browser or request-scoped
 *  client and tests need no module mocking. */
export interface SupabaseInstalmentClient {
  from: (table: string) => any;
}

const TABLE = 'billing_bill_instalments';

/**
 * Sizes `lines` against `finalAmount` and returns the rows to store, or null
 * when the split is not writable (fewer than 2 lines, or any tranche computing
 * to <= 0). Callers treat null as "this bill has no schedule" — a plain
 * single-date bill, which is the pre-existing behaviour for every bill.
 */
export function buildInstalmentRows(
  billId: string,
  finalAmount: number,
  lines: BillInstalmentLine[]
): Array<{ bill_id: string; sequence_no: number; amount: number; due_date: string }> | null {
  const amounts = computeInstalmentAmounts(finalAmount, lines);
  if (!amounts) return null;

  return lines.map((line, i) => ({
    bill_id: billId,
    // Contiguous from 1: billing_bill_instalments has a UNIQUE (bill_id,
    // sequence_no) and the resolver walks lines in this order.
    sequence_no: i + 1,
    amount: amounts[i],
    due_date: line.due_date,
  }));
}

/**
 * Writes the tranches of a freshly-created bill.
 *
 * No promotes_to_status_code: a manually-raised bill must not move a learner up
 * the lifecycle ladder. That authority stays with the fee structure, which is
 * reviewed configuration rather than whatever an operator typed at the counter.
 */
export async function writeBillInstalments(
  supabase: SupabaseInstalmentClient,
  billId: string,
  finalAmount: number,
  lines: BillInstalmentLine[]
): Promise<number> {
  const rows = buildInstalmentRows(billId, finalAmount, lines);
  if (!rows) return 0;

  const { error } = await supabase.from(TABLE).insert(rows);

  // Supabase errors are plain objects, so try/catch around this would catch
  // nothing. The deferred sum check surfaces here as BL002 and its message
  // names the actual totals — it must reach the operator, not a console.
  if (error) {
    throw new Error(
      `Could not save the payment schedule: ${getErrorMessage(error)}`
    );
  }
  return rows.length;
}

/**
 * Replaces the schedule of an existing bill.
 *
 * Delete-then-insert rather than a diff: sequence_no is unique per bill and
 * must stay contiguous from 1, so an in-place update would have to order its
 * writes around its own unique index. Both statements land in one request
 * transaction and the sum check only fires at commit, so the empty moment in
 * between is never observed.
 *
 * Passing an empty `lines` removes the schedule and leaves a plain single-date
 * bill — a legitimate way to undo a split, which trg_bbi_validate_sum
 * explicitly allows.
 */
export async function replaceBillInstalments(
  supabase: SupabaseInstalmentClient,
  billId: string,
  finalAmount: number,
  lines: BillInstalmentLine[]
): Promise<number> {
  const { error: delError } = await supabase
    .from(TABLE)
    .delete()
    .eq('bill_id', billId);
  if (delError) {
    throw new Error(
      `Could not clear the existing payment schedule: ${getErrorMessage(delError)}`
    );
  }

  if (lines.length === 0) return 0;
  return writeBillInstalments(supabase, billId, finalAmount, lines);
}
