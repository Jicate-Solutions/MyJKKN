'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProcurementRfqService } from '@/lib/services/procurement/rfq-service';
import type { RfqFilters } from '@/types/procurement';

export function useRfqs(filters: RfqFilters) {
  return useQuery({
    queryKey: ['procurement-rfqs', filters],
    queryFn: () => ProcurementRfqService.getRfqs(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function useRfq(id: string) {
  return useQuery({
    queryKey: ['procurement-rfq', id],
    queryFn: () => ProcurementRfqService.getRfq(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useApprovedRequestsForSelect(institutionId: string | undefined) {
  return useQuery({
    queryKey: ['procurement-approved-prs', institutionId],
    queryFn: () => ProcurementRfqService.getApprovedRequestsForSelect(institutionId!),
    enabled: !!institutionId,
    staleTime: 60 * 1000,
  });
}

export function useVendorsForSelect(institutionId: string | undefined) {
  return useQuery({
    queryKey: ['procurement-vendors-select', institutionId],
    queryFn: () => ProcurementRfqService.getVendorsForSelect(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateRfqFromPR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, userId }: { requestId: string; userId: string }) =>
      ProcurementRfqService.createFromApprovedPR(requestId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-rfqs'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-approved-prs'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-requests'] });
    },
  });
}

export function useAddRfqVendors() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rfqId, supplierIds }: { rfqId: string; supplierIds: string[] }) =>
      ProcurementRfqService.addVendors(rfqId, supplierIds),
    onSuccess: (_r, { rfqId }) =>
      queryClient.invalidateQueries({ queryKey: ['procurement-rfq', rfqId] }),
  });
}

export function useRemoveRfqVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rfqVendorId }: { rfqVendorId: string; rfqId: string }) =>
      ProcurementRfqService.removeVendor(rfqVendorId),
    onSuccess: (_r, { rfqId }) =>
      queryClient.invalidateQueries({ queryKey: ['procurement-rfq', rfqId] }),
  });
}

export function useMarkRfqSent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rfqId: string) => ProcurementRfqService.markSent(rfqId),
    onSuccess: (_r, rfqId) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-rfqs'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-rfq', rfqId] });
    },
  });
}

/** Invalidate both the RFQ list and the single-RFQ detail after a review transition. */
function invalidateRfq(queryClient: ReturnType<typeof useQueryClient>, rfqId: string) {
  queryClient.invalidateQueries({ queryKey: ['procurement-rfqs'] });
  queryClient.invalidateQueries({ queryKey: ['procurement-rfq', rfqId] });
}

export function useSubmitRfqForReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rfqId: string) => ProcurementRfqService.submitForReview(rfqId),
    onSuccess: (_r, rfqId) => invalidateRfq(queryClient, rfqId),
  });
}

export function useApproveRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rfqId, reviewerId }: { rfqId: string; reviewerId: string }) =>
      ProcurementRfqService.approveRfq(rfqId, reviewerId),
    onSuccess: (_r, { rfqId }) => invalidateRfq(queryClient, rfqId),
  });
}

export function useRejectRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rfqId, reviewerId, notes }: { rfqId: string; reviewerId: string; notes: string }) =>
      ProcurementRfqService.rejectRfq(rfqId, reviewerId, notes),
    onSuccess: (_r, { rfqId }) => invalidateRfq(queryClient, rfqId),
  });
}

export function useCancelRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ProcurementRfqService.cancelRfq(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['procurement-rfqs'] }),
  });
}
