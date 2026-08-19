'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImsIndentService } from '@/lib/services/ims/indent-service';
import { ImsSupplyTransferService } from '@/lib/services/ims/supply-transfer-service';
import { IMS_SUPPLY_SCOPES } from '@/types/ims';
import type { ImsIndentFilters, CreateImsIndentDto } from '@/types/ims';
import type {
  ImsShipmentFilters,
  CreateShipmentDto,
  DispatchShipmentDto,
  ConfirmReceiptLine,
} from '@/types/ims';

/**
 * Fetch store-to-store transfer requests.
 *
 * Covers BOTH supply scopes: `intra_institution` (warehouse -> operating store,
 * the normal case) and `inter_institution` (across institutions). It previously
 * hardcoded 'inter_institution', which hid every warehouse transfer.
 */
export function useImsTransfers(
  filters: Omit<ImsIndentFilters, 'request_scope' | 'request_scopes'> & {
    request_scopes?: ImsIndentFilters['request_scopes'];
  }
) {
  return useQuery({
    queryKey: ['ims-transfers', filters],
    queryFn: () =>
      ImsIndentService.getIndents({
        ...filters,
        request_scopes: filters.request_scopes ?? IMS_SUPPLY_SCOPES,
      }),
    enabled: !!(filters.store_id || filters.source_store_id || filters.destination_store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch all shipments for a specific transfer request.
 */
export function useImsShipmentsForRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: ['ims-shipments-for-request', requestId],
    queryFn: () => ImsSupplyTransferService.getShipmentsForRequest(requestId!),
    enabled: !!requestId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch shipments with filters (for central store dispatch queue view).
 */
export function useImsShipments(filters: ImsShipmentFilters) {
  return useQuery({
    queryKey: ['ims-shipments', filters],
    queryFn: () => ImsSupplyTransferService.getShipments(filters),
    enabled: !!(filters.source_store_id || filters.destination_institution_id || filters.request_id),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Create a new transfer request (college store → central store).
 */
export function useCreateImsTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateImsIndentDto; userId: string }) =>
      ImsIndentService.createIndent(data, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
    },
  });
}

/**
 * Central store: create a shipment for an approved request.
 */
export function useCreateImsShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateShipmentDto) =>
      ImsSupplyTransferService.createShipment(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['ims-shipments-for-request'] });
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
    },
  });
}

/**
 * Warehouse: push stock to an operating store (no request needed).
 *
 * With dispatch_now (the default) this immediately deducts warehouse stock, so
 * it invalidates the stock/item/batch keys as well as the transfer keys.
 */
export function useCreateImsPushTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Parameters<typeof ImsSupplyTransferService.createPushTransfer>[0]) =>
      ImsSupplyTransferService.createPushTransfer(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['ims-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['ims-shipments-for-request'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-batches'] });
    },
  });
}

/**
 * Central store: mark a shipment dispatched.
 * DB trigger fires to deduct stock and set request status = 'shipped'.
 */
export function useDispatchImsShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shipmentId, dto }: { shipmentId: string; dto: DispatchShipmentDto }) =>
      ImsSupplyTransferService.dispatchShipment(shipmentId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['ims-shipments-for-request'] });
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
      // Dispatch flips the underlying request's status ('shipped') via a DB trigger —
      // the Transfers detail page reads that status through useImsIndent, a separate
      // query key, so it must be invalidated here too or its header badge goes stale.
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
    },
  });
}

/**
 * College store: confirm receipt of a dispatched shipment.
 * DB RPC fires to create stock batches at the destination institution.
 */
export function useConfirmImsShipmentReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      shipmentId,
      receivedBy,
      notes,
      lines,
    }: {
      shipmentId: string;
      receivedBy: string;
      notes: string;
      lines: ConfirmReceiptLine[];
    }) => ImsSupplyTransferService.confirmReceipt(shipmentId, receivedBy, notes, lines),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['ims-shipments-for-request'] });
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
      // Receipt confirmation flips the request's status too ('received'/'received_with_variance') —
      // same stale-badge risk as dispatch (see useDispatchImsShipment).
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
    },
  });
}
