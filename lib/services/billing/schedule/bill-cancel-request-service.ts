// Bill cancellation requires approval.
//
// Accounts staff (billing.schedule.cancel.request) RAISE a request with the
// reason + documents (fn_request_bill_cancellation); whoever the bill-cancel
// approval flow names DECIDES it (fn_act_on_bill_cancellation). Approval is
// what actually voids the bill — there is no direct cancel route any more, and
// trg_billing_bills_guard_cancel rejects every other write into 'cancelled'.
//
// Every write is a SECURITY DEFINER RPC that authorizes itself; RLS on the
// request/action tables is SELECT-only, so the history cannot be edited by
// whoever it incriminates. Reads below are plain selects under that RLS.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  BillCancelAction,
  BillCancelEligibility,
  BillCancelLearner,
  BillCancelRequest,
  BillCancelRequestDetail,
  BillCancelRequestStatus,
  RequestBillCancelInput,
} from '@/types/billing-bill-cancel-request';

export class BillCancelRequestService {
  private static supabase = createClientSupabaseClient();

  /** Raise a request. Throws the RPC's guard message verbatim (it names the receipt to cancel first). */
  static async requestCancellation(
    input: RequestBillCancelInput
  ): Promise<{ requestId: string; requestNumber: string }> {
    const { data, error } = await (this.supabase as any).rpc('fn_request_bill_cancellation', {
      p_bill_id: input.billId,
      p_reason_code: input.reasonCode,
      p_reason: input.reason,
      p_attachments: input.attachments,
    });
    if (error) {
      logger.error('billing/bill-cancel-request', 'Request failed', { billId: input.billId, error });
      throw new Error(error.message || 'Failed to request bill cancellation');
    }
    const row = (data as Array<{ request_id: string; request_number: string }> | null)?.[0];
    return { requestId: row?.request_id ?? '', requestNumber: row?.request_number ?? '' };
  }

  /** One request per bill under a shared reason + document set; per-bill failures are collected, not thrown. */
  static async bulkRequest(
    billIds: string[],
    payload: Omit<RequestBillCancelInput, 'billId'>
  ): Promise<{ success: string[]; failed: Array<{ id: string; error: string }> }> {
    const result = { success: [] as string[], failed: [] as Array<{ id: string; error: string }> };
    for (const billId of billIds) {
      try {
        await this.requestCancellation({ billId, ...payload });
        result.success.push(billId);
      } catch (err) {
        result.failed.push({ id: billId, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }
    return result;
  }

  static async actOnRequest(
    requestId: string,
    action: 'approve' | 'decline',
    notes?: string
  ): Promise<{ status: string; requestNumber: string; message: string }> {
    const { data, error } = await (this.supabase as any).rpc('fn_act_on_bill_cancellation', {
      p_request_id: requestId,
      p_action: action,
      p_notes: notes ?? null,
    });
    if (error) {
      logger.error('billing/bill-cancel-request', 'Decision failed', { requestId, action, error });
      throw new Error(error.message || 'Failed to act on request');
    }
    const row = (data as Array<{ status: string; request_number: string; message: string }> | null)?.[0];
    return {
      status: row?.status ?? '',
      requestNumber: row?.request_number ?? '',
      message: row?.message ?? '',
    };
  }

  static async withdrawRequest(requestId: string, notes?: string): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_withdraw_bill_cancellation', {
      p_request_id: requestId,
      p_notes: notes ?? null,
    });
    if (error) {
      logger.error('billing/bill-cancel-request', 'Withdraw failed', { requestId, error });
      throw new Error(error.message || 'Failed to withdraw request');
    }
  }

  /** Server-side page of requests for the queue table. */
  static async listRequestsPaged(params: {
    page: number;
    limit: number;
    search?: string;
    status?: BillCancelRequestStatus | 'all';
    institutionIds?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ data: BillCancelRequest[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(200, Math.max(1, params.limit || 10));

    // Only columns that exist on the table may be sorted, or Postgres 42703s.
    const SORTABLE = new Set(['requested_at', 'decided_at', 'request_number', 'status', 'amount', 'requested_by_name']);
    const sortBy = SORTABLE.has(params.sortBy ?? '') ? params.sortBy! : 'requested_at';

    let query = (this.supabase as any)
      .from('billing_bill_cancel_requests')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: params.sortOrder === 'asc' });

    if (params.status && params.status !== 'all') query = query.eq('status', params.status);
    if (params.institutionIds?.length) query = query.in('institution_id', params.institutionIds);

    const search = params.search?.trim().replace(/[%,()]/g, '');
    if (search) {
      query = query.or(
        [
          `request_number.ilike.%${search}%`,
          `reason.ilike.%${search}%`,
          `requested_by_name.ilike.%${search}%`,
          `bill_snapshot->>bill_description.ilike.%${search}%`,
        ].join(',')
      );
    }

    const from = (page - 1) * limit;
    const { data, error, count } = await query.range(from, from + limit - 1);
    if (error) {
      logger.error('billing/bill-cancel-request', 'Paged list failed', error);
      throw new Error(error.message || 'Failed to load bill cancellation requests');
    }
    return { data: (data ?? []) as BillCancelRequest[], total: count ?? 0 };
  }

  /** Request + full action history + learner + the live bill row. */
  static async getRequestDetail(id: string): Promise<BillCancelRequestDetail> {
    const { data: request, error } = await (this.supabase as any)
      .from('billing_bill_cancel_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Failed to load request');

    const { data: actions, error: actionsError } = await (this.supabase as any)
      .from('billing_bill_cancel_request_actions')
      .select('*')
      .eq('request_id', id)
      .order('created_at', { ascending: true });
    if (actionsError) throw new Error(actionsError.message || 'Failed to load request history');

    if (!request) return { request: null, actions: [], learner: null, bill: null };

    const req = request as BillCancelRequest;
    const [learner, bill] = await Promise.all([
      this.fetchLearner(req.student_id),
      req.bill_id
        ? (this.supabase as any)
            .from('billing_student_bills')
            .select('id, status, final_amount, balance_amount, bill_description')
            .eq('id', req.bill_id)
            .maybeSingle()
            .then((r: any) => r.data ?? null)
        : Promise.resolve(null),
    ]);

    return { request: req, actions: (actions ?? []) as BillCancelAction[], learner, bill };
  }

  private static async fetchLearner(studentId: string | null): Promise<BillCancelLearner | null> {
    if (!studentId) return null;
    const { data, error } = await (this.supabase as any)
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, register_number, institution_id, program_id')
      .eq('id', studentId)
      .maybeSingle();
    if (error || !data) return null;

    // Separate lookups so a missing name degrades to a dash instead of
    // dropping the learner (which an !inner embed would do).
    const [institution, program] = await Promise.all([
      this.lookupName('institutions', 'name', data.institution_id),
      this.lookupName('programs', 'program_name', data.program_id),
    ]);
    return {
      id: data.id,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      roll_number: data.roll_number ?? null,
      register_number: data.register_number ?? null,
      institution_name: institution,
      program_name: program,
    };
  }

  private static async lookupName(table: string, column: string, id: string | null | undefined) {
    if (!id) return null;
    const { data } = await (this.supabase as any).from(table).select(column).eq('id', id).maybeSingle();
    return (data?.[column] as string | undefined) ?? null;
  }

  /**
   * Can each bill be put up for cancellation? Keyed by bill_id. The same
   * function the request RPC guards on, so the button and the rule agree.
   */
  static async getEligibility(billIds: string[]): Promise<Record<string, BillCancelEligibility>> {
    if (!billIds.length) return {};
    const { data, error } = await (this.supabase as any).rpc('fn_bill_cancel_eligibility', {
      p_bill_ids: billIds,
    });
    if (error) {
      logger.error('billing/bill-cancel-request', 'Eligibility lookup failed', error);
      throw new Error(error.message || 'Failed to check cancellation eligibility');
    }
    return Object.fromEntries(
      ((data ?? []) as BillCancelEligibility[]).map((r) => [
        r.bill_id,
        { ...r, receipted_amount: Number(r.receipted_amount) || 0 },
      ])
    );
  }
}
