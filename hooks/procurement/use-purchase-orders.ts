'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProcurementPurchaseOrderService } from '@/lib/services/procurement/purchase-order-service';
import type { PurchaseOrderFilters, ProposePoRevisionDto } from '@/types/procurement';

export function usePurchaseOrders(filters: PurchaseOrderFilters) {
  return useQuery({
    queryKey: ['procurement-purchase-orders', filters],
    queryFn: () => ProcurementPurchaseOrderService.getPurchaseOrders(filters),
    enabled: !!(filters.store_id || filters.institution_id || filters.rfq_id || filters.all_institutions),
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

function usePoTransition(fn: (args: { id: string; userId: string; reason?: string }) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Settled, not just success: a transition refused because the PO already
    // moved on must refresh the page, or it keeps offering the stale action.
    onSettled: (_r, _e, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-order', id] });
      queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
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

/** One value (e.g. GST 18%) onto many lines of an order, refreshed once at the end. */
export function useApplyPoItemExtraToAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemIds,
      extraFields,
    }: {
      poId: string;
      itemIds: string[];
      extraFields: Record<string, string | number>;
    }) =>
      Promise.all(itemIds.map((itemId) => ProcurementPurchaseOrderService.updateItemExtraFields(itemId, extraFields))),
    onSuccess: (_r, { poId }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-order', poId] });
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

export function usePoRevisions(poId: string) {
  return useQuery({
    queryKey: ['procurement-po-revisions', poId],
    queryFn: () => ProcurementPurchaseOrderService.getRevisions(poId),
    enabled: !!poId,
  });
}

/** Everything a renegotiation touches: the order, its revisions, the journey, the Overview. */
function useRevisionRefresh() {
  const queryClient = useQueryClient();
  return (poId: string) => {
    for (const key of [
      ['procurement-po-revisions', poId],
      ['procurement-purchase-order', poId],
      ['procurement-purchase-orders'],
      ['procurement-journey'],
      ['procurement-overview-waiting'],
      ['procurement-overview-counts'],
      ['procurement-quotations'],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useProposePoRevision() {
  const refresh = useRevisionRefresh();
  return useMutation({
    mutationFn: (dto: ProposePoRevisionDto) => ProcurementPurchaseOrderService.proposeRevision(dto),
    onSettled: (_r, _e, dto) => refresh(dto.poId),
  });
}

export function useDecidePoRevision() {
  const refresh = useRevisionRefresh();
  return useMutation({
    mutationFn: (v: { poId: string; revisionId: string; approve: boolean; note?: string }) =>
      ProcurementPurchaseOrderService.decideRevision(v.revisionId, v.approve, v.note),
    onSettled: (_r, _e, v) => refresh(v.poId),
  });
}

export function useWithdrawPoRevision() {
  const refresh = useRevisionRefresh();
  return useMutation({
    mutationFn: (v: { poId: string; revisionId: string }) => ProcurementPurchaseOrderService.withdrawRevision(v.revisionId),
    onSettled: (_r, _e, v) => refresh(v.poId),
  });
}

/** Downloading the order document marks it sent to the vendor (approved -> sent). */
export function useMarkPoSent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ProcurementPurchaseOrderService.markSent(id),
    onSuccess: (changed, id) => {
      if (!changed) return;
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-order', id] });
      queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
    },
  });
}
