'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import type {
  MaturityAssessment,
  MaturityAssessmentFilters,
  CreateMaturityAssessmentDto,
  UpdateMaturityAssessmentDto,
  MaturityAssessmentListResponse
} from '@/types/maturity-assessment';

// Query keys
export const maturityAssessmentKeys = {
  all: ['maturity-assessments'] as const,
  lists: () => [...maturityAssessmentKeys.all, 'list'] as const,
  list: (filters: MaturityAssessmentFilters) =>
    [...maturityAssessmentKeys.lists(), filters] as const,
  details: () => [...maturityAssessmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...maturityAssessmentKeys.details(), id] as const,
  latest: (institutionId: string, departmentId?: string) =>
    [...maturityAssessmentKeys.all, 'latest', institutionId, departmentId] as const
};

/**
 * Hook for fetching assessments with filters and pagination (React Query based)
 * FIXED: Removed manual state management to prevent memory leaks and stale data
 */
export function useMaturityAssessments(initialFilters: MaturityAssessmentFilters) {
  const [filters, setFilters] = useState<MaturityAssessmentFilters>(initialFilters);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: maturityAssessmentKeys.list(filters),
    queryFn: () => MaturityAssessmentService.getAssessments(filters),
    staleTime: 2 * 60 * 1000,
    placeholderData: (previousData) => previousData // Keep previous data while loading
  });

  const updateFilters = useCallback((newFilters: Partial<MaturityAssessmentFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  return {
    assessments: data?.data || [],
    loading: isLoading,
    error: error?.message || null,
    metadata: data?.metadata || { total: 0, page: 1, limit: 10, totalPages: 0 },
    filters,
    updateFilters,
    changePage,
    refetch
  };
}

/**
 * Hook for fetching assessments with React Query
 */
export function useMaturityAssessmentsQuery(filters: MaturityAssessmentFilters) {
  return useQuery({
    queryKey: maturityAssessmentKeys.list(filters),
    queryFn: () => MaturityAssessmentService.getAssessments(filters),
    staleTime: 2 * 60 * 1000 // 2 minutes
  });
}

/**
 * Hook for fetching a single assessment by ID
 */
export function useMaturityAssessment(id: string | undefined) {
  return useQuery({
    queryKey: maturityAssessmentKeys.detail(id || ''),
    queryFn: () => MaturityAssessmentService.getAssessmentById(id!),
    enabled: !!id,
    staleTime: 2 * 60 * 1000
  });
}

/**
 * Hook for fetching the latest assessment
 */
export function useLatestMaturityAssessment(
  institutionId: string | undefined,
  departmentId?: string
) {
  return useQuery({
    queryKey: maturityAssessmentKeys.latest(institutionId || '', departmentId),
    queryFn: () => MaturityAssessmentService.getLatestAssessment(institutionId!, departmentId),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000
  });
}

/**
 * Hook for creating an assessment
 */
export function useCreateMaturityAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateMaturityAssessmentDto) =>
      MaturityAssessmentService.createAssessment(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.lists() });
      toast.success('Assessment created successfully');
    },
    onError: (error: Error) => {
      console.error('[useCreateMaturityAssessment] Error:', error);
      toast.error(error.message || 'Failed to create assessment');
    }
  });
}

/**
 * Hook for updating an assessment
 */
export function useUpdateMaturityAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateMaturityAssessmentDto }) =>
      MaturityAssessmentService.updateAssessment(id, dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.lists() });
      toast.success('Assessment updated successfully');
    },
    onError: (error: Error) => {
      console.error('[useUpdateMaturityAssessment] Error:', error);
      toast.error(error.message || 'Failed to update assessment');
    }
  });
}

/**
 * Hook for submitting an assessment for review
 */
export function useSubmitMaturityAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => MaturityAssessmentService.submitAssessment(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.lists() });
      toast.success('Assessment submitted for review');
    },
    onError: (error: Error) => {
      console.error('[useSubmitMaturityAssessment] Error:', error);
      toast.error(error.message || 'Failed to submit assessment');
    }
  });
}

/**
 * Hook for approving an assessment
 */
export function useApproveMaturityAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reviewerId }: { id: string; reviewerId: string }) =>
      MaturityAssessmentService.approveAssessment(id, reviewerId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.lists() });
      toast.success('Assessment approved');
    },
    onError: (error: Error) => {
      console.error('[useApproveMaturityAssessment] Error:', error);
      toast.error(error.message || 'Failed to approve assessment');
    }
  });
}

/**
 * Hook for rejecting an assessment (back to draft)
 */
export function useRejectMaturityAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => MaturityAssessmentService.rejectAssessment(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.lists() });
      toast.success('Assessment returned to draft');
    },
    onError: (error: Error) => {
      console.error('[useRejectMaturityAssessment] Error:', error);
      toast.error(error.message || 'Failed to reject assessment');
    }
  });
}

/**
 * Hook for archiving an assessment
 */
export function useArchiveMaturityAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => MaturityAssessmentService.archiveAssessment(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.lists() });
      toast.success('Assessment archived');
    },
    onError: (error: Error) => {
      console.error('[useArchiveMaturityAssessment] Error:', error);
      toast.error(error.message || 'Failed to archive assessment');
    }
  });
}

/**
 * Hook for deleting an assessment
 */
export function useDeleteMaturityAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => MaturityAssessmentService.deleteAssessment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maturityAssessmentKeys.lists() });
      toast.success('Assessment deleted');
    },
    onError: (error: Error) => {
      console.error('[useDeleteMaturityAssessment] Error:', error);
      toast.error(error.message || 'Failed to delete assessment');
    }
  });
}
