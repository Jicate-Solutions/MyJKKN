// ============================================================================
// React Query hooks for Learning Paths
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
import { LearningPathService, LearningPathStepService } from '@/lib/services/learning-path';
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

// ============================================================================
// LEARNING PATH HOOKS
// ============================================================================

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
      is_ai_generated: filters.is_ai_generated,
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
    filters.is_ai_generated,
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
    enabled: !authLoading && !!profile && !!filters.institution_id && filters.institution_id !== '',
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get single learning path by ID with steps
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
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(id) });
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
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(id) });
    },
  });
}

// ============================================================================
// LEARNING PATH STEP HOOKS
// ============================================================================

/**
 * Get steps for a learning path
 */
export function useLearningPathSteps(
  pathId: string
): UseQueryResult<LearningPathStep[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: learningPathKeys.steps(pathId),
    queryFn: () => LearningPathStepService.getStepsByPathId(pathId),
    enabled: !authLoading && !!profile && !!pathId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Create step mutation
 */
export function useCreateLearningPathStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLearningPathStepInput) =>
      LearningPathStepService.createStep(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.steps(data.path_id) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(data.path_id) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
    },
  });
}

/**
 * Update step mutation
 */
export function useUpdateLearningPathStep(pathId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLearningPathStepInput }) =>
      LearningPathStepService.updateStep(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.steps(pathId) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(pathId) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
    },
  });
}

/**
 * Delete step mutation
 */
export function useDeleteLearningPathStep(pathId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => LearningPathStepService.deleteStep(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.steps(pathId) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(pathId) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.lists() });
    },
  });
}

/**
 * Reorder steps mutation
 */
export function useReorderLearningPathSteps(pathId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stepIds: string[]) =>
      LearningPathStepService.reorderSteps(pathId, stepIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learningPathKeys.steps(pathId) });
      queryClient.invalidateQueries({ queryKey: learningPathKeys.detail(pathId) });
    },
  });
}
