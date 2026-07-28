import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type {
  RefundFlowConfig, RefundRequest, RefundRequestFilters, InitiateRefundInput,
  EligibleRefundBill, RefundAttachment
} from '@/types/billing-refund-workflow';

// Thrown by saveConfig() when activating this config would leave more than
// one active flow governing the same requests. Two rules can trigger it:
// same scope already has a different active flow (uq_refund_flow_global_active /
// uq_refund_flow_institution_active allow only one), or Global vs
// institution-specific are mutually exclusive (a Global flow and ANY active
// institution-specific flow can't coexist — deactivating a Global flow can
// mean several institution-specific flows must go, and vice versa). The UI
// catches this to list every flow that would be deactivated and ask for
// confirmation instead of surfacing the raw constraint violation.
export class RefundFlowActiveConflictError extends Error {
  constructor(public conflicts: Array<{ id: string; name: string }>) {
    super(
      conflicts.length === 1
        ? `"${conflicts[0].name}" is already active and covers this scope.`
        : `${conflicts.length} flows are already active and would need to be deactivated.`
    );
    this.name = 'RefundFlowActiveConflictError';
  }
}

const REQUEST_SELECT = `
  *,
  student:learners_profiles(id, first_name, last_name, roll_number, lifecycle_status),
  bills:billing_refund_request_bills(*, bill:billing_student_bills(id, bill_description, bill_amount:final_amount, status)),
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

  static async saveConfig(
    cfg: Partial<RefundFlowConfig>,
    opts: { replaceActive?: boolean } = {}
  ): Promise<RefundFlowConfig> {
    const { data, error } = await (this.supabase as any).rpc('fn_save_refund_flow_config', {
      p_id: cfg.id ?? null,
      p_institution_id: cfg.institution_id ?? null,
      p_name: cfg.name,
      p_initiator_roles: cfg.initiator_roles ?? [],
      p_initiator_users: cfg.initiator_users ?? [],
      p_stages: cfg.stages ?? [],
      p_disburser_roles: cfg.disburser_roles ?? [],
      p_disburser_users: cfg.disburser_users ?? [],
      p_is_active: cfg.is_active ?? true,
      p_replace_active: opts.replaceActive ?? false
    });
    if (error) {
      const message = getErrorMessage(error);
      const conflict = /^active_flow_exists\|(.*)$/.exec(message);
      if (conflict) {
        try {
          const parsed = JSON.parse(conflict[1]) as Array<{ id: string; name: string }>;
          throw new RefundFlowActiveConflictError(parsed);
        } catch (parseError) {
          if (parseError instanceof RefundFlowActiveConflictError) throw parseError;
          // Fell through from a malformed payload — surface the raw message rather than hide it.
        }
      }
      throw new Error(message);
    }
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
