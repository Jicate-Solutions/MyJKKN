'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import type {
  MaturityProgressItem,
  MaturityProgressFilters,
  CreateMaturityProgressItemDto,
  UpdateMaturityProgressItemDto
} from '@/types/maturity-assessment';
import { maturityAssessmentKeys } from './use-maturity-assessments';

// Query keys
export const maturityProgressKeys = {
  all: ['maturity-progress'] as const,
  lists: () => [...maturityProgressKeys.all, 'list'] as const,
  list: (filters: MaturityProgressFilters) =>
    [...maturityProgressKeys.lists(), filters] as const,
  byAssessment: (assessmentId: string) =>
    [...maturityProgressKeys.all, 'assessment', assessmentId] as const,
  detail: (id: string) => [...maturityProgressKeys.all, 'detail', id] as const
};

/**
 * Hook for fetching progress items with filters
 */
export function useMaturityProgress(filters: MaturityProgressFilters = {}) {
  return useQuery({
    queryKey: maturityProgressKeys.list(filters),
    queryFn: () => MaturityAssessmentService.getProgressItems(filters),
    staleTime: 1 * 60 * 1000 // 1 minute
  });
}

/**
 * Hook for fetching progress items by assessment ID
 */
export function useMaturityProgressByAssessment(assessmentId: string | undefined) {
  return useQuery({
    queryKey: maturityProgressKeys.byAssessment(assessmentId || ''),
    queryFn: () =>
      MaturityAssessmentService.getProgressItems({ assessment_id: assessmentId }),
    enabled: !!assessmentId,
    staleTime: 1 * 60 * 1000
  });
}

/**
 * Hook for fetching a single progress item
 */
export function useMaturityProgressItem(id: string | undefined) {
  return useQuery({
    queryKey: maturityProgressKeys.detail(id || ''),
    queryFn: () => MaturityAssessmentService.getProgressItemById(id!),
    enabled: !!id,
    staleTime: 1 * 60 * 1000
  });
}

/**
 * Hook for fetching overdue progress items
 */
export function useOverdueMaturityProgress(institutionId?: string) {
  return useQuery({
    queryKey: [...maturityProgressKeys.all, 'overdue', institutionId],
    queryFn: () => MaturityAssessmentService.getProgressItems({ overdue: true }),
    enabled: !!institutionId,
    staleTime: 1 * 60 * 1000
  });
}

/**
 * Hook for creating a progress item
 */
export function useCreateMaturityProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateMaturityProgressItemDto) =>
      MaturityAssessmentService.createProgressItem(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: maturityProgressKeys.byAssessment(data.assessment_id)
      });
      queryClient.invalidateQueries({ queryKey: maturityProgressKeys.lists() });
      // Also invalidate the assessment detail to refresh progress count
      queryClient.invalidateQueries({
        queryKey: maturityAssessmentKeys.detail(data.assessment_id)
      });
      toast.success('Action item created');
    },
    onError: (error: Error) => {
      console.error('[useCreateMaturityProgress] Error:', error);
      toast.error(error.message || 'Failed to create action item');
    }
  });
}

/**
 * Hook for updating a progress item
 */
export function useUpdateMaturityProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateMaturityProgressItemDto }) =>
      MaturityAssessmentService.updateProgressItem(id, dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: maturityProgressKeys.detail(data.id)
      });
      queryClient.invalidateQueries({
        queryKey: maturityProgressKeys.byAssessment(data.assessment_id)
      });
      queryClient.invalidateQueries({ queryKey: maturityProgressKeys.lists() });
      toast.success('Action item updated');
    },
    onError: (error: Error) => {
      console.error('[useUpdateMaturityProgress] Error:', error);
      toast.error(error.message || 'Failed to update action item');
    }
  });
}

/**
 * Hook for completing a progress item
 */
export function useCompleteMaturityProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      MaturityAssessmentService.updateProgressItem(id, {
        status: 'completed',
        completed_at: new Date().toISOString()
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: maturityProgressKeys.byAssessment(data.assessment_id)
      });
      queryClient.invalidateQueries({ queryKey: maturityProgressKeys.lists() });
      toast.success('Action item completed');
    },
    onError: (error: Error) => {
      console.error('[useCompleteMaturityProgress] Error:', error);
      toast.error(error.message || 'Failed to complete action item');
    }
  });
}

/**
 * Hook for starting a progress item (change to in_progress)
 */
export function useStartMaturityProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      MaturityAssessmentService.updateProgressItem(id, { status: 'in_progress' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: maturityProgressKeys.byAssessment(data.assessment_id)
      });
      queryClient.invalidateQueries({ queryKey: maturityProgressKeys.lists() });
      toast.success('Action item started');
    },
    onError: (error: Error) => {
      console.error('[useStartMaturityProgress] Error:', error);
      toast.error(error.message || 'Failed to start action item');
    }
  });
}

/**
 * Hook for blocking a progress item
 */
export function useBlockMaturityProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      MaturityAssessmentService.updateProgressItem(id, { status: 'blocked', notes }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: maturityProgressKeys.byAssessment(data.assessment_id)
      });
      queryClient.invalidateQueries({ queryKey: maturityProgressKeys.lists() });
      toast.success('Action item marked as blocked');
    },
    onError: (error: Error) => {
      console.error('[useBlockMaturityProgress] Error:', error);
      toast.error(error.message || 'Failed to block action item');
    }
  });
}

/**
 * Hook for deleting a progress item
 */
export function useDeleteMaturityProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => MaturityAssessmentService.deleteProgressItem(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: maturityProgressKeys.lists() });
      toast.success('Action item deleted');
    },
    onError: (error: Error) => {
      console.error('[useDeleteMaturityProgress] Error:', error);
      toast.error(error.message || 'Failed to delete action item');
    }
  });
}
