// ============================================================================
// React Query hooks for Learning Paths Module
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type {
  LearningPath,
  LearningPathStep,
  LearningPathListResponse,
  LearningPathFilters,
  CreateLearningPathInput,
  UpdateLearningPathInput,
  CreateLearningPathStepInput,
  UpdateLearningPathStepInput,
} from '@/types/learning-path';
import { LearningPathService } from '@/lib/services/learning-paths';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory
export const learningPathKeys = {
  all: ['learning-paths'] as const,
  lists: () => [...learningPathKeys.all, 'list'] as const,
  list: (filters: LearningPathFilters) => [...learningPathKeys.lists(), filters] as const,
  details: () => [...learningPathKeys.all, 'detail'] as const,
  detail: (id: string) => [...learningPathKeys.details(), id] as const,
  steps: (pathId: string) => [...learningPathKeys.all, 'steps', pathId] as const,
};

/**
 * Get learning paths with filters and pagination
 */
export function useLearningPaths(
  filters: Partial<LearningPathFilters> = {}
): UseQueryResult<LearningPathListResponse, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters = {
      institution_id: filters.institution_id || '',
      learner_id: filters.learner_id,
      status: filters.status,
      search: filters.search,
      page: filters.page || 1,
      limit: filters.limit || 10,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order,
    };
    return learningPathKeys.list(stableFilters);
  }, [
    filters.institution_id,
    filters.learner_id,
    filters.status,
    filters.search,
    filters.page,
    filters.limit,
    filters.sort_by,
    filters.sort_order,
  ]);

  const queryFn = useCallback(async () => {
    try {
      return await LearningPathService.getLearningPaths(filters as LearningPathFilters);
    } catch (error) {
      console.error('[useLearningPaths] Fetch error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch learning paths';
      throw new Error(message);
    }
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && !!filters.institution_id,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get single learning path by ID (with steps)
 */
export function useLearningPath(id: string): UseQueryResult<LearningPath, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learningPathKeys.detail(id),
    queryFn: () => LearningPathService.getLearningPathById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Get steps for a learning path
 */
export function useLearningPathSteps(pathId: string): UseQueryResult<LearningPathStep[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learningPathKeys.steps(pathId),
    queryFn: () => LearningPathService.getSteps(pathId),
    enabled: !authLoading && !!profile && !!pathId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Create learning path mutation
 */
export function useCreateLearningPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLearningPathInput) =>
      LearningPathService.createLearningPath(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
    },
  });
}

/**
 * Update learning path mutation
 */
export function useUpdateLearningPath(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateLearningPathInput) =>
      LearningPathService.updateLearningPath(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
      queryClient.setQueryData(learningPathKeys.detail(id), data);
    },
  });
}

/**
 * Delete learning path mutation
 */
export function useDeleteLearningPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => LearningPathService.deleteLearningPath(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
    },
  });
}

/**
 * Archive learning path mutation
 */
export function useArchiveLearningPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => LearningPathService.archiveLearningPath(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
    },
  });
}

/**
 * Create step mutation
 */
export function useCreateStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLearningPathStepInput) =>
      LearningPathService.createStep(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.steps(data.path_id) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(data.path_id) });
    },
  });
}

/**
 * Update step mutation
 */
export function useUpdateStep(pathId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stepId, data }: { stepId: string; data: UpdateLearningPathStepInput }) =>
      LearningPathService.updateStep(stepId, data),
    onSuccess: async () => {
      // Recalculate progress after step update
      await LearningPathService.recalculateProgress(pathId);
      queryClient.invalidateQueries({ queryKey: learningPathKeys.steps(pathId) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(pathId) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
    },
  });
}

/**
 * Delete step mutation
 */
export function useDeleteStep(pathId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stepId: string) => LearningPathService.deleteStep(stepId),
    onSuccess: async () => {
      await LearningPathService.recalculateProgress(pathId);
      queryClient.invalidateQueries({ queryKey: learningPathKeys.steps(pathId) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(pathId) });
    },
  });
}
