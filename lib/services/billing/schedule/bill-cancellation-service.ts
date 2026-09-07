// Cancelling a learner bill writes off money, so it does not go through a
// plain UPDATE.
//
// Every write here calls fn_cancel_student_bill, a SECURITY DEFINER RPC that
// authorizes itself from auth.uid(), refuses a bill that has receipted money
// against it, and refuses a cancellation with no reason or no supporting
// document. RLS on billing_bill_cancellations is SELECT-only, so the audit
// trail cannot be edited by whoever it incriminates — the reads below are plain
// selects and stay under that RLS.
//
// A trigger (trg_billing_bills_guard_cancel) rejects any other route into
// status='cancelled', so bypassing this service does not work: it is the RPC or
// nothing.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { logActivityForCurrentUser, BillingActivityTemplates } from '@/lib/utils/activity-logger-client';
import type {
  BillCancellation,
  CancelBillInput,
  CancelBillResult,
} from '@/types/billing-bill-cancellation';

const SELECT_COLUMNS =
  'id, bill_id, institution_id, student_id, reason_code, reason, attachments, ' +
  'bill_snapshot, amount_cancelled, cancelled_by, cancelled_by_name, ' +
  'cancelled_by_email, cancelled_by_role, cancelled_by_is_super_admin, ' +
  'cancelled_at, created_at';

export class BillCancellationService {
  private static supabase = createClientSupabaseClient();

  /**
   * Cancel a bill. Throws the RPC's guard message verbatim — those messages
   * name the receipt to cancel first, or the status that blocked it, and are
   * written to be read by an operator rather than a developer.
   */
  static async cancelBill(input: CancelBillInput): Promise<CancelBillResult> {
    const { data, error } = await (this.supabase as any).rpc('fn_cancel_student_bill', {
      p_bill_id: input.billId,
      p_reason_code: input.reasonCode,
      p_reason: input.reason,
      p_attachments: input.attachments,
    });

    if (error) {
      logger.error('billing/bill-cancel', 'Cancel failed', { billId: input.billId, error });
      // Supabase errors are plain objects, not Error instances; `.message` is
      // what carries the RAISE EXCEPTION text the operator needs to read.
      throw new Error(error.message || 'Failed to cancel bill');
    }

    const row = (data as Array<Record<string, any>> | null)?.[0];
    const result: CancelBillResult = {
      cancellationId: row?.cancellation_id ?? '',
      billId: row?.cancelled_bill_id ?? input.billId,
      amountCancelled: Number(row?.amount_cancelled ?? 0),
    };

    // Mirrored into the shared activity log so the Billing Activity page shows
    // cancellations alongside every other billing action. Fire-and-forget is
    // acceptable ONLY here: the authoritative record is the row the RPC already
    // committed, and this is a convenience index over it.
    //
    // institution_id and the description come back FROM THE RPC rather than
    // from the caller — without the institution the log entry is invisible to
    // the Billing Activity page's institution filter, and a caller-supplied
    // description would let two entry points label the same event differently.
    const template = BillingActivityTemplates.billCancelled(
      row?.bill_description ?? 'Student bill',
      input.studentName ?? '',
      input.reason
    );
    logActivityForCurrentUser({
      ...template,
      resourceId: input.billId,
      institutionId: row?.institution_id ?? undefined,
      metadata: {
        sub_type: template.sub_type,
        cancellation_id: result.cancellationId,
        student_id: row?.student_id ?? undefined,
        reason_code: input.reasonCode,
        reason: input.reason,
        amount_cancelled: result.amountCancelled,
        attachment_count: input.attachments.length,
      },
    });

    return result;
  }

  /** The cancellation behind one bill, or null if the bill is not cancelled. */
  static async getByBill(billId: string): Promise<BillCancellation | null> {
    const { data, error } = await (this.supabase as any)
      .from('billing_bill_cancellations')
      .select(SELECT_COLUMNS)
      .eq('bill_id', billId)
      .maybeSingle();

    if (error) {
      logger.error('billing/bill-cancel', 'Fetch by bill failed', { billId, error });
      throw new Error(error.message || 'Failed to load cancellation');
    }
    return (data as BillCancellation) ?? null;
  }

  /**
   * Every cancellation for one learner, newest first. Returned as a Map keyed
   * by bill_id so the bills table can look one up per row without an N+1.
   */
  static async getByStudent(studentId: string): Promise<Map<string, BillCancellation>> {
    const { data, error } = await (this.supabase as any)
      .from('billing_bill_cancellations')
      .select(SELECT_COLUMNS)
      .eq('student_id', studentId)
      .order('cancelled_at', { ascending: false });

    if (error) {
      logger.error('billing/bill-cancel', 'Fetch by student failed', { studentId, error });
      throw new Error(error.message || 'Failed to load cancellations');
    }

    const map = new Map<string, BillCancellation>();
    for (const row of (data ?? []) as BillCancellation[]) {
      map.set(row.bill_id, row);
    }
    return map;
  }
}
