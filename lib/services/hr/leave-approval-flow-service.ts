/**
 * Leave approval flows — who signs off which leave type.
 *
 * Backed by hr_approval_flows WHERE flow_for = 'leave_approval', the same table
 * and the same JSONB `steps` shape the recruitment flows use. That engine was
 * already wired into LeaveService.buildApprovalChain(); only the configuration
 * surface was missing, which is what this service provides.
 *
 * Resolution at apply-time is most-specific-wins:
 *   conditions.leave_type_id === thisType   ->  the per-type flow
 *   otherwise                               ->  the org catch-all (no leave_type_id)
 * Deleting a per-type flow therefore does not disable approval, it falls back.
 *
 * Supabase errors are plain objects, not Error instances, so every call
 * destructures { error } and throws it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LeaveApprovalFlow,
  LeaveApprovalFlowStep,
  LeaveApproverCandidate,
  LeaveApproverRoleOption,
} from '@/types/hr-leave-types';

const FLOW_FOR = 'leave_approval';
const SELECT =
  'id, hr_organization_id, flow_name, conditions, steps, is_active, escalate_after_hours';

export interface SaveLeaveApprovalFlowInput {
  /** Present when editing; absent creates the per-type flow. */
  id?: string;
  hrOrgId: string;
  leaveTypeId: string;
  flowName: string;
  steps: LeaveApprovalFlowStep[];
}

export class LeaveApprovalFlowService {
  /**
   * Every active leave flow for one organization — the per-type ones plus the
   * catch-all. Fetched together so the editor can show which fallback applies
   * without a second round trip.
   */
  static async listForOrg(
    supabase: SupabaseClient,
    hrOrgId: string
  ): Promise<LeaveApprovalFlow[]> {
    const { data, error } = await supabase
      .from('hr_approval_flows')
      .select(SELECT)
      .eq('hr_organization_id', hrOrgId)
      .eq('flow_for', FLOW_FOR)
      .eq('is_active', true)
      .is('valid_until', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as LeaveApprovalFlow[];
  }

  /**
   * The flow that would actually be frozen onto an application for this leave
   * type, plus whether it is the type's own or the inherited catch-all.
   *
   * The match mirrors buildApprovalChain() exactly. If the two ever disagree the
   * editor would show a chain that is not the one applied, which is the failure
   * mode this whole feature exists to remove.
   */
  static async resolveForLeaveType(
    supabase: SupabaseClient,
    hrOrgId: string,
    leaveTypeId: string
  ): Promise<{
    own: LeaveApprovalFlow | null;
    fallback: LeaveApprovalFlow | null;
    effective: LeaveApprovalFlow | null;
  }> {
    const flows = await this.listForOrg(supabase, hrOrgId);
    const own = flows.find((f) => f.conditions?.leave_type_id === leaveTypeId) ?? null;
    const fallback = flows.find((f) => !f.conditions?.leave_type_id) ?? null;
    return { own, fallback, effective: own ?? fallback };
  }

  /**
   * Create or replace the per-type flow.
   *
   * chain_order and step_type are derived from list position rather than trusted
   * from the caller: buildApprovalChain() sorts on chain_order, and a chain whose
   * last step is not 'final' can never complete.
   */
  static async save(
    supabase: SupabaseClient,
    input: SaveLeaveApprovalFlowInput
  ): Promise<LeaveApprovalFlow> {
    if (input.steps.length === 0) {
      throw new Error('An approval flow needs at least one step.');
    }

    const steps: LeaveApprovalFlowStep[] = input.steps.map((s, i) => ({
      chain_order: i + 1,
      step_type: i === input.steps.length - 1 ? 'final' : 'review',
      approver_role: s.approver_user_id ? (s.approver_role || 'pinned_user') : s.approver_role,
      approver_user_id: s.approver_user_id ?? null,
      approver_name: s.approver_user_id ? (s.approver_name ?? null) : null,
      escalate_after_hours: s.escalate_after_hours,
    }));

    const row = {
      hr_organization_id: input.hrOrgId,
      flow_for: FLOW_FOR,
      flow_name: input.flowName,
      conditions: { leave_type_id: input.leaveTypeId },
      steps,
      is_active: true,
      // The row-level column is the fallback for steps that do not carry their
      // own; keep it in step with the first step so the two never disagree.
      escalate_after_hours: steps[0].escalate_after_hours,
      updated_at: new Date().toISOString(),
    };

    const query = input.id
      ? supabase.from('hr_approval_flows').update(row).eq('id', input.id)
      : supabase.from('hr_approval_flows').insert(row);

    const { data, error } = await query.select(SELECT).single();
    if (error) throw error;
    return data as LeaveApprovalFlow;
  }

  /**
   * Drop the per-type flow so the leave type inherits the organization
   * catch-all again. Deactivates rather than deletes: in-flight applications
   * hold a frozen copy, but the row is still useful history.
   */
  static async clear(supabase: SupabaseClient, flowId: string): Promise<void> {
    const { error } = await supabase
      .from('hr_approval_flows')
      .update({ is_active: false, valid_until: new Date().toISOString() })
      .eq('id', flowId);
    if (error) throw error;
  }

  /**
   * Ids of the applications whose CURRENT step this caller can actually decide.
   *
   * Lives beside the flow editor rather than in LeaveService because it shares
   * the flow-resolution semantics: the RPC applies the same three tests as
   * trg_hla_approver_gate (pinned to me / a role I hold / a placeholder), so the
   * queue and the enforcement cannot drift apart. Ids only — the rows already
   * arrive through the existing list query under RLS.
   */
  static async myQueueIds(
    supabase: SupabaseClient,
    hrOrgId?: string
  ): Promise<string[]> {
    const { data, error } = await supabase.rpc('hr_leave_my_approval_queue', {
      p_hr_organization_id: hrOrgId ?? null,
    });
    if (error) throw error;
    return ((data ?? []) as Array<{ application_id: string }>).map((r) => r.application_id);
  }

  /** Roles offerable as approvers, flagged with whether they can actually approve. */
  static async roleOptions(supabase: SupabaseClient): Promise<LeaveApproverRoleOption[]> {
    const { data, error } = await supabase.rpc('hr_leave_approver_role_options');
    if (error) throw error;
    return (data ?? []) as LeaveApproverRoleOption[];
  }

  /**
   * People pinnable as approvers. Returns profiles.id — the auth uid the
   * approval gate compares against, NOT staff.id.
   */
  static async candidates(
    supabase: SupabaseClient,
    hrOrgId: string,
    search?: string
  ): Promise<LeaveApproverCandidate[]> {
    const { data, error } = await supabase.rpc('hr_leave_approver_candidates', {
      p_hr_organization_id: hrOrgId,
      p_search: search ?? null,
    });
    if (error) throw error;
    return (data ?? []) as LeaveApproverCandidate[];
  }
}
