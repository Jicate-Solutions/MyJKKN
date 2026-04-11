/**
 * React Query hooks for Risk Assessments (4M Framework)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

/**
 * Fetch risk assessments for a specific NIF candidate
 */
export function useRiskAssessments(candidateId: string) {
  return useQuery({
    queryKey: startupStudioKeys.risk.list(candidateId),
    queryFn: () => apiClient.get(`/api/startup-studio/nif/${candidateId}/risk`),
    enabled: !!candidateId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch risk heatmap: all candidates with their latest risk scores
 */
export function useRiskHeatmap() {
  return useQuery({
    queryKey: startupStudioKeys.risk.heatmap(),
    queryFn: () => apiClient.get('/api/startup-studio/risk/heatmap'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch high-risk startups (any dimension below threshold)
 */
export function useHighRiskStartups(threshold?: number) {
  return useQuery({
    queryKey: startupStudioKeys.risk.highRisk(threshold),
    queryFn: () => apiClient.get('/api/startup-studio/risk/high-risk', { params: threshold ? { threshold } : undefined }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Create a new risk assessment
 */
export function useCreateRiskAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`/api/startup-studio/nif/${data.candidate_id}/risk`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.risk.all });
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.nif.detail(variables.candidate_id) });
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.portfolio.all });
    },
  });
}
