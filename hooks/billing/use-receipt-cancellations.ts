import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  ReceiptCancellationService,
  type CancelRequestStatus,
} from '@/lib/services/billing/receipts/receipt-cancellation-service';
import { studentSearchKeys } from './use-student-search';

export const receiptCancelKeys = {
  all: ['receipt-cancellations'] as const,
  lists: () => [...receiptCancelKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...receiptCancelKeys.lists(), filters] as const,
  detail: (id: string) => [...receiptCancelKeys.all, 'detail', id] as const,
  fullDetail: (id: string) => [...receiptCancelKeys.all, 'full-detail', id] as const,
  pending: (receiptIds: string[]) => [...receiptCancelKeys.all, 'pending', receiptIds] as const,
};

export function useReceiptCancelRequests(
  filters: { status?: CancelRequestStatus | 'all'; institutionIds?: string[] } = {}
) {
  return useQuery({
    queryKey: receiptCancelKeys.list(filters),
    queryFn: () => ReceiptCancellationService.listRequests(filters),
  });
}

export function useReceiptCancelRequest(id: string) {
  return useQuery({
    queryKey: receiptCancelKeys.detail(id),
    queryFn: () => ReceiptCancellationService.getRequest(id),
    enabled: !!id,
  });
}

/** Request + action trail + learner + the bills the receipt settled. */
export function useReceiptCancelRequestDetail(id: string | null) {
  return useQuery({
    queryKey: receiptCancelKeys.fullDetail(id ?? ''),
    queryFn: () => ReceiptCancellationService.getRequestDetail(id!),
    enabled: !!id,
  });
}

/** Open requests for a page of receipts, so the list can badge them. */
export function usePendingCancellations(receiptIds: string[]) {
  return useQuery({
    queryKey: receiptCancelKeys.pending(receiptIds),
    queryFn: () => ReceiptCancellationService.getPendingByReceiptIds(receiptIds),
    enabled: receiptIds.length > 0,
  });
}

export function useRequestReceiptCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ receiptId, reason }: { receiptId: string; reason: string }) =>
      ReceiptCancellationService.requestCancellation(receiptId, reason),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: receiptCancelKeys.all });
      toast.success(
        `Cancellation request ${result.requestNumber} sent for approval — the receipt stays valid until it is approved`
      );
    },
    // The RPC's guard messages are the actionable part ("Issue a refund
    // instead…"), so surface them verbatim.
    onError: (error: Error) => toast.error(error.message || 'Failed to request cancellation'),
  });
}

export function useActOnReceiptCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      action,
      notes,
    }: {
      requestId: string;
      action: 'approve' | 'decline';
      notes?: string;
    }) => ReceiptCancellationService.actOnRequest(requestId, action, notes),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: receiptCancelKeys.all });
      // Approval deletes the receipt and reverts the bill, so the receipt list
      // and every student-bill view are stale.
      queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-student-bills'] });
      queryClient.invalidateQueries({ queryKey: studentSearchKeys.all });

      // 'failed' comes back WITHOUT an error: the receipt vanished between
      // request and approval. That is a warning, not a success.
      if (result.status === 'failed') toast.error(result.message);
      else toast.success(result.message);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to act on request'),
  });
}

export function useWithdrawReceiptCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, notes }: { requestId: string; notes?: string }) =>
      ReceiptCancellationService.withdrawRequest(requestId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptCancelKeys.all });
      toast.success('Request withdrawn');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to withdraw request'),
  });
}
