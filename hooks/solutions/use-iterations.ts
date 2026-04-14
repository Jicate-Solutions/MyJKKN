'use client';

/**
 * Solutions Hub - Iterations Hooks
 * Purpose: React Query hooks for prototype iterations CRUD operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type {
  IterationFilters,
  IterationWithBugs,
  CreateIterationServiceInput,
  UpdateIterationInput,
} from '@/lib/services/solutions';
import type { PrototypeIteration } from '@/lib/services/solutions/types';

// ============================================
// RE-EXPORT TYPES
// ============================================

export type { IterationFilters, IterationWithBugs, UpdateIterationInput };
export type CreateIterationInput = CreateIterationServiceInput;

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all iterations with optional filters
 */
export function useIterations(filters?: IterationFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.iterations.list(filters),
    queryFn: () => apiClient.get('/api/solutions/iterations', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single iteration by ID
 */
export function useIteration(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.iterations.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/iterations/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch all iterations for a specific phase
 */
export function usePhaseIterations(phaseId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.iterations.byPhase(phaseId),
    queryFn: () => apiClient.get('/api/solutions/iterations', { params: { phase_id: phaseId } }),
    enabled: !!phaseId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch the latest iteration for a phase
 */
export function useLatestIteration(phaseId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.iterations.latest(phaseId),
    queryFn: () => apiClient.get('/api/solutions/iterations', { params: { phase_id: phaseId, latest: 'true' } }),
    enabled: !!phaseId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch iteration statistics (dashboard data)
 */
export function useIterationStats() {
  return useQuery({
    queryKey: solutionsHubKeys.iterations.stats(),
    queryFn: () => apiClient.get('/api/solutions/iterations', { params: { stats: 'true' } }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Get next version number for a phase
 */
export function useNextVersionNumber(phaseId: string) {
  return useQuery({
    queryKey: [...solutionsHubKeys.iterations.byPhase(phaseId), 'next-version'],
    queryFn: () => apiClient.get('/api/solutions/iterations', { params: { phase_id: phaseId, next_version: 'true' } }),
    enabled: !!phaseId,
    staleTime: 0, // Always fetch fresh
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new iteration
 */
export function useCreateIteration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateIterationInput) => apiClient.post<PrototypeIteration>('/api/solutions/iterations', input),
    onSuccess: (data: PrototypeIteration) => {
      // Invalidate iteration lists
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.iterations.all });

      // Invalidate phase-specific iterations
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.iterations.byPhase(data.phase_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.iterations.latest(data.phase_id),
        });
        // Also invalidate the phase detail (prototype URL updated)
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
        });
      }
    },
  });
}

/**
 * Update an existing iteration
 */
export function useUpdateIteration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIterationInput }) =>
      apiClient.patch<PrototypeIteration>(`/api/solutions/iterations/${id}`, input),
    onSuccess: (data: PrototypeIteration) => {
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.iterations.all });

      // Update cache for this iteration
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.iterations.detail(data.id), data);
      }

      // Invalidate phase iterations
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.iterations.byPhase(data.phase_id),
        });
      }
    },
  });
}

/**
 * Complete an iteration (mark as client approved)
 */
export function useCompleteIteration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback?: string }) =>
      apiClient.patch<PrototypeIteration>(`/api/solutions/iterations/${id}`, { status: 'approved', feedback }),
    onSuccess: (data: PrototypeIteration) => {
      // Invalidate iteration caches
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.iterations.all });

      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.iterations.detail(data.id), data);
      }

      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.iterations.byPhase(data.phase_id),
        });
        // Phase status may change to approved
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
        });
        queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      }
    },
  });
}

/**
 * Delete an iteration
 */
export function useDeleteIteration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/iterations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.iterations.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all }); // Bugs deleted too
    },
  });
}

/**
 * Add feedback to an iteration
 */
export function useAddIterationFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: string }) =>
      apiClient.patch<PrototypeIteration>(`/api/solutions/iterations/${id}`, { feedback }),
    onSuccess: (data: PrototypeIteration) => {
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.iterations.detail(data.id), data);
      }
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.iterations.byPhase(data.phase_id),
        });
      }
    },
  });
}
