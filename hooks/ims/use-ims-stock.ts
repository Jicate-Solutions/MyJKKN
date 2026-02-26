'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImsStockService } from '@/lib/services/ims/stock-service';
import { ImsGRNService } from '@/lib/services/ims/grn-service';
import type {
  ImsStockFilters,
  ImsBatchFilters,
  ImsGRNFilters,
  CreateImsGRNDto,
} from '@/types/ims';

// ─── Stock Summary ───────────────────────────────────────

export function useImsStockSummary(filters: ImsStockFilters) {
  return useQuery({
    queryKey: ['ims-stock-summary', filters],
    queryFn: () => ImsStockService.getStockSummary(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsLowStockItems(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-low-stock', storeId],
    queryFn: () => ImsStockService.getLowStockItems(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Stock Batches ───────────────────────────────────────

export function useImsStockBatches(filters: ImsBatchFilters) {
  return useQuery({
    queryKey: ['ims-stock-batches', filters],
    queryFn: () => ImsStockService.getStockBatches(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsExpiringBatches(days: number, storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-expiring-batches', days, storeId],
    queryFn: () => ImsStockService.getExpiringBatches(days, storeId, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── GRN ─────────────────────────────────────────────────

export function useImsGRNs(filters: ImsGRNFilters) {
  return useQuery({
    queryKey: ['ims-grns', filters],
    queryFn: () => ImsGRNService.getGRNs(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsGRN(id: string) {
  return useQuery({
    queryKey: ['ims-grn', id],
    queryFn: () => ImsGRNService.getGRN(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateImsGRN() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateImsGRNDto; userId: string }) =>
      ImsGRNService.createGRN(data, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-grns'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-batches'] });
    },
  });
}

export function useVerifyImsGRN() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      ImsGRNService.verifyGRN(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-grns'] });
      queryClient.invalidateQueries({ queryKey: ['ims-grn'] });
    },
  });
}

export function useApproveImsGRN() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      ImsGRNService.approveGRN(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-grns'] });
      queryClient.invalidateQueries({ queryKey: ['ims-grn'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-batches'] });
    },
  });
}

export function useCancelImsGRN() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsGRNService.cancelGRN(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-grns'] });
    },
  });
}
