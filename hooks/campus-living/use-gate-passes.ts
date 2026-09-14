'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  GatePassService,
  type LeaveTypeRules,
} from '@/lib/services/campus-living/gate-pass-service';
import { campusLivingDashboardKeys } from '@/hooks/campus-living/use-campus-living-dashboard';
import { activityFeedKeys } from '@/hooks/campus-living/use-activity-feed';
import { hostelAccessLogKeys } from '@/hooks/campus-living/use-hostel-access-log';
import type { GateScanResponse } from '@/app/api/campus-living/gate-passes/scan/route';
import type {
  CreateHostelGatePassDTO,
  GatePassRequestDTO,
  GatePassStatus,
} from '@/types/campus-living';

interface GatePassFilters {
  status?: GatePassStatus | GatePassStatus[];
  learner_id?: string;
  leave_type_id?: string;
  date?: string;
}

export const gatePassKeys = {
  all: ['gate-passes'] as const,
  list: (filters: Record<string, unknown>) => ['gate-passes', 'list', filters] as const,
  detail: (id: string) => ['gate-passes', 'detail', id] as const,
  myPasses: (learnerId: string) => ['gate-passes', 'my-passes', learnerId] as const,
  pending: (institutionIds: string[]) => ['gate-passes', 'pending', institutionIds] as const,
};

/**
 * Nothing in this app self-refreshes. A gate-pass decision changes the campus
 * living dashboard's counters and the activity feed as well as the queue it
 * was taken from, so every mutation below invalidates all three — invalidating
 * only `gatePassKeys.all` leaves the dashboard showing yesterday's numbers
 * until a hard reload.
 */
function invalidateGatePassSurfaces(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: gatePassKeys.all });
  if (id) qc.invalidateQueries({ queryKey: gatePassKeys.detail(id) });
  qc.invalidateQueries({ queryKey: campusLivingDashboardKeys.all });
  qc.invalidateQueries({ queryKey: activityFeedKeys.all });
  qc.invalidateQueries({ queryKey: hostelAccessLogKeys.all });
}

// ─── Queries ────────────────────────────────────────────────────────

/**
 * The warden queue.
 *
 * Takes the institution IDs the caller can actually see (from
 * `useInstitutionsWithAccess`), NOT a single id plus an isSuperAdmin escape
 * hatch — branching on isSuperAdmin to drop the filter silently strips access
 * from secondary roles carrying scope='all'. RLS gates the rows either way.
 */
export function useGatePasses(institutionIds: string[], filters?: GatePassFilters) {
  return useQuery({
    queryKey: gatePassKeys.list({ institutionIds, ...filters }),
    queryFn: () => GatePassService.getGatePasses(institutionIds, filters),
    enabled: institutionIds.length > 0,
  });
}

export function usePendingGatePassRequests(institutionIds: string[]) {
  return useQuery({
    queryKey: gatePassKeys.pending(institutionIds),
    queryFn: () => GatePassService.getPendingRequests(institutionIds),
    enabled: institutionIds.length > 0,
  });
}

/** Everything /campus-living/gate-passes/[id] renders, in one call. */
export function useGatePassDetail(id: string) {
  return useQuery({
    queryKey: gatePassKeys.detail(id),
    queryFn: () => GatePassService.getGatePassDetail(id),
    enabled: !!id,
  });
}

/** A learner's own passes. Accepts either id space — the service resolves it. */
export function useMyGatePasses(learnerId: string) {
  return useQuery({
    queryKey: gatePassKeys.myPasses(learnerId),
    queryFn: () => GatePassService.getMyGatePasses(learnerId),
    enabled: !!learnerId,
  });
}

// No useOverduePasses / useMarkOverdue. Marking passes overdue is the hourly
// cron's job (app/api/cron/campus-living/gate-pass-overdue), and READING them
// is just `useGatePasses(ids, { status: 'overdue' })` — a dedicated hook would
// be a second way to ask the same question.

// ─── Mutations ──────────────────────────────────────────────────────

/** A learner applies. `rules` come from the leave type they picked. */
export function useRequestGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, rules }: { payload: GatePassRequestDTO; rules: LeaveTypeRules }) =>
      GatePassService.requestGatePass(payload, rules),
    onSuccess: () => {
      invalidateGatePassSurfaces(queryClient);
      toast.success('Gate pass request submitted', {
        description: 'Your warden will review it and you will see the decision here.',
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** A warden issues a pass directly — the walk-in and emergency lane. */
export function useIssueGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelGatePassDTO) => GatePassService.generateGatePass(payload),
    onSuccess: () => {
      invalidateGatePassSurfaces(queryClient);
      toast.success('Gate pass issued');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useApproveGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approverId }: { id: string; approverId: string }) =>
      GatePassService.approveGatePass(id, approverId),
    onSuccess: (_data, variables) => {
      invalidateGatePassSurfaces(queryClient, variables.id);
      toast.success('Gate pass approved');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRejectGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejectedBy, reason }: { id: string; rejectedBy: string; reason: string }) =>
      GatePassService.rejectGatePass(id, rejectedBy, reason),
    onSuccess: (_data, variables) => {
      invalidateGatePassSurfaces(queryClient, variables.id);
      toast.success('Gate pass request rejected');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRecordParentCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId, number }: { id: string; userId: string; number: string }) =>
      GatePassService.recordParentCall(id, userId, number),
    onSuccess: (_data, variables) => {
      invalidateGatePassSurfaces(queryClient, variables.id);
      toast.success('Parent call recorded');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCancelGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cancelledBy, reason }: { id: string; cancelledBy: string; reason: string }) =>
      GatePassService.cancelGatePass(id, cancelledBy, reason),
    onSuccess: (_data, variables) => {
      invalidateGatePassSurfaces(queryClient, variables.id);
      toast.success('Gate pass cancelled');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Manual return, from the detail page. The gate uses {@link useGateScan}. */
export function useReturnGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, securityId }: { id: string; securityId: string }) =>
      GatePassService.recordReturn(id, securityId),
    onSuccess: (_data, variables) => {
      invalidateGatePassSurfaces(queryClient, variables.id);
      toast.success('Return recorded');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * One scan at the gate: decided and recorded server-side in a single request.
 *
 * No optimistic update and no toast on success — the scan screen's own verdict
 * panel IS the feedback, and a toast stacked on top of a full-screen colour
 * band is noise to somebody working a gate one-handed at night. Failures do
 * toast, because those are the ones the panel cannot express.
 */
export function useGateScan() {
  const queryClient = useQueryClient();
  return useMutation<GateScanResponse, Error, { code: string; deviceId?: string; gateId?: string }>({
    mutationFn: async (input) => {
      const res = await fetch('/api/campus-living/gate-passes/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (payload as { error?: string }).error ?? 'The scan could not be completed. Try again.',
        );
      }
      return payload as GateScanResponse;
    },
    onSuccess: (data) => {
      // Only a scan that actually wrote something changes any cached list.
      if (data.recorded) invalidateGatePassSurfaces(queryClient);
    },
    onError: (error) => toast.error(error.message),
  });
}
