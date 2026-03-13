import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

const matlabKeys = {
  all: ['matlab'] as const,
  stats: () => [...matlabKeys.all, 'stats'] as const,
  snapshots: () => [...matlabKeys.all, 'snapshots'] as const,
};

export function useMatlabStats() {
  return useQuery({
    queryKey: matlabKeys.stats(),
    queryFn: () => apiClient.get('/api/solutions/matlab/stats'),
    staleTime: 15_000,
  });
}

export function useMatlabSnapshots() {
  return useQuery({
    queryKey: matlabKeys.snapshots(),
    queryFn: () => apiClient.get('/api/solutions/matlab/snapshots'),
    staleTime: 15_000,
  });
}
