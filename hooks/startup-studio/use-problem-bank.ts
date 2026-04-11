'use client';

/**
 * Startup Studio - Problem Bank Hooks
 * Purpose: React Query hooks for problem bank management
 * Connected to: startup-studio problem-bank API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// QUERY HOOKS - PROBLEMS
// ============================================

/**
 * Fetch all problems with optional filters
 */
export function useProblems(filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.problemBank.list(filters),
    queryFn: () => apiClient.get('/api/startup-studio/problem-bank', { params: filters }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single problem by ID
 */
export function useProblem(id: string) {
  return useQuery({
    queryKey: startupStudioKeys.problemBank.detail(id),
    queryFn: () => apiClient.get(`/api/startup-studio/problem-bank/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch top-rated problems
 */
export function useTopProblems() {
  return useQuery({
    queryKey: startupStudioKeys.problemBank.top(),
    queryFn: () => apiClient.get('/api/startup-studio/problem-bank/top'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// MUTATION HOOKS - PROBLEMS
// ============================================

/**
 * Create a new problem
 */
export function useCreateProblem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/problem-bank', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.problemBank.all });
    },
  });
}

/**
 * Update an existing problem
 */
export function useUpdateProblem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/problem-bank/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.problemBank.all });
    },
  });
}

/**
 * Delete a problem
 */
export function useDeleteProblem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/startup-studio/problem-bank/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.problemBank.all });
    },
  });
}

/**
 * Add an attempt to a problem
 */
export function useAddAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/problem-bank/${id}/attempts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.problemBank.all });
    },
  });
}

/**
 * Update an attempt on a problem
 */
export function useUpdateAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ attemptId, data }: { attemptId: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/problem-bank/attempts/${attemptId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.problemBank.all });
    },
  });
}

/**
 * Add a tag to a problem
 */
export function useAddTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/problem-bank/${id}/tags`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.problemBank.all });
    },
  });
}

/**
 * Remove a tag from a problem
 */
export function useRemoveTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tagId: string) =>
      apiClient.delete(`/api/startup-studio/problem-bank/tags/${tagId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.problemBank.all });
    },
  });
}

/**
 * Add a score to a problem
 */
export function useAddScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/problem-bank/${id}/scores`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.problemBank.all });
    },
  });
}
