// Consultant commission payment approval workflow. Mirrors
// lib/services/billing/refunds/refund-workflow-service.ts; every write is an RPC
// from 20261228100000_consultant_commission_payment_workflow.sql.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type {
  CommissionPaymentAttachment,
  CommissionPaymentFlowConfig,
  CommissionPaymentMode,
  CommissionPaymentRequest,
  CommissionPaymentRequestFilters,
  InitiateCommissionPaymentInput,
  PayableCommissionLine,
} from '@/types/consultant-commission-payment';

/** Thrown by saveConfig() when another flow is active; the UI confirms and retries with replaceActive. */
export class CommissionPaymentFlowActiveConflictError extends Error {
  constructor(public conflicts: Array<{ id: string; name: string }>) {
    super(
      conflicts.length === 1
        ? `"${conflicts[0].name}" is already the active flow.`
        : `${conflicts.length} flows are already active and would need to be deactivated.`
    );
    this.name = 'CommissionPaymentFlowActiveConflictError';
  }
}

// RPC exception codes → messages a person can act on.
const RPC_MESSAGES: Record<string, string> = {
  not_authenticated: 'Your session has expired. Sign in again.',
  not_authorized: 'You do not have permission to configure commission approvals.',
  no_flow_configured: 'No commission approval flow is configured yet.',
  flow_has_no_stages: 'The active commission approval flow has no stages.',
  not_authorized_to_initiate: 'You are not allowed to initiate commission payments.',
  commissions_view_required: 'You need the "View Commissions" permission for this step.',
  notes_required: 'Notes are required.',
  reason_required: 'A decline reason is required.',
  no_lines_selected: 'Select at least one institution to pay.',
  not_current_stage_assignee: 'This request is waiting on someone else.',
  not_disburser: 'You are not allowed to disburse this payment.',
};

function rpcError(error: unknown): Error {
  const message = getErrorMessage(error);
  const code = message.split(/[:|]/)[0].trim();
  return new Error(RPC_MESSAGES[code] ?? message);
}

const REQUEST_SELECT = `
  *,
  consultant:education_consultants(id, name, code, bank_name, bank_account_number, bank_ifsc, pan_number),
  initiator:profiles!commission_payment_requests_initiated_by_fkey(id, full_name),
  lines:commission_payment_request_lines(*, group:commission_rate_card_groups(id, name)),
  actions:commission_payment_request_actions(*, actor:profiles(id, full_name))
`;

function normalise(r: any): CommissionPaymentRequest {
  return {
    ...r,
    total_amount: Number(r.total_amount ?? 0),
    lines: (r.lines ?? []).map((l: any) => ({
      ...l,
      earned_snapshot: Number(l.earned_snapshot),
      paid_snapshot: Number(l.paid_snapshot),
      balance_snapshot: Number(l.balance_snapshot),
      amount: Number(l.amount),
    })),
  };
}

export class CommissionPaymentService {
  private static supabase = createClientSupabaseClient();

  static async getConfigs(): Promise<CommissionPaymentFlowConfig[]> {
    const { data, error } = await (this.supabase as any)
      .from('commission_payment_flow_configs').select('*')
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return data ?? [];
  }

  static async saveConfig(
    cfg: Partial<CommissionPaymentFlowConfig>,
    opts: { replaceActive?: boolean } = {}
  ): Promise<CommissionPaymentFlowConfig> {
    const { data, error } = await (this.supabase as any).rpc('fn_save_commission_payment_flow_config', {
      p_id: cfg.id ?? null,
      p_name: cfg.name,
      p_initiator_roles: cfg.initiator_roles ?? [],
      p_initiator_users: cfg.initiator_users ?? [],
      p_stages: cfg.stages ?? [],
      p_disburser_roles: cfg.disburser_roles ?? [],
      p_disburser_users: cfg.disburser_users ?? [],
      p_is_active: cfg.is_active ?? true,
      p_replace_active: opts.replaceActive ?? false,
    });
    if (error) {
      const message = getErrorMessage(error);
      const conflict = /^active_flow_exists\|(.*)$/.exec(message);
      if (conflict) {
        try {
          throw new CommissionPaymentFlowActiveConflictError(JSON.parse(conflict[1]));
        } catch (parseError) {
          if (parseError instanceof CommissionPaymentFlowActiveConflictError) throw parseError;
        }
      }
      throw rpcError(error);
    }
    return data;
  }

  static async deleteConfig(id: string): Promise<void> {
    const { data, error } = await (this.supabase as any)
      .from('commission_payment_flow_configs').delete().eq('id', id).select('id');
    if (error) throw new Error(getErrorMessage(error));
    if (!data?.length) throw new Error('You do not have permission to delete this flow');
  }

  static async getRoleMembers(): Promise<Array<{ role_id: string; user_id: string }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_commission_payment_role_members');
    if (error) throw new Error(getErrorMessage(error));
    return data ?? [];
  }

  static async getMyCapabilities(): Promise<{ configured: boolean; can_initiate: boolean }> {
    const { data, error } = await (this.supabase as any).rpc('fn_my_commission_payment_capabilities');
    if (error) throw new Error(getErrorMessage(error));
    return data ?? { configured: false, can_initiate: false };
  }

  /**
   * Rate-card lines with money still to pay, less what open requests already
   * hold. The initiate RPC re-checks the same figure under a lock.
   */
  static async getPayableLines(consultantId: string, year: number): Promise<PayableCommissionLine[]> {
    const [earnings, holdsRes] = await Promise.all([
      ConsultantService.getConsultantRateCardEarnings(consultantId, year),
      (this.supabase as any)
        .from('commission_payment_request_lines')
        .select('group_id, amount, request:commission_payment_requests!inner(consultant_id, status)')
        .eq('request.consultant_id', consultantId)
        .in('request.status', ['pending_review', 'pending_disbursement']),
    ]);
    if (holdsRes.error) throw new Error(getErrorMessage(holdsRes.error));

    const held: Record<string, number> = {};
    for (const h of holdsRes.data ?? []) held[h.group_id] = (held[h.group_id] ?? 0) + Number(h.amount);

    return earnings
      .map(e => {
        const h = held[e.group_id] ?? 0;
        return {
          group_id: e.group_id,
          group_name: e.group_name,
          earned: e.total_amount ?? 0,
          paid: e.paid_amount,
          balance: e.balance_amount,
          held: h,
          payable: Math.max(0, e.balance_amount - h),
        };
      })
      .filter(l => l.balance > 0);
  }

  static async initiate(input: InitiateCommissionPaymentInput): Promise<string> {
    const { data, error } = await (this.supabase as any).rpc('fn_initiate_commission_payment_request', {
      p_consultant_id: input.consultant_id,
      p_academic_year: input.academic_year,
      p_lines: input.lines,
      p_notes: input.notes,
      p_attachments: input.attachments,
    });
    if (error) throw rpcError(error);
    return data as string;
  }

  static async act(
    requestId: string,
    action: 'approve' | 'decline',
    opts: { notes?: string; attachments?: CommissionPaymentAttachment[]; reason?: string }
  ): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_act_on_commission_payment_request', {
      p_request_id: requestId,
      p_action: action,
      p_notes: opts.notes ?? null,
      p_attachments: opts.attachments ?? [],
      p_reason: opts.reason ?? null,
    });
    if (error) throw rpcError(error);
  }

  static async disburse(
    requestId: string,
    opts: {
      paymentMode: CommissionPaymentMode;
      paymentDetails: Record<string, unknown>;
      notes: string;
      attachments?: CommissionPaymentAttachment[];
    }
  ): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_disburse_commission_payment_request', {
      p_request_id: requestId,
      p_payment_mode: opts.paymentMode,
      p_payment_details: opts.paymentDetails,
      p_notes: opts.notes,
      p_attachments: opts.attachments ?? [],
    });
    if (error) throw rpcError(error);
  }

  static async getRequest(id: string): Promise<CommissionPaymentRequest> {
    const { data, error } = await (this.supabase as any)
      .from('commission_payment_requests').select(REQUEST_SELECT).eq('id', id).single();
    if (error) throw new Error(getErrorMessage(error));
    return normalise(data);
  }

  static async getRequests(filters: CommissionPaymentRequestFilters = {}) {
    let q = (this.supabase as any)
      .from('commission_payment_requests')
      .select(REQUEST_SELECT, { count: 'exact' });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.consultant_id) q = q.eq('consultant_id', filters.consultant_id);
    if (filters.academic_year != null) q = q.eq('academic_year', filters.academic_year);
    if (filters.search) q = q.ilike('request_number', `%${filters.search}%`);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    q = q.order('initiated_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
    const { data, count, error } = await q;
    if (error) throw new Error(getErrorMessage(error));
    return {
      data: (data ?? []).map(normalise),
      metadata: { total: count ?? 0, page, limit, totalPages: count ? Math.ceil(count / limit) : 0 },
    };
  }
}
