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

/** Learner the receipt was issued to, resolved live for the detail view. */
export interface ReceiptCancelLearner {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  register_number: string | null;
  college_email: string | null;
  student_mobile: string | null;
  lifecycle_status: string | null;
  institution_name: string | null;
  program_name: string | null;
  department_name: string | null;
}

/** One bill the receipt was allocated against. */
export interface ReceiptCancelBillLine {
  bill_id: string;
  amount_paid: number;
  allocation_reason: string | null;
  bill_description: string | null;
  final_amount: number | null;
  balance_amount: number | null;
  status: string | null;
  due_date: string | null;
}

export interface ReceiptCancelRequestDetail {
  request: ReceiptCancelRequest | null;
  actions: ReceiptCancelAction[];
  learner: ReceiptCancelLearner | null;
  /**
   * Bills this receipt settled. EMPTY once a request is approved — approval
   * archives the receipt, so billing_receipt_items no longer has rows for it.
   * `receipt_snapshot` on the request is what survives; the UI falls back to it.
   */
  bills: ReceiptCancelBillLine[];
  /** True while the underlying receipt still exists (i.e. not yet approved). */
  receiptStillExists: boolean;
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

  /**
   * Server-side page of requests for the advanced DataTable.
   *
   * Search spans the four fields an approver actually recognises a request by:
   * its own number, the receipt number (inside the JSONB snapshot, so it stays
   * searchable after approval archives the receipt), the reason, and who raised
   * it. One `.or()` group — this is a single token, not the multi-token case
   * that needs a chained `.or()` per word.
   */
  static async listRequestsPaged(params: {
    page: number;
    limit: number;
    search?: string;
    status?: CancelRequestStatus | 'all';
    institutionIds?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    data: ReceiptCancelRequest[];
    total: number;
  }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(200, Math.max(1, params.limit || 10));

    // Only columns that exist on the table may be sorted, or Postgres 42703s.
    const SORTABLE = new Set([
      'requested_at',
      'decided_at',
      'request_number',
      'status',
      'requested_by_name',
    ]);
    const sortBy = SORTABLE.has(params.sortBy ?? '') ? params.sortBy! : 'requested_at';
    const ascending = params.sortOrder === 'asc';

    let query = (this.supabase as any)
      .from('billing_receipt_cancel_requests')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending });

    if (params.status && params.status !== 'all') query = query.eq('status', params.status);
    if (params.institutionIds?.length) query = query.in('institution_id', params.institutionIds);

    const search = params.search?.trim();
    if (search) {
      const escaped = search.replace(/[%,]/g, '');
      if (escaped) {
        query = query.or(
          [
            `request_number.ilike.%${escaped}%`,
            `reason.ilike.%${escaped}%`,
            `requested_by_name.ilike.%${escaped}%`,
            `receipt_snapshot->>receipt_number.ilike.%${escaped}%`,
          ].join(',')
        );
      }
    }

    const from = (page - 1) * limit;
    const { data, error, count } = await query.range(from, from + limit - 1);
    if (error) {
      logger.error('billing/receipt-cancel', 'Paged list failed', error);
      throw new Error(error.message || 'Failed to load cancellation requests');
    }
    return { data: (data ?? []) as ReceiptCancelRequest[], total: count ?? 0 };
  }

  /**
   * Everything the detail dialog shows: the request, its action trail, the
   * learner, and the bills the receipt settled.
   *
   * Deliberately several small selects rather than one embedded query. The
   * bills hop is receipt → billing_receipt_items → billing_student_bills, and
   * PostgREST embeds through a join table break outright when a table gains a
   * second FK to the same target — a trap this codebase has already hit.
   */
  static async getRequestDetail(id: string): Promise<ReceiptCancelRequestDetail> {
    const { request, actions } = await this.getRequest(id);
    if (!request) {
      return { request: null, actions, learner: null, bills: [], receiptStillExists: false };
    }

    const [learner, bills, receiptStillExists] = await Promise.all([
      this.fetchLearner(request.student_id),
      this.fetchAllocatedBills(request.receipt_id),
      this.receiptExists(request.receipt_id),
    ]);

    return { request, actions, learner, bills, receiptStillExists };
  }

  private static async fetchLearner(
    studentId: string | null
  ): Promise<ReceiptCancelLearner | null> {
    if (!studentId) return null;

    const { data, error } = await (this.supabase as any)
      .from('learners_profiles')
      .select(
        'id, first_name, last_name, roll_number, register_number, college_email, student_mobile, lifecycle_status, institution_id, program_id, department_id'
      )
      .eq('id', studentId)
      .maybeSingle();
    if (error || !data) return null;

    // Resolved separately so a missing lookup row degrades to a dash instead of
    // dropping the learner entirely, which an !inner embed would do.
    const [institution, program, department] = await Promise.all([
      this.lookupName('institutions', 'name', data.institution_id),
      this.lookupName('programs', 'program_name', data.program_id),
      this.lookupName('departments', 'department_name', data.department_id),
    ]);

    return {
      id: data.id,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      roll_number: data.roll_number ?? null,
      register_number: data.register_number ?? null,
      college_email: data.college_email ?? null,
      student_mobile: data.student_mobile ?? null,
      lifecycle_status: data.lifecycle_status ?? null,
      institution_name: institution,
      program_name: program,
      department_name: department,
    };
  }

  private static async lookupName(
    table: string,
    column: string,
    id: string | null | undefined
  ): Promise<string | null> {
    if (!id) return null;
    const { data } = await (this.supabase as any)
      .from(table)
      .select(column)
      .eq('id', id)
      .maybeSingle();
    return (data?.[column] as string | undefined) ?? null;
  }

  private static async fetchAllocatedBills(
    receiptId: string
  ): Promise<ReceiptCancelBillLine[]> {
    const { data: items, error } = await (this.supabase as any)
      .from('billing_receipt_items')
      .select('bill_id, amount_paid, allocation_reason')
      .eq('receipt_id', receiptId);
    if (error || !items?.length) return [];

    const billIds = [...new Set(items.map((i: any) => i.bill_id).filter(Boolean))];
    const { data: bills } = billIds.length
      ? await (this.supabase as any)
          .from('billing_student_bills')
          .select('id, bill_description, final_amount, balance_amount, status, due_date')
          .in('id', billIds)
      : { data: [] };

    const byId = new Map((bills ?? []).map((b: any) => [b.id, b]));
    return items.map((item: any) => {
      const bill = byId.get(item.bill_id) as any;
      return {
        bill_id: item.bill_id,
        amount_paid: Number(item.amount_paid) || 0,
        allocation_reason: item.allocation_reason ?? null,
        bill_description: bill?.bill_description ?? null,
        final_amount: bill?.final_amount ?? null,
        balance_amount: bill?.balance_amount ?? null,
        status: bill?.status ?? null,
        due_date: bill?.due_date ?? null,
      };
    });
  }

  private static async receiptExists(receiptId: string): Promise<boolean> {
    const { data } = await (this.supabase as any)
      .from('billing_receipts')
      .select('id')
      .eq('id', receiptId)
      .maybeSingle();
    return !!data;
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
