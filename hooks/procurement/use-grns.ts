'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProcurementGrnService } from '@/lib/services/procurement/grn-service';
import { findDuplicateGrns } from '@/lib/services/procurement/invoice-checks';
import type { CreateGrnInput, GrnFilters, ReceiveReplacementInput } from '@/types/procurement';

export function useGrns(filters: GrnFilters) {
  return useQuery({
    queryKey: ['procurement-grns', filters],
    queryFn: () => ProcurementGrnService.getGrns(filters),
    enabled: !!(filters.store_id || filters.institution_id || filters.purchase_order_id || filters.all_institutions),
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

/**
 * I1 held save: is this receipt's invoice number a repeat, and which earlier receipts
 * (that the viewer can see) carry it — for the side-by-side on the receipt page.
 */
export function useGrnDuplicateInvoice(
  grn:
    | { id: string; supplier_id: string; invoice_number: string | null; created_at: string }
    | null
    | undefined
) {
  return useQuery({
    queryKey: ['procurement-grn-duplicate', grn?.id, grn?.supplier_id, grn?.invoice_number],
    queryFn: async () => {
      const g = grn!;
      const [hasDuplicate, visible] = await Promise.all([
        ProcurementGrnService.hasDuplicateInvoice(g),
        ProcurementGrnService.getSupplierInvoiceGrns(g.supplier_id),
      ]);
      return {
        hasDuplicate,
        // Only receipts recorded BEFORE this one: the original is never shown as held.
        earlier: findDuplicateGrns(visible, g.supplier_id, g.invoice_number, g.id, g),
      };
    },
    enabled: !!grn?.id && !!grn.invoice_number,
    staleTime: 60 * 1000,
  });
}

export function useConfirmDifferentInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      ProcurementGrnService.confirmDifferentInvoice(id, userId),
    onSuccess: (_r, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-grn', id] });
      queryClient.invalidateQueries({ queryKey: ['procurement-grn-duplicate', id] });
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
