'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelVacateRequestService } from '@/lib/services/campus-living/hostel-vacate-request-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  SubmitVacateRequestDTO,
  VacateRequestFilters,
  HostelVacateDocument,
} from '@/types/hostel-vacate';

export const hostelVacateKeys = {
  all: ['hostel-vacate'] as const,
  list: (institutionId: string, filters?: VacateRequestFilters) =>
    ['hostel-vacate', 'list', institutionId, filters] as const,
  detail: (id: string) => ['hostel-vacate', 'detail', id] as const,
  myRequests: (userId: string) => ['hostel-vacate', 'mine', userId] as const,
};

// --- Query hooks ---

export function useVacateRequests(institutionId: string, filters?: VacateRequestFilters) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelVacateKeys.list(institutionId, filters),
    queryFn: () => HostelVacateRequestService.getRequests(institutionId, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useVacateRequest(id: string) {
  return useQuery({
    queryKey: hostelVacateKeys.detail(id),
    queryFn: () => HostelVacateRequestService.getRequest(id),
    enabled: !!id,
  });
}

export function useMyVacateRequests(userId: string | undefined) {
  return useQuery({
    queryKey: hostelVacateKeys.myRequests(userId ?? ''),
    queryFn: () => HostelVacateRequestService.getMyRequests(userId!),
    enabled: !!userId,
  });
}

// --- Mutation hooks ---

export function useCreateVacateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, submittedById }: { payload: SubmitVacateRequestDTO; submittedById: string }) =>
      HostelVacateRequestService.createDraft(payload, submittedById),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      toast.success('Vacate request draft created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create draft: ${error.message}`);
    },
  });
}

export function useSubmitVacateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, submitterId }: { requestId: string; submitterId: string }) =>
      HostelVacateRequestService.submitDraft(requestId, submitterId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
      toast.success('Vacate request submitted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit: ${error.message}`);
    },
  });
}

export function useAdvanceVacate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      actorId,
      action,
      remarks,
    }: {
      requestId: string;
      actorId: string | null;
      action: 'approve' | 'reject' | 'escalate' | 'skip';
      remarks?: string;
    }) => HostelVacateRequestService.advance(requestId, actorId, action, remarks),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
      toast.success(`Request ${variables.action}d`);
    },
    onError: (error: Error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });
}

export function useRejectVacate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      actorId,
      reason,
    }: {
      requestId: string;
      actorId: string;
      reason: string;
    }) => HostelVacateRequestService.reject(requestId, actorId, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
      toast.success('Request rejected');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });
}

export function useCancelVacate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      actorId,
      reason,
    }: {
      requestId: string;
      actorId: string;
      reason: string;
    }) => HostelVacateRequestService.cancel(requestId, actorId, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
      toast.success('Request cancelled');
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    },
  });
}

export function useCreateVacateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof HostelVacateRequestService.createDocument>[0]) =>
      HostelVacateRequestService.createDocument(payload),
    onSuccess: (data: HostelVacateDocument) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(data.vacate_request_id) });
      toast.success('Document uploaded');
    },
    onError: (error: Error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });
}

export function useDeleteVacateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => HostelVacateRequestService.deleteDocument(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      toast.success('Document removed');
    },
    onError: (error: Error) => {
      toast.error(`Remove failed: ${error.message}`);
    },
  });
}

export function useMarkClearanceItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      cleared,
      notes,
      clearedBy,
    }: {
      itemId: string;
      cleared: boolean;
      notes: string | null;
      clearedBy: string;
    }) => HostelVacateRequestService.markClearanceItem(itemId, cleared, notes, clearedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });
}

export function useFinalizeVacate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, actorId }: { requestId: string; actorId: string }) =>
      HostelVacateRequestService.finalize(requestId, actorId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
      toast.success('Vacate finalized');
    },
    onError: (error: Error) => {
      toast.error(`Failed to finalize: ${error.message}`);
    },
  });
}
