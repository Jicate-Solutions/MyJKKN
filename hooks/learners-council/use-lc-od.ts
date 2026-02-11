'use client';

// hooks/learners-council/use-lc-od.ts
// LC-004: OD Management - React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { LCODService } from '@/lib/services/learners-council/od-service';
import type { CreateODRequestDto, CreateODApprovalChainDto } from '@/types/learners-council';

// Query keys
export const lcODKeys = {
  all: ['lc-od'] as const,
  requests: () => [...lcODKeys.all, 'requests'] as const,
  requestList: (filters: Record<string, unknown>) => [...lcODKeys.requests(), filters] as const,
  requestDetail: (id: string) => [...lcODKeys.requests(), 'detail', id] as const,
  pendingApprovals: (approverId: string) => [...lcODKeys.all, 'pending-approvals', approverId] as const,
  chains: () => [...lcODKeys.all, 'chains'] as const,
  chainList: (institutionId: string) => [...lcODKeys.chains(), institutionId] as const,
};

/**
 * Hook to fetch OD requests with filters
 */
export function useODRequests(filters: {
  requester_id?: string;
  institution_id?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: lcODKeys.requestList(filters),
    queryFn: () => LCODService.getODRequests(filters),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch single OD request detail
 */
export function useODRequestDetail(id: string) {
  return useQuery({
    queryKey: lcODKeys.requestDetail(id),
    queryFn: () => LCODService.getODRequestById(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new OD request
 */
export function useCreateODRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      data,
      userId,
      institutionId,
    }: {
      data: CreateODRequestDto;
      userId: string;
      institutionId: string;
    }) => LCODService.createODRequest(data, userId, institutionId),
    onSuccess: () => {
      toast.success('OD request created');
      queryClient.invalidateQueries({ queryKey: lcODKeys.requests() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create OD request');
    },
  });
}

/**
 * Hook to submit OD request for approval
 */
export function useSubmitODRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => LCODService.submitODRequest(id),
    onSuccess: (updatedRequest) => {
      toast.success('OD request submitted for approval');
      queryClient.invalidateQueries({ queryKey: lcODKeys.requestDetail(updatedRequest.id) });
      queryClient.invalidateQueries({ queryKey: lcODKeys.requests() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit OD request');
    },
  });
}

/**
 * Hook to approve an OD request
 */
export function useApproveOD() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      approverId,
      comments,
    }: {
      requestId: string;
      approverId: string;
      comments?: string;
    }) => LCODService.approveODRequest(requestId, approverId, comments),
    onSuccess: (updatedRequest) => {
      toast.success('OD request approved');
      queryClient.invalidateQueries({ queryKey: lcODKeys.requestDetail(updatedRequest.id) });
      queryClient.invalidateQueries({ queryKey: lcODKeys.requests() });
      queryClient.invalidateQueries({ queryKey: lcODKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve OD request');
    },
  });
}

/**
 * Hook to reject an OD request
 */
export function useRejectOD() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      approverId,
      comments,
    }: {
      requestId: string;
      approverId: string;
      comments: string;
    }) => LCODService.rejectODRequest(requestId, approverId, comments),
    onSuccess: (updatedRequest) => {
      toast.success('OD request rejected');
      queryClient.invalidateQueries({ queryKey: lcODKeys.requestDetail(updatedRequest.id) });
      queryClient.invalidateQueries({ queryKey: lcODKeys.requests() });
      queryClient.invalidateQueries({ queryKey: lcODKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject OD request');
    },
  });
}

/**
 * Hook to fetch OD requests pending current user's approval
 */
export function useMyPendingApprovals(approverId: string) {
  return useQuery({
    queryKey: lcODKeys.pendingApprovals(approverId),
    queryFn: () => LCODService.getMyPendingApprovals(approverId),
    enabled: !!approverId,
    staleTime: 1 * 60 * 1000, // 1 minute - more frequent for approvals
  });
}

/**
 * Hook to fetch approval chains for an institution
 */
export function useApprovalChains(institutionId: string) {
  return useQuery({
    queryKey: lcODKeys.chainList(institutionId),
    queryFn: () => LCODService.getApprovalChains(institutionId),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create a new approval chain
 */
export function useCreateApprovalChain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateODApprovalChainDto; userId: string }) =>
      LCODService.createApprovalChain(data, userId),
    onSuccess: (newChain) => {
      toast.success('Approval chain created');
      queryClient.invalidateQueries({ queryKey: lcODKeys.chainList(newChain.institution_id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create approval chain');
    },
  });
}

/**
 * Hook to update an approval chain
 */
export function useUpdateApprovalChain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateODApprovalChainDto> }) =>
      LCODService.updateApprovalChain(id, data),
    onSuccess: (updatedChain) => {
      toast.success('Approval chain updated');
      queryClient.invalidateQueries({ queryKey: lcODKeys.chainList(updatedChain.institution_id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update approval chain');
    },
  });
}
