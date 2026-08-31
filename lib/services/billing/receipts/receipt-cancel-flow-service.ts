// Who may decide a receipt-cancellation request.
//
// Approval used to be hardcoded to is_super_admin(). A super admin can now
// name an approver per institution, with an optional group-wide default.
// Resolution is "most specific wins": institution flow, then group-wide, then
// NOTHING — and nothing means super-admin-only, exactly as before this
// existed. That fallback is why configuring no flows changes no behaviour.
//
// Writes are gated by RLS on is_super_admin(); this service does not re-check
// it, because a client-side check is a UI affordance, not a control.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface ReceiptCancelApprovalFlow {
  id: string;
  institution_id: string | null;
  flow_name: string;
  approver_role_key: string | null;
  approver_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** A flow plus the labels needed to render it without a second lookup. */
export interface ReceiptCancelApprovalFlowView extends ReceiptCancelApprovalFlow {
  institution_name: string | null;
  approver_role_name: string | null;
  approver_user_name: string | null;
  /**
   * True when the named role cannot read receipts. Such an approver can act on
   * the RPC but would open the queue to an empty list, so the UI warns at save
   * time instead of letting it be discovered in production.
   */
  approver_role_lacks_receipts_view: boolean;
}

export interface UpsertReceiptCancelFlowDto {
  id?: string;
  /** null = group-wide default. */
  institution_id: string | null;
  flow_name: string;
  approver_role_key: string | null;
  approver_user_id: string | null;
  is_active?: boolean;
}

export class ReceiptCancelFlowService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * All flows with their display labels.
   *
   * Labels are resolved with separate lookups rather than PostgREST embeds:
   * approver_user_id and created_by/updated_by are three FKs from this table to
   * profiles, and a second FK to the same target is exactly what breaks embeds
   * in this codebase.
   */
  static async list(): Promise<ReceiptCancelApprovalFlowView[]> {
    const { data, error } = await (this.supabase as any)
      .from('billing_receipt_cancel_approval_flows')
      .select('*')
      .order('institution_id', { nullsFirst: true })
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('billing/receipt-cancel-flow', 'List failed', error);
      throw new Error(error.message || 'Failed to load approval flows');
    }

    const flows = (data ?? []) as ReceiptCancelApprovalFlow[];
    if (flows.length === 0) return [];

    const institutionIds = [
      ...new Set(flows.map((f) => f.institution_id).filter(Boolean)),
    ] as string[];
    const roleKeys = [
      ...new Set(flows.map((f) => f.approver_role_key).filter(Boolean)),
    ] as string[];
    const userIds = [
      ...new Set(flows.map((f) => f.approver_user_id).filter(Boolean)),
    ] as string[];

    const [institutions, roles, users] = await Promise.all([
      institutionIds.length
        ? (this.supabase as any)
            .from('institutions')
            .select('id, name')
            .in('id', institutionIds)
        : Promise.resolve({ data: [] }),
      roleKeys.length
        ? (this.supabase as any)
            .from('custom_roles')
            .select('role_key, role_name, permissions')
            .in('role_key', roleKeys)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? (this.supabase as any)
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const instById = new Map(
      ((institutions as any).data ?? []).map((i: any) => [i.id, i.name])
    );
    const roleByKey = new Map(
      ((roles as any).data ?? []).map((r: any) => [r.role_key, r])
    );
    const userById = new Map(
      ((users as any).data ?? []).map((u: any) => [u.id, u])
    );

    return flows.map((f) => {
      const role = f.approver_role_key
        ? (roleByKey.get(f.approver_role_key) as any)
        : null;
      const user = f.approver_user_id
        ? (userById.get(f.approver_user_id) as any)
        : null;
      return {
        ...f,
        institution_name: f.institution_id
          ? ((instById.get(f.institution_id) as string) ?? null)
          : null,
        approver_role_name: role?.role_name ?? null,
        approver_user_name: user?.full_name ?? user?.email ?? null,
        // Test the VALUE, not key presence: `permissions ? 'key'` is true for
        // an explicit false and would clear the warning on a role that cannot
        // actually read receipts.
        approver_role_lacks_receipts_view: role
          ? role.permissions?.['billing.receipts.view'] !== true
          : false,
      };
    });
  }

  static async upsert(dto: UpsertReceiptCancelFlowDto): Promise<void> {
    const payload = {
      institution_id: dto.institution_id,
      flow_name: dto.flow_name.trim(),
      // '' would flow through as a real value and violate the one-approver
      // CHECK; normalise to null the way every nullable FK here must be.
      approver_role_key: dto.approver_role_key || null,
      approver_user_id: dto.approver_user_id || null,
      is_active: dto.is_active ?? true,
      updated_at: new Date().toISOString(),
    };

    const { error } = dto.id
      ? await (this.supabase as any)
          .from('billing_receipt_cancel_approval_flows')
          .update(payload)
          .eq('id', dto.id)
      : await (this.supabase as any)
          .from('billing_receipt_cancel_approval_flows')
          .insert(payload);

    if (error) {
      logger.error('billing/receipt-cancel-flow', 'Upsert failed', error);
      // 23505 is the partial unique index: one active flow per institution.
      if (error.code === '23505') {
        throw new Error(
          'An active approval flow already exists for that institution. Deactivate it first.'
        );
      }
      throw new Error(error.message || 'Failed to save the approval flow');
    }
  }

  static async remove(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('billing_receipt_cancel_approval_flows')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('billing/receipt-cancel-flow', 'Delete failed', error);
      throw new Error(error.message || 'Failed to delete the approval flow');
    }
  }

  /**
   * Can the CURRENT user decide this request? Answered by the same RPC the
   * write path uses, so the button and the RPC cannot disagree.
   *
   * Four-eyes is NOT part of this answer — the caller knows whether it is the
   * requester and reports that separately, so "not an approver" and "your own
   * request" stay distinguishable on screen.
   */
  static async canDecide(requestId: string): Promise<boolean> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_can_decide_receipt_cancellation',
      { p_request_id: requestId }
    );
    if (error) {
      logger.error('billing/receipt-cancel-flow', 'canDecide failed', error);
      return false; // fail closed
    }
    return data === true;
  }

  /**
   * Candidate people for a "Person" flow.
   *
   * Searched rather than listed: there are 7,600+ profiles, so a dropdown is
   * not an option. Students are excluded — naming one as the approver of a
   * money reversal is never intended, and the RPC would refuse them anyway.
   */
  static async searchApprovers(
    term: string
  ): Promise<Array<{ id: string; full_name: string | null; email: string | null; role: string | null }>> {
    const search = term.trim();
    if (search.length < 2) return [];

    const escaped = search.replace(/[%,]/g, '');
    if (!escaped) return [];

    const { data, error } = await (this.supabase as any)
      .from('profiles')
      .select('id, full_name, email, role')
      .neq('role', 'student')
      .or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
      .order('full_name')
      .limit(20);

    if (error) {
      logger.error('billing/receipt-cancel-flow', 'Approver search failed', error);
      return [];
    }
    return data ?? [];
  }

  /**
   * "Am I an approver anywhere?" — for the page guard. Same function the RLS
   * policy calls with an institution, so page access and row visibility cannot
   * disagree about who this feature is for.
   */
  static async isApproverAnywhere(): Promise<boolean> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_is_receipt_cancel_approver',
      { p_institution_id: null }
    );
    if (error) {
      logger.error('billing/receipt-cancel-flow', 'isApproverAnywhere failed', error);
      return false; // fail closed
    }
    return data === true;
  }

  /** The flow that governs an institution, for "Pending with …". */
  static async resolveForInstitution(
    institutionId: string | null
  ): Promise<ReceiptCancelApprovalFlowView | null> {
    if (!institutionId) return null;
    const all = await this.list();
    const active = all.filter((f) => f.is_active);
    return (
      active.find((f) => f.institution_id === institutionId) ??
      active.find((f) => f.institution_id === null) ??
      null
    );
  }
}
