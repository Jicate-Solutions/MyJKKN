/**
 * React Query hooks for TRL (Technology Readiness Level) assessments
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

/**
 * Fetch TRL assessments for a specific NIF candidate
 */
export function useTrlAssessments(candidateId: string) {
  return useQuery({
    queryKey: startupStudioKeys.trl.list(candidateId),
    queryFn: () => apiClient.get(`/api/startup-studio/nif/${candidateId}/trl`),
    enabled: !!candidateId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch TRL distribution across all candidates
 */
export function useTrlDistribution() {
  return useQuery({
    queryKey: startupStudioKeys.trl.distribution(),
    queryFn: () => apiClient.get('/api/startup-studio/trl/distribution'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch candidates with stalled TRL (no advancement in 6+ months)
 */
export function useStalledStartups() {
  return useQuery({
    queryKey: startupStudioKeys.trl.stalled(),
    queryFn: () => apiClient.get('/api/startup-studio/trl/stalled'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Create a new TRL assessment
 */
export function useCreateTrlAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`/api/startup-studio/nif/${data.candidate_id}/trl`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.trl.all });
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.detail(variables.candidate_id) });
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.portfolio.all });
    },
  });
}
