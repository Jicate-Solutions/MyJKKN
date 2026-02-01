'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';
import type {
  ProcessAudit,
  ProcessAuditFilters,
  CreateProcessAuditDto,
  UpdateProcessAuditDto,
  ABCDRating
} from '@/types/process-excellence';

// Query keys
export const processAuditKeys = {
  all: ['process-audits'] as const,
  lists: () => [...processAuditKeys.all, 'list'] as const,
  list: (filters: ProcessAuditFilters) =>
    [...processAuditKeys.lists(), filters] as const,
  details: () => [...processAuditKeys.all, 'detail'] as const,
  detail: (id: string) => [...processAuditKeys.details(), id] as const
};

// Hook for fetching process audits list
export function useProcessAudits(filters: ProcessAuditFilters) {
  return useQuery({
    queryKey: processAuditKeys.list(filters),
    queryFn: () => ProcessExcellenceService.getProcessAudits(filters),
    enabled: !!filters.institution_id,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

// Hook for fetching single process audit
export function useProcessAudit(id: string) {
  return useQuery({
    queryKey: processAuditKeys.detail(id),
    queryFn: () => ProcessExcellenceService.getProcessAudit(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000
  });
}

// Hook for creating process audit
export function useCreateProcessAudit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProcessAuditDto) =>
      ProcessExcellenceService.createProcessAudit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: processAuditKeys.lists() });
      toast.success('Process audit created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create process audit');
    }
  });
}

// Hook for updating process audit
export function useUpdateProcessAudit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data
    }: {
      id: string;
      data: UpdateProcessAuditDto;
    }) => ProcessExcellenceService.updateProcessAudit(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: processAuditKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: processAuditKeys.detail(data.id)
      });
      toast.success('Process audit updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update process audit');
    }
  });
}

// Hook for finalizing process audit
export function useFinalizeProcessAudit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      abcd_rating,
      findings,
      recommendations
    }: {
      id: string;
      abcd_rating: ABCDRating;
      findings?: string;
      recommendations?: string;
    }) =>
      ProcessExcellenceService.updateProcessAudit(id, {
        status: 'finalized',
        abcd_rating,
        findings,
        recommendations
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: processAuditKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: processAuditKeys.detail(data.id)
      });
      toast.success(`Audit finalized with rating: ${data.abcd_rating}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to finalize process audit');
    }
  });
}

// Hook for deleting process audit
export function useDeleteProcessAudit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      ProcessExcellenceService.deleteProcessAudit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: processAuditKeys.lists() });
      toast.success('Process audit deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete process audit');
    }
  });
}

// Hook for recent audits
export function useRecentProcessAudits(institutionId: string, limit = 5) {
  return useQuery({
    queryKey: [...processAuditKeys.lists(), 'recent', institutionId, limit],
    queryFn: () =>
      ProcessExcellenceService.getProcessAudits({
        institution_id: institutionId,
        limit,
        sortBy: 'created_at',
        sortDirection: 'desc'
      }),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
    select: (data) => data.data
  });
}

// Hook for audits by rating
export function useProcessAuditsByRating(
  institutionId: string,
  rating: ABCDRating
) {
  return useQuery({
    queryKey: [...processAuditKeys.lists(), 'rating', institutionId, rating],
    queryFn: () =>
      ProcessExcellenceService.getProcessAudits({
        institution_id: institutionId,
        abcd_rating: rating,
        status: 'finalized',
        limit: 50
      }),
    enabled: !!institutionId && !!rating,
    staleTime: 5 * 60 * 1000,
    select: (data) => data.data
  });
}

// Hook for draft audits
export function useDraftProcessAudits(institutionId: string) {
  return useQuery({
    queryKey: [...processAuditKeys.lists(), 'draft', institutionId],
    queryFn: () =>
      ProcessExcellenceService.getProcessAudits({
        institution_id: institutionId,
        status: 'draft',
        limit: 20
      }),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000,
    select: (data) => data.data
  });
}
