import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { LifecycleDashboardResponse } from '@/types/usage-analytics';

interface UseLifecycleDashboardParams {
  dateFrom: string;
  dateTo: string;
  institutionId?: string;
  departmentId?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch the main lifecycle dashboard data.
 * Polls every 5 minutes (reads from materialized view).
 */
export function useLifecycleDashboard({
  dateFrom,
  dateTo,
  institutionId,
  departmentId,
  enabled = true,
}: UseLifecycleDashboardParams): UseQueryResult<LifecycleDashboardResponse, Error> {
  return useQuery({
    queryKey: ['lifecycle-dashboard', dateFrom, dateTo, institutionId, departmentId],
    queryFn: async () => {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });

      if (institutionId) params.append('institution_id', institutionId);
      if (departmentId) params.append('department_id', departmentId);

      const response = await fetch(
        `/api/analytics/usage/dashboard?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch dashboard data');
      }

      const result = await response.json();
      return result.data;
    },
    enabled: enabled && !!dateFrom && !!dateTo,
    staleTime: 4.5 * 60 * 1000, // 4.5 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
}
