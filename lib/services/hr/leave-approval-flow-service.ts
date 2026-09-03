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
  LeaveApproverEntry,
  LeaveApproverRoleOption,
  LeaveFlowRunMode,
  LeaveFlowStepSource,
} from '@/types/hr-leave-types';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';

const FLOW_FOR = 'leave_approval';
const SELECT =
  'id, hr_organization_id, flow_name, conditions, steps, is_active, escalate_after_hours, ' +
  'step_source, run_mode, role_ladder, fallback_approver';

/** What the Leave Types table needs to label each row's approval state. */
export interface LeaveApprovalFlowCoverage {
  /** Leave type ids that have a flow naming them specifically. */
  ownFlowTypeIds: Set<string>;
  /** Organizations with a flow that names no leave type — their fallback. */
  orgsWithCatchAll: Set<string>;
}

export interface SaveLeaveApprovalFlowInput {
  /** Present when editing; absent creates the per-type flow. */
  id?: string;
  hrOrgId: string;
  leaveTypeId: string;
  flowName: string;
  steps: LeaveApprovalFlowStep[];
  /**
   * Where the steps come from and how they run — two INDEPENDENT settings, so
   * a ladder can be climbed (sequential) or opened to every superior at once
   * (parallel). Both default to the pre-2026-08-31 behaviour when omitted.
   */
  stepSource?: LeaveFlowStepSource;
  runMode?: LeaveFlowRunMode;
  /** Ordered role_keys, LOWEST rung first. Only meaningful for 'role_ladder'. */
  roleLadder?: string[];
  /** Where a request goes when nobody is above the applicant. */
  fallbackApprover?: LeaveApproverEntry | null;
}

export class LeaveApprovalFlowService {
  /**
   * Every active leave flow for one organization — the per-type ones plus the
   * catch-all. Fetched together so the editor can show which fallback applies
   * without a second round trip.
   */
  /**
   * Which leave types have their OWN approval flow, and which organizations
   * have a catch-all — enough to label every row of the Leave Types table
   * without a query per type.
   *
   * Deliberately unscoped by organization: the table shows every organization
   * the caller can access, and RLS on hr_approval_flows already limits the rows.
   * There are 22 active leave flows group-wide, so this is one small fetch.
   *
   * The three states it distinguishes matter. A leave type with no own flow is
   * NOT misconfigured — 58 of 66 active types legitimately inherit their
   * organization's catch-all. Only a type with neither is broken, and it is
   * broken hard: buildApprovalChain throws, so nobody can apply for it.
   */
  static async listCoverage(
    supabase: SupabaseClient
  ): Promise<LeaveApprovalFlowCoverage> {
    const { data, error } = await supabase
      .from('hr_approval_flows')
      .select('hr_organization_id, conditions')
      .eq('flow_for', FLOW_FOR)
      .eq('is_active', true)
      .is('valid_until', null);
    if (error) throw error;

    const ownFlowTypeIds = new Set<string>();
    const orgsWithCatchAll = new Set<string>();
    for (const row of (data ?? []) as Array<{
      hr_organization_id: string;
      conditions: { leave_type_id?: string } | null;
    }>) {
      const typeId = row.conditions?.leave_type_id;
      if (typeId) ownFlowTypeIds.add(typeId);
      else orgsWithCatchAll.add(row.hr_organization_id);
    }
    return { ownFlowTypeIds, orgsWithCatchAll };
  }

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
    // A ROLE-LADDER FLOW HAS NO STEPS OF ITS OWN — its chain is derived per
    // applicant at apply time, so requiring one here would make the mode
    // unsavable. What it needs instead is a non-empty ladder, which the CHECK
    // constraint also enforces so a direct write cannot skip it.
    if (input.stepSource === 'role_ladder') {
      if (!input.roleLadder || input.roleLadder.length === 0) {
        throw new Error(
          'A role-ladder flow needs at least one rung. Add the roles in order, lowest first.'
        );
      }
    } else if (input.steps.length === 0) {
      throw new Error('An approval flow needs at least one step.');
    }

    const steps: LeaveApprovalFlowStep[] = input.steps.map((s, i) => {
      // approvers[] is the shape everything reads now; the singular fields are
      // still written from the FIRST approver so a legacy reader — the database
      // gate's fallback branch, an old export — sees a coherent step rather than
      // an empty one.
      const approvers = (s.approvers ?? []).filter(
        (a) => a.approver_role || a.approver_user_id
      );
      const first = approvers[0];
      return {
        chain_order: i + 1,
        step_type: i === input.steps.length - 1 ? 'final' : 'review',
        approvers,
        quorum: s.quorum ?? 'any',
        approver_role: first
          ? first.approver_user_id
            ? first.approver_role || 'pinned_user'
            : first.approver_role ?? ''
          : s.approver_user_id
            ? s.approver_role || 'pinned_user'
            : s.approver_role,
        approver_user_id: first?.approver_user_id ?? s.approver_user_id ?? null,
        approver_name: first?.approver_name ?? (s.approver_user_id ? s.approver_name ?? null : null),
        escalate_after_hours: s.escalate_after_hours,
      };
    });

    const stepSource = input.stepSource ?? 'explicit';

    const row = {
      hr_organization_id: input.hrOrgId,
      flow_for: FLOW_FOR,
      flow_name: input.flowName,
      conditions: { leave_type_id: input.leaveTypeId },
      steps,
      is_active: true,
      step_source: stepSource,
      run_mode: input.runMode ?? 'sequential',
      // The CHECK constraint refuses a role_ladder flow with an empty ladder,
      // because that would resolve to nobody for every applicant — the silent
      // empty state this module has shipped twice.
      role_ladder: stepSource === 'role_ladder' ? input.roleLadder ?? [] : [],
      fallback_approver:
        input.fallbackApprover &&
        (input.fallbackApprover.approver_role || input.fallbackApprover.approver_user_id)
          ? input.fallbackApprover
          : null,
      // The row-level column is the fallback for steps that do not carry their
      // own; keep it in step with the first step so the two never disagree.
      escalate_after_hours: steps[0]?.escalate_after_hours ?? 48,
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

  /**
   * Everything awaiting a decision, with the requester's name, staff code and
   * institution, across every organisation the caller may approve for.
   *
   * Replaces listApplications() on the Approvals tab. That path embedded only
   * the leave type, so the queue named no one; scoped to a single
   * hr_organization_id, so a super admin saw one org or — with no HR employee
   * record — nothing at all; and inherited the REST route's pageSize 50, so it
   * stopped at 50 of 446 pending rows.
   */
  static async approvalQueue(
    supabase: SupabaseClient
  ): Promise<HRLeaveApprovalQueueRow[]> {
    const { data, error } = await supabase.rpc('hr_leave_approval_queue');
    if (error) throw error;
    return (data ?? []) as HRLeaveApprovalQueueRow[];
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
   *
   * roleKey narrows to holders of one custom_roles.role_key. It is passed to the
   * RPC rather than applied to the result because the RPC caps at 50 rows: the
   * largest organization has 152 candidates, so filtering the returned page
   * would search only the first third of them.
   */
  static async candidates(
    supabase: SupabaseClient,
    hrOrgId: string,
    search?: string,
    roleKey?: string
  ): Promise<LeaveApproverCandidate[]> {
    const { data, error } = await supabase.rpc('hr_leave_approver_candidates', {
      p_hr_organization_id: hrOrgId,
      p_search: search ?? null,
      p_role_key: roleKey ?? null,
    });
    if (error) throw error;
    return (data ?? []) as LeaveApproverCandidate[];
  }
}
