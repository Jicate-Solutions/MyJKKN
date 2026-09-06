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
    mutationFn: ({
      data,
      userId,
      requiresHodApproval,
    }: {
      data: CreateImsIndentDto;
      userId: string;
      requiresHodApproval?: boolean;
    }) => ImsIndentService.createIndent(data, userId, { requiresHodApproval }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-pending-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-hod-pending-indents'] });
    },
  });
}

/**
 * Phase D: indents awaiting THIS user's HOD approval, across every department
 * where departments.head_of_department_id = hodUserId.
 */
export function useImsHodPendingIndents(hodUserId: string | undefined) {
  return useQuery({
    queryKey: ['ims-hod-pending-indents', hodUserId],
    queryFn: () => ImsIndentService.getHodPendingIndents(hodUserId!),
    enabled: !!hodUserId,
    staleTime: 60 * 1000, // approval queue: refresh faster than list pages
  });
}

type UpdateImsIndentData = Omit<
  CreateImsIndentDto,
  | 'institution_id'
  | 'store_id'
  | 'request_scope'
  | 'source_store_id'
  | 'destination_institution_id'
  | 'destination_store_id'
>;

export function useUpdateImsIndent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      userId,
    }: {
      id: string;
      data: UpdateImsIndentData;
      userId: string;
    }) => ImsIndentService.updateIndent(id, data, userId),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-indent', id] });
      queryClient.invalidateQueries({ queryKey: ['ims-pending-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-dept-indents'] });
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
      queryClient.invalidateQueries({ queryKey: ['ims-hod-pending-indents'] });
    },
  });
}

export function useIssueImsIndentItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity, userId }: { itemId: string; quantity: number; userId: string }) =>
      ImsIndentService.issueItem(itemId, quantity, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ims-department-stock'] });
      queryClient.invalidateQueries({ queryKey: ['ims-department-summaries'] });
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

export function useLocalApproveImsIndent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      ImsIndentService.localApproveIndent(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['ims-hod-pending-indents'] });
      // The approved indent lands in the store admin's pending queue next
      queryClient.invalidateQueries({ queryKey: ['ims-pending-indents'] });
    },
  });
}
