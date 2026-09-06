'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProcurementGrnService } from '@/lib/services/procurement/grn-service';
import type { CreateGrnInput, GrnFilters, ReceiveReplacementInput } from '@/types/procurement';

export function useGrns(filters: GrnFilters) {
  return useQuery({
    queryKey: ['procurement-grns', filters],
    queryFn: () => ProcurementGrnService.getGrns(filters),
    enabled: !!(filters.store_id || filters.institution_id || filters.purchase_order_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function useGrn(id: string) {
  return useQuery({
    queryKey: ['procurement-grn', id],
    queryFn: () => ProcurementGrnService.getGrn(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, userId }: { input: CreateGrnInput; userId: string }) =>
      ProcurementGrnService.createGrnAgainstPO(input, userId),
    onSuccess: (_r, { input }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-grns'] });
      queryClient.invalidateQueries({
        queryKey: ['procurement-purchase-order', input.purchase_order_id],
      });
    },
  });
}

export function useVerifyGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      ProcurementGrnService.verifyGrn(id, userId),
    onSuccess: (grn, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-grns'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-grn', id] });
      if (grn?.purchase_order_id) {
        queryClient.invalidateQueries({
          queryKey: ['procurement-purchase-order', grn.purchase_order_id],
        });
      }
    },
  });
}

export function useReplacements(grnId: string) {
  return useQuery({
    queryKey: ['procurement-grn-replacements', grnId],
    queryFn: () => ProcurementGrnService.getReplacements(grnId),
    enabled: !!grnId,
    staleTime: 60 * 1000,
  });
}

export function useReceiveReplacement(grnId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, userId }: { input: ReceiveReplacementInput; userId: string }) =>
      ProcurementGrnService.receiveReplacement(input, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-grn-replacements', grnId] });
      queryClient.invalidateQueries({ queryKey: ['procurement-grns'] });
    },
  });
}

export function useCancelGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => ProcurementGrnService.cancel(id),
    onSuccess: (_r, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-grns'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-grn', id] });
    },
  });
}

export function useUpdateGrnItem(grnId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      grnItemId,
      patch,
    }: {
      grnItemId: string;
      patch: { batch_number?: string | null; expiry_date?: string | null; manufacturing_date?: string | null };
    }) => ProcurementGrnService.updateGrnItem(grnItemId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-grn', grnId] });
    },
  });
}
