import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  ReceiptCancelFlowService,
  type UpsertReceiptCancelFlowDto,
} from '@/lib/services/billing/receipts/receipt-cancel-flow-service';
import { receiptCancelKeys } from './use-receipt-cancellations';

export const receiptCancelFlowKeys = {
  all: ['receipt-cancel-flows'] as const,
  list: () => [...receiptCancelFlowKeys.all, 'list'] as const,
  canDecide: (requestId: string) =>
    [...receiptCancelFlowKeys.all, 'can-decide', requestId] as const,
  resolved: (institutionId: string | null) =>
    [...receiptCancelFlowKeys.all, 'resolved', institutionId] as const,
};

export function useReceiptCancelFlows(enabled = true) {
  return useQuery({
    queryKey: receiptCancelFlowKeys.list(),
    queryFn: () => ReceiptCancelFlowService.list(),
    enabled,
  });
}

/**
 * Whether the current user may decide this request, answered by the RPC that
 * also guards the write. Asking the server rather than re-deriving the rule in
 * the client is the point: the flow can change under an open page, and a
 * client-side copy of the rule is the thing that drifts.
 */
export function useCanDecideCancellation(requestId: string | null) {
  return useQuery({
    queryKey: receiptCancelFlowKeys.canDecide(requestId ?? ''),
    queryFn: () => ReceiptCancelFlowService.canDecide(requestId!),
    enabled: !!requestId,
  });
}

/** The flow governing an institution, for "Pending with …". */
export function useResolvedCancelApprover(institutionId: string | null) {
  return useQuery({
    queryKey: receiptCancelFlowKeys.resolved(institutionId),
    queryFn: () => ReceiptCancelFlowService.resolveForInstitution(institutionId),
    enabled: !!institutionId,
  });
}

/** Whether the current user is a configured approver for any institution. */
export function useIsCancellationApprover(enabled = true) {
  return useQuery({
    queryKey: [...receiptCancelFlowKeys.all, 'is-approver'] as const,
    queryFn: () => ReceiptCancelFlowService.isApproverAnywhere(),
    enabled,
  });
}

/** Type-ahead over people who could be named as a flow's approver. */
export function useApproverSearch(term: string) {
  return useQuery({
    queryKey: [...receiptCancelFlowKeys.all, 'approver-search', term] as const,
    queryFn: () => ReceiptCancelFlowService.searchApprovers(term),
    enabled: term.trim().length >= 2,
  });
}

export function useSaveReceiptCancelFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpsertReceiptCancelFlowDto) =>
      ReceiptCancelFlowService.upsert(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptCancelFlowKeys.all });
      // Who may decide changed, so every cached approval verdict is stale.
      queryClient.invalidateQueries({ queryKey: receiptCancelKeys.all });
      toast.success('Approval flow saved');
    },
    onError: (error: Error) =>
      toast.error(error.message || 'Failed to save the approval flow'),
  });
}

export function useDeleteReceiptCancelFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ReceiptCancelFlowService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptCancelFlowKeys.all });
      queryClient.invalidateQueries({ queryKey: receiptCancelKeys.all });
      toast.success('Approval flow removed');
    },
    onError: (error: Error) =>
      toast.error(error.message || 'Failed to remove the approval flow'),
  });
}
