/**
 * React Query hooks for Competitive Matrix management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

/**
 * Fetch competitors for a specific NIF candidate
 */
export function useCompetitors(candidateId: string) {
  return useQuery({
    queryKey: startupStudioKeys.competitive.list(candidateId),
    queryFn: () => apiClient.get(`/api/startup-studio/nif/${candidateId}/competitive`),
    enabled: !!candidateId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Add a new competitor entry
 */
export function useAddCompetitor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post(`/api/startup-studio/nif/${data.candidate_id}/competitive`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.competitive.list(variables.candidate_id) });
    },
  });
}

/**
 * Update an existing competitor entry
 */
export function useUpdateCompetitor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/competitive/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.competitive.all });
    },
  });
}

/**
 * Remove a competitor entry
 */
export function useRemoveCompetitor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/api/startup-studio/competitive/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.competitive.all });
    },
  });
}
