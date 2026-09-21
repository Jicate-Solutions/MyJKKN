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
  LeaveChainResyncResult,
  LeaveFlowFor,
  LeaveFlowRunMode,
  LeaveFlowStepSource,
  LeaveStaffGroup,
} from '@/types/hr-leave-types';
import { pickLeaveFlow } from '@/lib/hr/leave/approval-chain';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';

/**
 * The default everywhere a caller does not say otherwise, so every reader that
 * predates eligibility flows (2026-09-21) keeps asking about leave approval.
 */
const FLOW_FOR: LeaveFlowFor = 'leave_approval';
const SELECT =
  'id, hr_organization_id, flow_name, conditions, steps, is_active, escalate_after_hours, ' +
  'step_source, run_mode, role_ladder, fallback_approver';

/** What the Leave Types table needs to label each row's approval state. */
export interface LeaveApprovalFlowCoverage {
  /**
   * Leave type ids with an ALL-STAFF flow naming them specifically. A type
   * whose only flow is a group one is deliberately not here: it still inherits
   * the catch-all for everybody else, and calling that "Own flow" would hide
   * the half of its staff that is not covered.
   */
  ownFlowTypeIds: Set<string>;
  /** Organizations with a flow that names no leave type — their fallback. */
  orgsWithCatchAll: Set<string>;
  /** Which groups each leave type overrides, for the chips on the row. */
  groupFlows: Map<string, Set<LeaveStaffGroup>>;
  /**
   * Leave types with an ELIGIBILITY flow of their own, and organizations with
   * an eligibility catch-all. Only meaningful for a type that requires
   * eligibility; a gated type in neither set routes its requests to the leave
   * flow, which is the documented fallback rather than a misconfiguration.
   */
  eligibilityFlowTypeIds: Set<string>;
  orgsWithEligibilityCatchAll: Set<string>;
}

export interface SaveLeaveApprovalFlowInput {
  /** Present when editing; absent creates the per-type flow. */
  id?: string;
  hrOrgId: string;
  leaveTypeId: string;
  flowName: string;
  steps: LeaveApprovalFlowStep[];
  /**
   * Which decision this flow governs. Defaults to leave approval. An
   * eligibility flow may not carry a staffGroup — save() refuses it and the
   * database CHECK refuses it again.
   */
  flowFor?: LeaveFlowFor;
  /**
   * Where the steps come from and how they run — two INDEPENDENT settings, so
   * a ladder can be climbed (sequential) or opened to every superior at once
   * (parallel). Both default to the pre-2026-08-31 behaviour when omitted.
   */
  stepSource?: LeaveFlowStepSource;
  runMode?: LeaveFlowRunMode;
  /** Ordered role_keys, LOWEST rung first. Only meaningful for 'role_ladder'. */
  roleLadder?: string[];
  /**
   * Which staff this flow governs. Omitted (the default) saves the All staff
   * slot — the behaviour every caller had before groups existed.
   */
  staffGroup?: LeaveStaffGroup;
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
    // Both kinds in one fetch: the table labels each gated type's eligibility
    // routing beside its leave routing, and a second query per render would
    // double the cost for a handful of rows.
    const { data, error } = await supabase
      .from('hr_approval_flows')
      .select('hr_organization_id, flow_for, conditions')
      .in('flow_for', ['leave_approval', 'leave_eligibility'])
      .eq('is_active', true)
      .is('valid_until', null);
    if (error) throw error;

    const ownFlowTypeIds = new Set<string>();
    const orgsWithCatchAll = new Set<string>();
    const groupFlows = new Map<string, Set<LeaveStaffGroup>>();
    const eligibilityFlowTypeIds = new Set<string>();
    const orgsWithEligibilityCatchAll = new Set<string>();
    for (const row of (data ?? []) as Array<{
      hr_organization_id: string;
      flow_for: LeaveFlowFor;
      conditions: { leave_type_id?: string; staff_group?: LeaveStaffGroup } | null;
    }>) {
      const typeId = row.conditions?.leave_type_id;
      const group = row.conditions?.staff_group;
      if (row.flow_for === 'leave_eligibility') {
        if (typeId) eligibilityFlowTypeIds.add(typeId);
        else orgsWithEligibilityCatchAll.add(row.hr_organization_id);
        continue;
      }
      if (group) {
        // A group flow narrows an existing slot; it never makes the type
        // "covered", so it is tracked separately from ownFlowTypeIds.
        if (typeId) {
          const set = groupFlows.get(typeId) ?? new Set<LeaveStaffGroup>();
          set.add(group);
          groupFlows.set(typeId, set);
        }
        continue;
      }
      if (typeId) ownFlowTypeIds.add(typeId);
      else orgsWithCatchAll.add(row.hr_organization_id);
    }
    return {
      ownFlowTypeIds,
      orgsWithCatchAll,
      groupFlows,
      eligibilityFlowTypeIds,
      orgsWithEligibilityCatchAll,
    };
  }

  static async listForOrg(
    supabase: SupabaseClient,
    hrOrgId: string,
    flowFor: LeaveFlowFor = FLOW_FOR
  ): Promise<LeaveApprovalFlow[]> {
    const { data, error } = await supabase
      .from('hr_approval_flows')
      .select(SELECT)
      .eq('hr_organization_id', hrOrgId)
      .eq('flow_for', flowFor)
      .eq('is_active', true)
      .is('valid_until', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as LeaveApprovalFlow[];
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
    leaveTypeId: string,
    /**
     * For 'leave_eligibility' the group fields below are always null and
     * effectiveTeaching / effectiveNonTeaching equal `effective`: eligibility
     * flows carry no group, so the answer is the same for everybody.
     */
    flowFor: LeaveFlowFor = FLOW_FOR
  ): Promise<{
    own: LeaveApprovalFlow | null;
    fallback: LeaveApprovalFlow | null;
    effective: LeaveApprovalFlow | null;
    /** The type's own Teaching / Non-teaching flows, when they exist. */
    teaching: LeaveApprovalFlow | null;
    nonTeaching: LeaveApprovalFlow | null;
    /** What each group actually gets, after the override falls back. */
    effectiveTeaching: LeaveApprovalFlow | null;
    effectiveNonTeaching: LeaveApprovalFlow | null;
  }> {
    const flows = await this.listForOrg(supabase, hrOrgId, flowFor);

    // own / fallback / effective keep their original meaning: the ALL-STAFF
    // slot. Existing callers (the detail dialog and its test) read them, and a
    // group flow must not silently change what they answer.
    const own =
      flows.find(
        (f) => f.conditions?.leave_type_id === leaveTypeId && !f.conditions?.staff_group
      ) ?? null;
    const fallback =
      flows.find((f) => !f.conditions?.leave_type_id && !f.conditions?.staff_group) ?? null;

    const ownGroup = (g: LeaveStaffGroup) =>
      flows.find(
        (f) => f.conditions?.leave_type_id === leaveTypeId && f.conditions?.staff_group === g
      ) ?? null;

    return {
      own,
      fallback,
      effective: own ?? fallback,
      teaching: ownGroup('teaching'),
      nonTeaching: ownGroup('non_teaching'),
      // pickLeaveFlow, not `ownGroup(g) ?? own ?? fallback`: the precedence has
      // one definition and it is shared with the SQL the apply path uses.
      effectiveTeaching: pickLeaveFlow(flows, leaveTypeId, 'teaching'),
      effectiveNonTeaching: pickLeaveFlow(flows, leaveTypeId, 'non_teaching'),
    };
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
    const flowFor = input.flowFor ?? FLOW_FOR;

    // An eligibility flow governs everybody who asks; the teaching split is a
    // leave-approval concept. The CHECK constraint refuses the row too, but a
    // 23514 names a constraint, not the tab the admin should not have used.
    if (flowFor === 'leave_eligibility' && input.staffGroup) {
      throw new Error('An eligibility flow applies to all team members; it cannot be split by group.');
    }

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
      flow_for: flowFor,
      flow_name: input.flowName,
      // staff_group is written only when set, never as null: the resolver and
      // the unique index both read "key absent" as All staff, and a literal
      // null would sit in neither slot.
      conditions: input.staffGroup
        ? { leave_type_id: input.leaveTypeId, staff_group: input.staffGroup }
        : { leave_type_id: input.leaveTypeId },
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

    /**
     * WHO CURRENTLY OCCUPIES THIS SLOT, asked now rather than taken on trust.
     *
     * `input.id` is what the open dialog believed when it rendered, and it is
     * wrong in every ordinary race: a second tab saved first, the editor was
     * left open while somebody else edited, the Save button was double-
     * submitted, or the React Query cache had not caught up after a clear. In
     * all of those the client passes no id, save() inserts, and Postgres
     * rejects it with
     *
     *   duplicate key value violates unique constraint
     *   "hr_approval_flows_leave_slot_uniq"
     *
     * which is accurate but useless to the person who just wants their flow
     * saved. The unique index is the authority on what a slot holds, so this
     * reads the slot through the same three keys the index uses and then
     * updates or inserts accordingly.
     *
     * SCOPED TO THE EXACT SLOT, never wider: the staff_group filter is an IS
     * NULL when no group is being saved and an equality when one is. An
     * All-staff save can therefore never find — and never overwrite — a
     * Teaching or Non-teaching flow, or the other way round.
     */
    let slotQuery = supabase
      .from('hr_approval_flows')
      .select('id')
      .eq('hr_organization_id', input.hrOrgId)
      .eq('flow_for', flowFor)
      .eq('is_active', true)
      .is('valid_until', null)
      .eq('conditions->>leave_type_id', input.leaveTypeId);

    slotQuery = input.staffGroup
      ? slotQuery.eq('conditions->>staff_group', input.staffGroup)
      : slotQuery.is('conditions->>staff_group', null);

    const { data: occupant, error: slotError } = await slotQuery.maybeSingle();
    // Not fatal: a failed lookup should fall back to the caller's own id rather
    // than refuse a save that would have worked.
    if (slotError) {
      console.error('[leave-approval-flow] slot lookup failed:', slotError);
    }

    const targetId = occupant?.id ?? input.id;

    const query = targetId
      ? supabase.from('hr_approval_flows').update(row).eq('id', targetId)
      : supabase.from('hr_approval_flows').insert(row);

    const { data, error } = await query.select(SELECT).single();
    if (error) throw error;
    return data as unknown as LeaveApprovalFlow;
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
   * How many in-flight requests this flow governs that are still routing to the
   * approvers it named BEFORE the last edit.
   *
   * Read-only, so the editor can show the number and ask before moving anything.
   * The RPC applies the same most-specific-wins match as buildApprovalChain() —
   * a per-type flow covers its type, a catch-all covers every type in the
   * organisation with no flow of its own — so the count and the re-sync below can
   * never disagree about which requests are in scope.
   */
  static async previewChainDrift(
    supabase: SupabaseClient,
    flowId: string
  ): Promise<LeaveChainResyncResult> {
    // `as any` on the client, not the result: types/supabase.ts is GENERATED and
    // does not know a function added by a migration until it is regenerated.
    // Same pattern as the hr_resolve_leave_ladder call in buildApprovalChain.
    const { data, error } = await (supabase as any).rpc('fn_hr_leave_pending_chain_drift', {
      p_flow_id: flowId,
    });
    if (error) throw error;
    const row = (data ?? [])[0] as LeaveChainResyncResult | undefined;
    return row ?? { eligible: 0, skipped_decided: 0, skipped_locked: 0 };
  }

  /**
   * Re-route this flow's in-flight requests onto the chain it names now.
   *
   * Rebuilds each chain from the flow rather than patching the old one, so the
   * result is identical to what the request would have got had it been submitted
   * today. Requests that are part-approved keep their original chain — erasing a
   * recorded decision to tidy up configuration is never the right trade — and so
   * do requests whose dates sit in a locked attendance period, which refuses
   * every write.
   */
  static async resyncPendingChains(
    supabase: SupabaseClient,
    flowId: string
  ): Promise<LeaveChainResyncResult> {
    const { data, error } = await (supabase as any).rpc('fn_hr_leave_resync_pending_chains', {
      p_flow_id: flowId,
    });
    if (error) throw error;
    const row = (data ?? [])[0] as LeaveChainResyncResult | undefined;
    return row ?? { resynced: 0, skipped_decided: 0, skipped_locked: 0 };
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
