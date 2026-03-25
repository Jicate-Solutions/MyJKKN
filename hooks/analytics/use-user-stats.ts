import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { UserStatsResponse } from '@/types/usage-analytics';

interface UseUserStatsParams {
  dateFrom: string;
  dateTo: string;
  institutionId?: string;
  departmentId?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch user statistics (login analytics).
 * Lazy-loaded: only fires when enabled=true (User Stats tab active).
 */
export function useUserStats({
  dateFrom,
  dateTo,
  institutionId,
  departmentId,
  enabled = true,
}: UseUserStatsParams): UseQueryResult<UserStatsResponse, Error> {
  return useQuery({
    queryKey: ['user-stats', dateFrom, dateTo, institutionId, departmentId],
    queryFn: async () => {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });

      if (institutionId) params.append('institution_id', institutionId);
      if (departmentId) params.append('department_id', departmentId);

      const response = await fetch(
        `/api/analytics/usage/user-stats?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch user stats');
      }

      const result = await response.json();
      return result.data;
    },
    enabled: enabled && !!dateFrom && !!dateTo,
    staleTime: 4.5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
