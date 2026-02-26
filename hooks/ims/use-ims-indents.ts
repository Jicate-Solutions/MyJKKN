'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImsIndentService } from '@/lib/services/ims/indent-service';
import type { ImsIndentFilters, CreateImsIndentDto } from '@/types/ims';

export function useImsIndents(filters: ImsIndentFilters) {
  return useQuery({
    queryKey: ['ims-indents', filters],
    queryFn: () => ImsIndentService.getIndents(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsIndent(id: string) {
  return useQuery({
    queryKey: ['ims-indent', id],
    queryFn: () => ImsIndentService.getIndent(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsPendingIndents(filters: ImsIndentFilters) {
  return useQuery({
    queryKey: ['ims-pending-indents', filters],
    queryFn: () => ImsIndentService.getPendingIndents(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateImsIndent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateImsIndentDto; userId: string }) =>
      ImsIndentService.createIndent(data, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-pending-indents'] });
    },
  });
}

export function useApproveImsIndent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      ImsIndentService.approveIndent(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
      queryClient.invalidateQueries({ queryKey: ['ims-pending-indents'] });
    },
  });
}

export function useRejectImsIndent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId, reason }: { id: string; userId: string; reason: string }) =>
      ImsIndentService.rejectIndent(id, userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
      queryClient.invalidateQueries({ queryKey: ['ims-pending-indents'] });
    },
  });
}

export function useIssueImsIndentItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      ImsIndentService.issueItem(itemId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
    },
  });
}

export function useMarkImsIndentIssued() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsIndentService.markAsIssued(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
    },
  });
}

export function useConfirmImsIndentDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsIndentService.confirmDelivery(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
    },
  });
}

export function useCancelImsIndent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsIndentService.cancelIndent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-pending-indents'] });
    },
  });
}
