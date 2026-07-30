// Receipt cancellation requires approval.
//
// Accounts staff cannot reverse money on their own: they RAISE a request
// (fn_request_receipt_cancellation) and an approver DECIDES it
// (fn_act_on_receipt_cancellation). Approval is what actually archives the
// receipt and reverts the bill.
//
// Every write goes through a SECURITY DEFINER RPC that authorizes itself; RLS
// on both tables is SELECT-only, so the audit trail cannot be edited by whoever
// it incriminates. Reads below are plain selects and stay under that RLS.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export type CancelRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'declined'
  | 'withdrawn'
  | 'failed';

export interface ReceiptCancelRequest {
  id: string;
  request_number: string;
  receipt_id: string;
  institution_id: string | null;
  student_id: string | null;
  receipt_snapshot: {
    receipt_number?: string;
    payment_amount?: number;
    payment_mode?: string;
    receipt_date?: string;
    payer_name?: string;
  };
  reason: string;
  status: CancelRequestStatus;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  // Identity SNAPSHOTS taken at request/decision time. A profile can be
  // renamed, have its email changed or be deactivated long after the fact, so
  // the uuid alone cannot answer "who approved this" years later.
  requested_by_name: string | null;
  requested_by_email: string | null;
  requested_by_role: string | null;
  decided_by_name: string | null;
  decided_by_email: string | null;
  decided_by_role: string | null;
  decided_by_designation: string | null;
  decided_by_is_super_admin: boolean | null;
}

export interface ReceiptCancelAction {
  id: string;
  request_id: string;
  action_type: 'requested' | 'approved' | 'declined' | 'withdrawn' | 'failed';
  actor_id: string | null;
  actor_role_name: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_is_super_admin: boolean | null;
  notes: string | null;
  created_at: string;
}

export class ReceiptCancellationService {
  private static supabase = createClientSupabaseClient();

  /** Raise a cancellation request. Throws the RPC's guard message verbatim. */
  static async requestCancellation(
    receiptId: string,
    reason: string
  ): Promise<{ requestId: string; requestNumber: string }> {
    const { data, error } = await (this.supabase as any).rpc('fn_request_receipt_cancellation', {
      p_receipt_id: receiptId,
      p_reason: reason,
    });
    if (error) {
      logger.error('billing/receipt-cancel', 'Request failed', { receiptId, error });
      // Supabase errors are plain objects, not Error instances; `.message` is
      // what carries the RAISE EXCEPTION text the operator needs to read.
      throw new Error(error.message || 'Failed to request cancellation');
    }
    const row = (data as Array<Record<string, any>> | null)?.[0];
    return { requestId: row?.request_id ?? '', requestNumber: row?.request_number ?? '' };
  }

  /**
   * Approve or decline. Note `status` may come back 'failed' WITHOUT an error:
   * that is the terminal case where the receipt vanished between request and
   * approval, which the RPC closes out rather than leaving stuck pending.
   */
  static async actOnRequest(
    requestId: string,
    action: 'approve' | 'decline',
    notes?: string
  ): Promise<{ status: CancelRequestStatus; receiptNumber: string; message: string }> {
    const { data, error } = await (this.supabase as any).rpc('fn_act_on_receipt_cancellation', {
      p_request_id: requestId,
      p_action: action,
      p_notes: notes ?? null,
    });
    if (error) {
      logger.error('billing/receipt-cancel', 'Action failed', { requestId, action, error });
      throw new Error(error.message || 'Failed to act on cancellation request');
    }
    const row = (data as Array<Record<string, any>> | null)?.[0];
    return {
      status: (row?.status ?? 'pending_approval') as CancelRequestStatus,
      receiptNumber: row?.receipt_number ?? '',
      message: row?.message ?? '',
    };
  }

  static async withdrawRequest(requestId: string, notes?: string): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_withdraw_receipt_cancellation', {
      p_request_id: requestId,
      p_notes: notes ?? null,
    });
    if (error) {
      logger.error('billing/receipt-cancel', 'Withdraw failed', { requestId, error });
      throw new Error(error.message || 'Failed to withdraw request');
    }
  }

  static async listRequests(filters: {
    status?: CancelRequestStatus | 'all';
    institutionIds?: string[];
  } = {}): Promise<ReceiptCancelRequest[]> {
    let query = (this.supabase as any)
      .from('billing_receipt_cancel_requests')
      .select('*')
      .order('requested_at', { ascending: false });

    if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
    // `??` not `||`: an empty string would flow through as a real filter value
    // and match nothing (the institutionId || '' antipattern).
    if (filters.institutionIds?.length) query = query.in('institution_id', filters.institutionIds);

    const { data, error } = await query;
    if (error) {
      logger.error('billing/receipt-cancel', 'List failed', error);
      throw new Error(error.message || 'Failed to load cancellation requests');
    }
    return (data ?? []) as ReceiptCancelRequest[];
  }

  static async getRequest(
    id: string
  ): Promise<{ request: ReceiptCancelRequest | null; actions: ReceiptCancelAction[] }> {
    const { data: request, error } = await (this.supabase as any)
      .from('billing_receipt_cancel_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Failed to load request');

    const { data: actions, error: actionsError } = await (this.supabase as any)
      .from('billing_receipt_cancel_request_actions')
      .select('*')
      .eq('request_id', id)
      .order('created_at', { ascending: true });
    if (actionsError) throw new Error(actionsError.message || 'Failed to load request history');

    return {
      request: (request ?? null) as ReceiptCancelRequest | null,
      actions: (actions ?? []) as ReceiptCancelAction[],
    };
  }

  /** Open requests keyed by receipt_id — drives the "Cancellation pending" badge. */
  static async getPendingByReceiptIds(receiptIds: string[]): Promise<Record<string, string>> {
    if (!receiptIds.length) return {};
    const { data, error } = await (this.supabase as any)
      .from('billing_receipt_cancel_requests')
      .select('id, receipt_id')
      .eq('status', 'pending_approval')
      .in('receipt_id', receiptIds);
    if (error) {
      logger.error('billing/receipt-cancel', 'Pending lookup failed', error);
      return {};
    }
    return Object.fromEntries(
      ((data ?? []) as Array<{ id: string; receipt_id: string }>).map((r) => [r.receipt_id, r.id])
    );
  }
}
