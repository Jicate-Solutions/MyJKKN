'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProcurementPurchaseOrderService } from '@/lib/services/procurement/purchase-order-service';
import type { PurchaseOrderFilters } from '@/types/procurement';

export function usePurchaseOrders(filters: PurchaseOrderFilters) {
  return useQuery({
    queryKey: ['procurement-purchase-orders', filters],
    queryFn: () => ProcurementPurchaseOrderService.getPurchaseOrders(filters),
    enabled: !!(filters.store_id || filters.institution_id || filters.rfq_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ['procurement-purchase-order', id],
    queryFn: () => ProcurementPurchaseOrderService.getPurchaseOrder(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useGeneratePOsFromRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rfqId, userId }: { rfqId: string; userId: string }) =>
      ProcurementPurchaseOrderService.generateFromRfq(rfqId, userId),
    onSuccess: (_r, { rfqId }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-rfq', rfqId] });
      queryClient.invalidateQueries({ queryKey: ['procurement-comparison', rfqId] });
    },
  });
}

function usePoTransition(fn: (args: { id: string; userId: string; reason?: string }) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-order', id] });
    },
  });
}

export function useSubmitPO() {
  return usePoTransition(({ id }) => ProcurementPurchaseOrderService.submitForApproval(id));
}
export function useApprovePO() {
  return usePoTransition(({ id, userId }) => ProcurementPurchaseOrderService.approve(id, userId));
}
export function useRejectPO() {
  return usePoTransition(({ id, userId, reason }) =>
    ProcurementPurchaseOrderService.reject(id, userId, reason ?? '')
  );
}
export function useMarkPOSent() {
  return usePoTransition(({ id }) => ProcurementPurchaseOrderService.markSent(id));
}
export function useCancelPO() {
  return usePoTransition(({ id }) => ProcurementPurchaseOrderService.cancel(id));
}

export function useUpdatePoDocumentFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof ProcurementPurchaseOrderService.updateDocumentFields>[1];
    }) => ProcurementPurchaseOrderService.updateDocumentFields(id, patch),
    onSuccess: (_r, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-order', id] });
    },
  });
}

export function useUpdatePoItemExtraFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      extraFields,
    }: {
      poId: string;
      itemId: string;
      extraFields: Record<string, string | number>;
    }) => ProcurementPurchaseOrderService.updateItemExtraFields(itemId, extraFields),
    onSuccess: (_r, { poId }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-order', poId] });
    },
  });
}

export function useUpdatePoItemPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poId, itemId, unitPrice }: { poId: string; itemId: string; unitPrice: number }) =>
      ProcurementPurchaseOrderService.updateItemPrice(poId, itemId, unitPrice),
    onSuccess: (_r, { poId }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-order', poId] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
    },
  });
}
