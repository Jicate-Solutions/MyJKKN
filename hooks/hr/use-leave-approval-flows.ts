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
export function useMyLeaveApprovalQueue(hrOrgId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'my-queue', hrOrgId],
    queryFn: async () => new Set(await LeaveApprovalFlowService.myQueueIds(supabase, hrOrgId)),
    enabled: !!hrOrgId,
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

export function useLeaveApproverCandidates(
  hrOrgId: string | undefined,
  search: string,
  enabled = true
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'candidates', hrOrgId, search],
    queryFn: () => LeaveApprovalFlowService.candidates(supabase, hrOrgId!, search),
    enabled: enabled && !!hrOrgId,
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
    },
  });
}
