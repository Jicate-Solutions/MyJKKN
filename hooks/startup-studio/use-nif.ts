'use client';

/**
 * Startup Studio - NIF (Nattraja Incubation Forum) Hooks
 * Purpose: React Query hooks for NIF candidate pipeline management
 * Connected to: startup-studio nif API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// QUERY HOOKS - NIF
// ============================================

/**
 * Fetch all NIF candidates with optional filters
 */
export function useNifCandidates(filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.nif.list(filters),
    queryFn: () => apiClient.get('/api/startup-studio/nif', { params: filters }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single NIF candidate by ID
 */
export function useNifCandidate(id: string) {
  return useQuery({
    queryKey: startupStudioKeys.nif.detail(id),
    queryFn: () => apiClient.get(`/api/startup-studio/nif/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch NIF stage counts for dashboard
 */
export function useNifStageCounts() {
  return useQuery({
    queryKey: startupStudioKeys.nif.stageCounts(),
    queryFn: () => apiClient.get('/api/startup-studio/nif/stage-counts'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch stage history for a NIF candidate
 */
export function useNifStageHistory(candidateId: string) {
  return useQuery({
    queryKey: startupStudioKeys.nif.history(candidateId),
    queryFn: () => apiClient.get(`/api/startup-studio/nif/${candidateId}/history`),
    enabled: !!candidateId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS - NIF
// ============================================

/**
 * Create a new NIF candidate
 */
export function useCreateNifCandidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/nif', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.all });
    },
  });
}

/**
 * Update an existing NIF candidate
 */
export function useUpdateNifCandidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/nif/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.all });
    },
  });
}

/**
 * Advance a NIF candidate to the next stage
 */
export function useAdvanceNifStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/nif/${id}/advance`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.all });
    },
  });
}

/**
 * Reject a NIF candidate
 */
export function useRejectNifCandidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/nif/${id}/reject`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.all });
    },
  });
}
