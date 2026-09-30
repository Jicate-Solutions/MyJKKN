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
    // Settled: the request page must drop its "Start quotations" button either way.
    onSettled: (_r, _e, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-rfqs'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-approved-prs'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-request', requestId] });
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

/** Invalidate the RFQ list and detail after an award transition. */
function invalidateRfq(queryClient: ReturnType<typeof useQueryClient>, rfqId: string) {
  queryClient.invalidateQueries({ queryKey: ['procurement-rfqs'] });
  queryClient.invalidateQueries({ queryKey: ['procurement-rfq', rfqId] });
}

/** Store keeper sends the chosen vendors to the Super Admin. */
export function useSubmitAward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rfqId: string) => ProcurementRfqService.submitAward(rfqId),
    // Settled: a refusal (already sent, nothing awarded) must still refresh the page.
    onSettled: (_r, _e, rfqId) => invalidateRfq(queryClient, rfqId),
  });
}

/** Super Admin approves — creates the approved purchase orders. */
export function useApproveAward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rfqId: string) => ProcurementRfqService.approveAward(rfqId),
    onSettled: (_r, _e, rfqId) => {
      invalidateRfq(queryClient, rfqId);
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
    },
  });
}

/** Super Admin sends the award back to the store keeper with a reason. */
export function useSendBackAward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rfqId, reason }: { rfqId: string; reason: string }) =>
      ProcurementRfqService.sendBackAward(rfqId, reason),
    onSettled: (_r, _e, { rfqId }) => invalidateRfq(queryClient, rfqId),
  });
}

export function useCancelRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ProcurementRfqService.cancelRfq(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['procurement-rfqs'] }),
  });
}
