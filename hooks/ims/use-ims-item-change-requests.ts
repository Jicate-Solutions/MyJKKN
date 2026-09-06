'use client';

// hooks/ims/use-ims-item-change-requests.ts
//
// React Query bindings for item change requests. Mirrors the shape of the other
// IMS hooks (query keys prefixed `ims-`, 2-minute staleTime on lists).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ImsItemChangeRequestService,
  type ImsItemChangeRequest,
} from '@/lib/services/ims/item-change-request-service';

export function useImsItemChangeRequests(filters: {
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  institutionId?: string | null;
  requestedBy?: string | null;
} = {}) {
  return useQuery<ImsItemChangeRequest[]>({
    queryKey: ['ims-item-change-requests', filters.status ?? 'all',
               filters.institutionId ?? null, filters.requestedBy ?? null],
    queryFn: () => ImsItemChangeRequestService.listRequests(filters),
    staleTime: 60 * 1000,
  });
}

/** Item ids with a request already waiting — used to badge the item list. */
export function useImsPendingItemChangeIds(institutionId?: string | null) {
  return useQuery<Set<string>>({
    queryKey: ['ims-item-change-pending-ids', institutionId ?? null],
    queryFn: () => ImsItemChangeRequestService.getPendingItemIds(institutionId),
    staleTime: 60 * 1000,
  });
}

export function useCreateImsItemChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof ImsItemChangeRequestService.createRequest>[0]) =>
      ImsItemChangeRequestService.createRequest(input),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['ims-item-change-requests'] });
      qc.invalidateQueries({ queryKey: ['ims-item-change-pending-ids'] });
      // A null result means the form was saved without actually changing anything.
      // Saying "sent for approval" there would be a lie the approver then has to
      // untangle, so report it honestly instead.
      if (result === null) {
        toast.info('Nothing changed, so no approval was requested.');
      } else {
        toast.success('Sent to a super admin for approval.');
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Could not send the request'),
  });
}

export function useReviewImsItemChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string | null }) =>
      ImsItemChangeRequestService.review(id, approve, note),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['ims-item-change-requests'] });
      qc.invalidateQueries({ queryKey: ['ims-item-change-pending-ids'] });
      // The item itself just changed, so anything showing it is now stale.
      qc.invalidateQueries({ queryKey: ['ims-items'] });
      qc.invalidateQueries({ queryKey: ['ims-sellable-items'] });
      toast.success(
        result.status === 'approved'
          ? 'Approved — the change is now live.'
          : 'Request rejected.',
      );
    },
    onError: (err: Error) => toast.error(err.message || 'Could not review the request'),
  });
}
