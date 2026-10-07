import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { BillCancelRequestService } from '@/lib/services/billing/schedule/bill-cancel-request-service';
import {
  BillCancelFlowService,
  type UpsertBillCancelFlowDto,
} from '@/lib/services/billing/schedule/bill-cancel-flow-service';
import { studentBillKeys } from './use-student-bills';
import { studentSearchKeys } from './use-student-search';
import type {
  BillCancelRequestStatus,
  RequestBillCancelInput,
} from '@/types/billing-bill-cancel-request';

export const billCancelRequestKeys = {
  all: ['bill-cancel-requests'] as const,
  lists: () => [...billCancelRequestKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...billCancelRequestKeys.lists(), filters] as const,
  detail: (id: string) => [...billCancelRequestKeys.all, 'detail', id] as const,
  eligibility: (billIds: string[]) => [...billCancelRequestKeys.all, 'eligibility', billIds] as const,
};

export const billCancelFlowKeys = {
  all: ['bill-cancel-flows'] as const,
  list: () => [...billCancelFlowKeys.all, 'list'] as const,
  canDecide: (requestId: string) => [...billCancelFlowKeys.all, 'can-decide', requestId] as const,
  resolved: (institutionId: string | null) => [...billCancelFlowKeys.all, 'resolved', institutionId] as const,
  isApprover: () => [...billCancelFlowKeys.all, 'is-approver'] as const,
  approverSearch: (term: string) => [...billCancelFlowKeys.all, 'approver-search', term] as const,
};

/**
 * Nothing in this app self-refreshes, so every cache that shows a bill, its
 * status or its "cancel pending" badge is invalidated by hand. Learner is
 * per-row on the schedule list, so the by-student caches are widened rather
 * than guessed.
 */
function invalidateBillViews(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: billCancelRequestKeys.all });
  queryClient.invalidateQueries({ queryKey: studentBillKeys.all });
  queryClient.invalidateQueries({ queryKey: ['billing-student-bills'] });
  queryClient.invalidateQueries({ queryKey: studentSearchKeys.all });
  // billCancellationKeys.all (the approved-cancellation audit strip), written
  // out to avoid importing use-bill-cancellation.ts back into this module.
  queryClient.invalidateQueries({ queryKey: ['bill-cancellations'] });
}

export function useBillCancelRequests(params: {
  page: number;
  limit: number;
  search?: string;
  status?: BillCancelRequestStatus | 'all';
  institutionIds?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  return useQuery({
    queryKey: billCancelRequestKeys.list(params),
    queryFn: () => BillCancelRequestService.listRequestsPaged(params),
  });
}

export function useBillCancelRequestDetail(id: string | null) {
  return useQuery({
    queryKey: billCancelRequestKeys.detail(id ?? ''),
    queryFn: () => BillCancelRequestService.getRequestDetail(id!),
    enabled: !!id,
  });
}

/** Per-bill "can this be put up for cancellation?" — drives the Request Cancel item and the pending badge. */
export function useBillCancelEligibility(billIds: string[], enabled = true) {
  const ids = [...new Set(billIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: billCancelRequestKeys.eligibility(ids),
    queryFn: () => BillCancelRequestService.getEligibility(ids),
    enabled: enabled && ids.length > 0,
  });
}

export function useRequestBillCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestBillCancelInput) => BillCancelRequestService.requestCancellation(input),
    onSuccess: (result) => {
      invalidateBillViews(queryClient);
      toast.success(
        `Cancellation request ${result.requestNumber} sent for approval — the bill stays payable until it is approved`
      );
    },
    // The RPC's guard messages name the receipt to cancel first; surface verbatim.
    onError: (error: Error) => toast.error(error.message || 'Failed to request bill cancellation'),
  });
}

export function useBulkRequestBillCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ billIds, ...payload }: { billIds: string[] } & Omit<RequestBillCancelInput, 'billId'>) =>
      BillCancelRequestService.bulkRequest(billIds, payload),
    onSuccess: (result) => {
      invalidateBillViews(queryClient);
      if (result.success.length > 0) {
        toast.success(`${result.success.length} cancellation request(s) sent for approval`);
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} bill(s) could not be requested: ${result.failed[0].error}`);
      }
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to request bill cancellations'),
  });
}

export function useActOnBillCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, action, notes }: { requestId: string; action: 'approve' | 'decline'; notes?: string }) =>
      BillCancelRequestService.actOnRequest(requestId, action, notes),
    onSuccess: (result) => {
      invalidateBillViews(queryClient);
      // 'failed' comes back WITHOUT an error (the failure is recorded in the
      // history): a warning, not a success.
      if (result.status === 'failed') toast.error(result.message);
      else toast.success(result.message);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to act on request'),
  });
}

export function useWithdrawBillCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, notes }: { requestId: string; notes?: string }) =>
      BillCancelRequestService.withdrawRequest(requestId, notes),
    onSuccess: () => {
      invalidateBillViews(queryClient);
      toast.success('Request withdrawn');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to withdraw request'),
  });
}

// ── Approval flows ──────────────────────────────────────────────────────────

export function useBillCancelFlows(enabled = true) {
  return useQuery({
    queryKey: billCancelFlowKeys.list(),
    queryFn: () => BillCancelFlowService.list(),
    enabled,
  });
}

/** Answered by the same RPC that guards the write, so the button and the rule agree. */
export function useCanDecideBillCancellation(requestId: string | null) {
  return useQuery({
    queryKey: billCancelFlowKeys.canDecide(requestId ?? ''),
    queryFn: () => BillCancelFlowService.canDecide(requestId!),
    enabled: !!requestId,
  });
}

export function useResolvedBillCancelApprover(institutionId: string | null) {
  return useQuery({
    queryKey: billCancelFlowKeys.resolved(institutionId),
    queryFn: () => BillCancelFlowService.resolveForInstitution(institutionId),
    enabled: !!institutionId,
  });
}

export function useIsBillCancellationApprover(enabled = true) {
  return useQuery({
    queryKey: billCancelFlowKeys.isApprover(),
    queryFn: () => BillCancelFlowService.isApproverAnywhere(),
    enabled,
  });
}

export function useBillCancelApproverSearch(term: string) {
  return useQuery({
    queryKey: billCancelFlowKeys.approverSearch(term),
    queryFn: () => BillCancelFlowService.searchApprovers(term),
    enabled: term.trim().length >= 2,
  });
}

export function useSaveBillCancelFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpsertBillCancelFlowDto) => BillCancelFlowService.upsert(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billCancelFlowKeys.all });
      queryClient.invalidateQueries({ queryKey: billCancelRequestKeys.all });
      toast.success('Approval flow saved');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to save the approval flow'),
  });
}

export function useDeleteBillCancelFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => BillCancelFlowService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billCancelFlowKeys.all });
      queryClient.invalidateQueries({ queryKey: billCancelRequestKeys.all });
      toast.success('Approval flow removed');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to remove the approval flow'),
  });
}
