'use client';

/**
 * Startup Studio - Team Hooks
 * Purpose: React Query hooks for team management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

export function useSSTeams(filters?: Record<string, any>) {
  return useQuery({
    queryKey: ['startup-studio', 'teams', filters],
    queryFn: () => apiClient.get('/api/startup-studio/teams', { params: filters }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useSSTeam(id: string) {
  return useQuery({
    queryKey: ['startup-studio', 'teams', id],
    queryFn: () => apiClient.get(`/api/startup-studio/teams/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/teams', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'teams'] });
    },
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/teams/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'teams'] });
    },
  });
}
