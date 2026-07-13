import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type {
  RefundFlowConfig, RefundRequest, RefundRequestFilters, InitiateRefundInput,
  EligibleRefundBill, RefundAttachment
} from '@/types/billing-refund-workflow';

const REQUEST_SELECT = `
  *,
  student:learners_profiles(id, first_name, last_name, roll_number, lifecycle_status),
  bills:billing_refund_request_bills(*, bill:billing_student_bills(id, bill_description, bill_amount, status)),
  actions:billing_refund_request_actions(*, actor:profiles(id, full_name))
`;

export class RefundWorkflowService {
  private static supabase = createClientSupabaseClient();

  static async getConfigs(): Promise<RefundFlowConfig[]> {
    const { data, error } = await (this.supabase as any)
      .from('billing_refund_flow_configs').select('*')
      .order('institution_id', { ascending: true, nullsFirst: true });
    if (error) throw new Error(getErrorMessage(error));
    return data ?? [];
  }

  static async saveConfig(cfg: Partial<RefundFlowConfig>): Promise<RefundFlowConfig> {
    const table = (this.supabase as any).from('billing_refund_flow_configs');
    const { data, error } = cfg.id
      ? await table.update(cfg).eq('id', cfg.id).select().single()
      : await table.insert(cfg).select().single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
  }

  static async deleteConfig(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('billing_refund_flow_configs').delete().eq('id', id);
    if (error) throw new Error(getErrorMessage(error));
  }

  static async getMyCapabilities(institutionId: string): Promise<{ configured: boolean; can_initiate: boolean }> {
    const { data, error } = await (this.supabase as any)
      .rpc('fn_my_refund_capabilities', { p_institution_id: institutionId });
    if (error) throw new Error(getErrorMessage(error));
    return data ?? { configured: false, can_initiate: false };
  }

  // Eligible = unrefunded paid money > 0. Computed client-side from bills +
  // receipt items + active request holds (single round-trip each).
  static async getEligibleBills(studentId: string): Promise<EligibleRefundBill[]> {
    const { data: bills, error } = await (this.supabase as any)
      .from('billing_student_bills')
      .select('id, bill_description, refunded_amount, receipt_items:billing_receipt_items(amount_paid)')
      .eq('student_id', studentId);
    if (error) throw new Error(getErrorMessage(error));

    const billIds = (bills ?? []).map((b: any) => b.id);
    let holds: Record<string, number> = {};
    if (billIds.length > 0) {
      const { data: holdRows, error: holdErr } = await (this.supabase as any)
        .from('billing_refund_request_bills')
        .select('bill_id, refund_amount, request:billing_refund_requests(status)')
        .in('bill_id', billIds);
      if (holdErr) throw new Error(getErrorMessage(holdErr));
      for (const h of holdRows ?? []) {
        if (['pending_review', 'pending_disbursement'].includes(h.request?.status)) {
          holds[h.bill_id] = (holds[h.bill_id] ?? 0) + Number(h.refund_amount);
        }
      }
    }
    return (bills ?? [])
      .map((b: any) => {
        const paid = (b.receipt_items ?? []).reduce((s: number, i: any) => s + Number(i.amount_paid ?? 0), 0);
        const refunded = Number(b.refunded_amount ?? 0);
        const held = holds[b.id] ?? 0;
        return {
          bill_id: b.id, bill_description: b.bill_description ?? '',
          paid_amount: paid, refunded_amount: refunded, held_amount: held,
          refundable: Math.max(0, paid - refunded - held)
        };
      })
      .filter((b: EligibleRefundBill) => b.refundable > 0);
  }

  static async initiate(input: InitiateRefundInput): Promise<string> {
    const { data, error } = await (this.supabase as any).rpc('fn_initiate_refund_request', {
      p_student_id: input.student_id,
      p_refund_type: input.refund_type,
      p_bills: input.bills,
      p_notes: input.notes,
      p_attachments: input.attachments
    });
    if (error) throw new Error(getErrorMessage(error));
    return data as string;
  }

  static async act(requestId: string, action: 'approve' | 'decline',
    opts: { notes?: string; attachments?: RefundAttachment[]; reason?: string }): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_act_on_refund_request', {
      p_request_id: requestId, p_action: action,
      p_notes: opts.notes ?? null, p_attachments: opts.attachments ?? [], p_reason: opts.reason ?? null
    });
    if (error) throw new Error(getErrorMessage(error));
  }

  static async disburse(requestId: string, opts: {
    paymentMode: string; paymentDetails: Record<string, unknown>;
    notes: string; attachments?: RefundAttachment[];
  }): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_disburse_refund_request', {
      p_request_id: requestId, p_payment_mode: opts.paymentMode,
      p_payment_details: opts.paymentDetails, p_notes: opts.notes,
      p_attachments: opts.attachments ?? []
    });
    if (error) throw new Error(getErrorMessage(error));
  }

  static async getRequest(id: string): Promise<RefundRequest> {
    const { data, error } = await (this.supabase as any)
      .from('billing_refund_requests').select(REQUEST_SELECT).eq('id', id).single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
  }

  static async getRequests(filters: RefundRequestFilters = {}) {
    let q = (this.supabase as any).from('billing_refund_requests')
      .select(REQUEST_SELECT, { count: 'exact' });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.refund_type) q = q.eq('refund_type', filters.refund_type);
    if (filters.institution_id) q = q.eq('institution_id', filters.institution_id);
    if (filters.student_id) q = q.eq('student_id', filters.student_id);
    if (filters.search) q = q.ilike('request_number', `%${filters.search}%`);
    if (filters.date_from) q = q.gte('initiated_at', filters.date_from);
    // date_to is a bare YYYY-MM-DD; initiated_at is timestamptz. Extend to the
    // end of that day so the selected end date stays inclusive (repo convention).
    if (filters.date_to) q = q.lte('initiated_at', `${filters.date_to}T23:59:59Z`);
    const page = filters.page ?? 1, limit = filters.limit ?? 10;
    q = q.order('initiated_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
    const { data, count, error } = await q;
    if (error) throw new Error(getErrorMessage(error));
    return {
      data: (data ?? []) as RefundRequest[],
      metadata: { total: count ?? 0, page, limit, totalPages: count ? Math.ceil(count / limit) : 0 }
    };
  }
}
