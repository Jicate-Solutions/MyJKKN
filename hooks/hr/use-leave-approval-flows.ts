'use client';

/**
 * Leave approval flow configuration — read/write for the leave types admin.
 *
 * Query keys are namespaced on the leave type so saving one type's flow does
 * not blow away another's cached chain.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  LeaveApprovalFlowService,
  type LeaveApprovalFlowCoverage,
  type SaveLeaveApprovalFlowInput,
} from '@/lib/services/hr/leave-approval-flow-service';

const KEY = 'hr-leave-approval-flows';

/**
 * The flow that would actually be frozen onto an application for this leave
 * type, plus the org catch-all it falls back to.
 */
export function useLeaveApprovalFlow(
  hrOrgId: string | undefined,
  leaveTypeId: string | undefined
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, hrOrgId, leaveTypeId],
    queryFn: () =>
      LeaveApprovalFlowService.resolveForLeaveType(supabase, hrOrgId!, leaveTypeId!),
    enabled: !!hrOrgId && !!leaveTypeId,
  });
}

/**
 * Ids of applications waiting on this caller's decision. Returns a Set so the
 * approvals table can filter in one pass without an O(n*m) scan.
 */
/**
 * Which leave types have their own flow and which organizations have a
 * catch-all — one fetch for the whole Leave Types table.
 *
 * Keyed under the same prefix as the per-type flows so the save and clear
 * mutations below invalidate it too; without that the Approval column would
 * still read "Not set" right after somebody set one.
 */
export function useLeaveApprovalFlowCoverage(enabled = true) {
  const supabase = createClientSupabaseClient();
  return useQuery<LeaveApprovalFlowCoverage>({
    queryKey: [KEY, 'coverage'],
    queryFn: () => LeaveApprovalFlowService.listCoverage(supabase),
    enabled,
  });
}

export function useMyLeaveApprovalQueue(hrOrgId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'my-queue', hrOrgId],
    queryFn: async () => new Set(await LeaveApprovalFlowService.myQueueIds(supabase, hrOrgId)),
    enabled: !!hrOrgId,
  });
}

/**
 * The whole approvals queue — leave and short time off together, so the tabs
 * split one response instead of issuing a request each.
 *
 * @param enabled false until hr_can_approve_leave() has confirmed; the RPC
 *   raises 42501 otherwise and React Query would retry it three times.
 */
export function useLeaveApprovalQueue(enabled: boolean) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'approval-queue'],
    queryFn: () => LeaveApprovalFlowService.approvalQueue(supabase),
    enabled,
  });
}

export function useLeaveApproverRoles(enabled = true) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'roles'],
    queryFn: () => LeaveApprovalFlowService.roleOptions(supabase),
    // Role definitions change through Role Management, not through this screen.
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

/**
 * People pinnable as a step's approver, optionally narrowed to one role.
 *
 * roleKey is part of the query key AND is sent to the RPC — the server applies
 * it before its 50-row cap, so a client-side filter would search a truncated
 * page.
 *
 * placeholderData keeps the previous list on screen while a new search or role
 * runs, so the picker does not flash empty between keystrokes.
 */
export function useLeaveApproverCandidates(
  hrOrgId: string | undefined,
  search: string,
  roleKey: string | null,
  enabled = true
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'candidates', hrOrgId, search, roleKey],
    queryFn: () =>
      LeaveApprovalFlowService.candidates(supabase, hrOrgId!, search, roleKey ?? undefined),
    enabled: enabled && !!hrOrgId,
    placeholderData: (prev) => prev,
  });
}

export function useSaveLeaveApprovalFlow() {
  const supabase = createClientSupabaseClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveLeaveApprovalFlowInput) =>
      LeaveApprovalFlowService.save(supabase, input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: [KEY, input.hrOrgId, input.leaveTypeId] });
      // The Leave Types table's Approval column reads this.
      qc.invalidateQueries({ queryKey: [KEY, 'coverage'] });
    },
  });
}

export function useClearLeaveApprovalFlow() {
  const supabase = createClientSupabaseClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { flowId: string; hrOrgId: string; leaveTypeId: string }) =>
      LeaveApprovalFlowService.clear(supabase, vars.flowId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [KEY, vars.hrOrgId, vars.leaveTypeId] });
      qc.invalidateQueries({ queryKey: [KEY, 'coverage'] });
    },
  });
}

/**
 * May THIS caller approve the request outright, ahead of the reviews below it?
 *
 * The final authority may act at any point (decision 2026-09-05), but whether
 * the caller is admitted by the final step depends on user_roles / custom_roles,
 * which an ordinary member of staff cannot select — a browser-side answer comes
 * back empty for exactly the people it is meant to admit. fn_hr_leave_can_finalize
 * runs SECURITY DEFINER against the same fn_leave_step_admits that
 * hr_trig_leave_enforce_approver uses, so the button and the gate agree.
 *
 * Returns false while the request is already ON its final step: that is the
 * ordinary path, not a short-circuit, and the queue's own can_decide covers it.
 */
export function useCanFinalizeLeave(applicationId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'can-finalize', applicationId ?? null],
    enabled: Boolean(applicationId),
    queryFn: async () => {
      // `as any` on the client, not on the result: types/supabase.ts is the
      // GENERATED Database type and does not know a function added by a
      // migration until it is regenerated. Same pattern as the
      // hr_resolve_leave_ladder call in LeaveService.buildApprovalChain.
      const { data, error } = await (supabase as any).rpc('fn_hr_leave_can_finalize', {
        p_application_id: applicationId,
      });
      if (error) throw error;
      return data === true;
    },
    staleTime: 60_000,
  });
}
