import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  LeaveOndutyBulkService,
  type BulkCreateInput,
  type BulkRosterFilters,
} from '@/lib/services/academic/leave-onduty-bulk-service';

const BULK_KEYS = {
  filters: (institutionId: string) => ['leave-onduty-bulk', 'filters', institutionId] as const,
  roster: (institutionId: string, filters: BulkRosterFilters) =>
    ['leave-onduty-bulk', 'roster', institutionId, filters] as const,
};

export function useBulkFilterOptions(institutionId: string | null | undefined) {
  return useQuery({
    queryKey: BULK_KEYS.filters(institutionId ?? ''),
    queryFn: () => LeaveOndutyBulkService.getFilterOptions(institutionId as string),
    enabled: !!institutionId,
    staleTime: 5 * 60_000,
  });
}

export function useBulkRoster(institutionId: string | null | undefined, filters: BulkRosterFilters) {
  return useQuery({
    queryKey: BULK_KEYS.roster(institutionId ?? '', filters),
    queryFn: () => LeaveOndutyBulkService.listRoster(institutionId as string, filters),
    enabled: !!institutionId,
    staleTime: 60_000,
  });
}

// Nothing self-refreshes: a batch creates applications and approver rows, so
// the approvals queue and every My Applications list must be invalidated.
function useInvalidateLeaveOnduty() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['leave-onduty'] });
}

export function useCreateBulkBatch() {
  const invalidate = useInvalidateLeaveOnduty();
  return useMutation({
    mutationFn: (input: BulkCreateInput) => LeaveOndutyBulkService.createBatch(input),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDecideBatch() {
  const invalidate = useInvalidateLeaveOnduty();
  return useMutation({
    mutationFn: (v: { batchId: string; action: 'approved' | 'rejected'; comments?: string }) =>
      LeaveOndutyBulkService.decideBatch(v.batchId, v.action, v.comments),
    onSuccess: (r, v) => {
      invalidate();
      toast.success(
        `${r.actioned} application(s) ${v.action}` +
          (r.not_yours ? `, ${r.not_yours} belong to other approvers` : '') +
          (r.failed ? `, ${r.failed} failed` : '')
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
