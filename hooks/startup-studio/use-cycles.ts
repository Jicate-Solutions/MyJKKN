'use client';

/**
 * Startup Studio - Cycle Hooks
 * Purpose: React Query hooks for innovation cycles and step data
 * Connected to: startup-studio cycles API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// QUERY HOOKS - CYCLES
// ============================================

/**
 * Fetch all cycles with optional filters
 */
export function useCycles(filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.cycles.list(filters),
    queryFn: () => apiClient.get('/api/startup-studio/cycles', { params: filters }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single cycle by ID
 */
export function useCycle(id: string) {
  return useQuery({
    queryKey: startupStudioKeys.cycles.detail(id),
    queryFn: () => apiClient.get(`/api/startup-studio/cycles/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS - CYCLES
// ============================================

/**
 * Create a new cycle
 */
export function useCreateCycle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/cycles', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Update an existing cycle
 */
export function useUpdateCycle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/cycles/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Delete a cycle
 */
export function useDeleteCycle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/startup-studio/cycles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Advance a cycle to the next step
 */
export function useAdvanceStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/api/startup-studio/cycles/${id}/advance`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Complete a cycle
 */
export function useCompleteCycle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/api/startup-studio/cycles/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Upsert problem step data for a cycle
 */
export function useUpsertProblem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cycleId, data }: { cycleId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/cycles/${cycleId}/steps/problem`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Upsert context step data for a cycle
 */
export function useUpsertContext() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cycleId, data }: { cycleId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/cycles/${cycleId}/steps/context`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Upsert value-assessment step data for a cycle
 */
export function useUpsertValueAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cycleId, data }: { cycleId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/cycles/${cycleId}/steps/value-assessment`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Upsert workflow step data for a cycle
 */
export function useUpsertWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cycleId, data }: { cycleId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/cycles/${cycleId}/steps/workflow`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Upsert prompt step data for a cycle
 */
export function useUpsertPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cycleId, data }: { cycleId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/cycles/${cycleId}/steps/prompt`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Upsert build step data for a cycle
 */
export function useUpsertBuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cycleId, data }: { cycleId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/cycles/${cycleId}/steps/build`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}

/**
 * Upsert impact step data for a cycle
 */
export function useUpsertImpact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cycleId, data }: { cycleId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/cycles/${cycleId}/steps/impact`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.cycles.all });
    },
  });
}
