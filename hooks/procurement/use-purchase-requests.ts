'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProcurementPurchaseRequestService } from '@/lib/services/procurement/purchase-request-service';
import type { PurchaseRequestFilters, CreatePurchaseRequestDto } from '@/types/procurement';

export function usePurchaseRequests(filters: PurchaseRequestFilters) {
  return useQuery({
    queryKey: ['procurement-purchase-requests', filters],
    queryFn: () => ProcurementPurchaseRequestService.getPurchaseRequests(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function usePurchaseRequest(id: string) {
  return useQuery({
    queryKey: ['procurement-purchase-request', id],
    queryFn: () => ProcurementPurchaseRequestService.getPurchaseRequest(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, userId }: { data: CreatePurchaseRequestDto; userId: string }) =>
      ProcurementPurchaseRequestService.createPurchaseRequest(data, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-requests'] });
    },
  });
}

export function useSubmitPurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ProcurementPurchaseRequestService.submitPurchaseRequest(id),
    onSuccess: (_r, id) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-request', id] });
    },
  });
}

export function useApprovePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      ProcurementPurchaseRequestService.approvePurchaseRequest(id, userId),
    onSuccess: (_r, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-request', id] });
    },
  });
}

export function useApproveWithModifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      userId,
      itemUpdates,
    }: {
      id: string;
      userId: string;
      itemUpdates: { itemId: string; required_quantity: number }[];
    }) => ProcurementPurchaseRequestService.approveWithModifications(id, userId, itemUpdates),
    onSuccess: (_r, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-request', id] });
    },
  });
}

export function useRejectPurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId, reason }: { id: string; userId: string; reason: string }) =>
      ProcurementPurchaseRequestService.rejectPurchaseRequest(id, userId, reason),
    onSuccess: (_r, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-request', id] });
    },
  });
}

export function useCancelPurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ProcurementPurchaseRequestService.cancelPurchaseRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-requests'] });
    },
  });
}
