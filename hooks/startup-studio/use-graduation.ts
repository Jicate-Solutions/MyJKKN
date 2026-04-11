'use client';

/**
 * Startup Studio - Graduation & Exit Hooks
 * Purpose: React Query hooks for graduation criteria, evaluations, exit procedures, and alumni
 * Connected to: startup-studio graduation API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch active graduation criteria
 */
export function useGraduationCriteria(institutionId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.graduation.criteria(institutionId),
    queryFn: () =>
      apiClient.get('/api/startup-studio/graduation/criteria', {
        params: institutionId ? { institution_id: institutionId } : undefined,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Evaluate graduation readiness for a NIF candidate
 */
export function useGraduationReadiness(candidateId: string) {
  return useQuery({
    queryKey: startupStudioKeys.graduation.readiness(candidateId),
    queryFn: () =>
      apiClient.get(`/api/startup-studio/nif/${candidateId}/graduation`),
    enabled: !!candidateId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch exit procedure for a NIF candidate
 */
export function useExitProcedure(candidateId: string) {
  return useQuery({
    queryKey: startupStudioKeys.graduation.exit(candidateId),
    queryFn: () =>
      apiClient.get(`/api/startup-studio/nif/${candidateId}/exit`),
    enabled: !!candidateId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch alumni metrics (optionally by year)
 */
export function useAlumniMetrics(year?: number) {
  return useQuery({
    queryKey: startupStudioKeys.graduation.alumniMetrics(year),
    queryFn: () =>
      apiClient.get('/api/startup-studio/alumni/metrics', {
        params: year ? { year } : undefined,
      }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch alumni directory
 */
export function useAlumniDirectory() {
  return useQuery({
    queryKey: startupStudioKeys.graduation.alumni(),
    queryFn: () => apiClient.get('/api/startup-studio/alumni'),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new graduation criterion
 */
export function useCreateCriteria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/graduation/criteria', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.graduation.all });
    },
  });
}

/**
 * Create a graduation evaluation for a candidate
 */
export function useCreateEvaluation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ candidateId, data }: { candidateId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/nif/${candidateId}/graduation`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.graduation.all });
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.all });
    },
  });
}

/**
 * Initiate an exit procedure for a candidate
 */
export function useInitiateExit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ candidateId, data }: { candidateId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/nif/${candidateId}/exit`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.graduation.all });
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.all });
    },
  });
}

/**
 * Update exit progress (checklist items)
 */
export function useUpdateExitProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ candidateId, data }: { candidateId: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/nif/${candidateId}/exit`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.graduation.all });
    },
  });
}

/**
 * Complete an exit procedure
 */
export function useCompleteExit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ candidateId, data }: { candidateId: string; data?: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/nif/${candidateId}/exit/complete`, data || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.graduation.all });
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.all });
    },
  });
}

/**
 * Track alumni data (upsert)
 */
export function useTrackAlumni() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/alumni/track', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.graduation.all });
    },
  });
}
