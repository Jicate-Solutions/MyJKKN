'use client';

/**
 * Solutions Hub - MOU Hooks
 * Purpose: React Query hooks for MOU (Memorandum of Understanding) management
 * Connected to: /api/solutions/mous routes
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import {
  MOU_STATUS_LABELS,
  type MouFilters,
  type MouWithSolution,
} from '@/lib/services/solutions/mou-service';
import type {
  MouStatus,
  CreateMouInput,
  UpdateMouInput,
} from '@/lib/services/solutions/types';

// ============================================
// TYPES (re-export from service types)
// ============================================

export type {
  MouStatus,
  MouFilters,
  MouWithSolution,
  CreateMouInput,
  UpdateMouInput,
};

export { MOU_STATUS_LABELS };

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all MOUs with optional filters
 */
export function useMous(filters?: MouFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.mous.list(filters),
    queryFn: () => apiClient.get('/api/solutions/mous', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single MOU by ID
 */
export function useMou(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.mous.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/mous/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch MOU by solution ID
 */
export function useMouBySolution(solutionId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.mous.bySolution(solutionId),
    queryFn: () => apiClient.get('/api/solutions/mous', { params: { solution_id: solutionId } }),
    enabled: !!solutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new MOU
 */
export function useCreateMou() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMouInput) =>
      apiClient.post('/api/solutions/mous', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.mous.all });
    },
  });
}

/**
 * Update an existing MOU
 */
export function useUpdateMou() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMouInput }) =>
      apiClient.patch<{ id?: string }>(`/api/solutions/mous/${id}`, input),
    onSuccess: (data: { id?: string }) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.mous.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.mous.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete an MOU
 */
export function useDeleteMou() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/mous/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.mous.all });
    },
  });
}

/**
 * Update MOU status
 */
export function useUpdateMouStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MouStatus }) =>
      apiClient.patch<{ id?: string }>(`/api/solutions/mous/${id}/status`, { status }),
    onSuccess: (data: { id?: string }) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.mous.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.mous.detail(data.id), data);
      }
    },
  });
}
