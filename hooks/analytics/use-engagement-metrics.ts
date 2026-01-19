import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type {
  EngagementMetrics,
  OrganizationalLevel
} from '@/types/analytics';

interface UseEngagementMetricsParams {
  level: OrganizationalLevel;
  id: string;
  dateFrom?: string;
  dateTo?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch engagement metrics for a specific organizational level
 *
 * @example
 * const { data, isLoading, error } = useEngagementMetrics({
 *   level: 'section',
 *   id: 'section-uuid',
 *   dateFrom: '2024-01-01',
 *   dateTo: '2024-01-31'
 * });
 */
export function useEngagementMetrics({
  level,
  id,
  dateFrom,
  dateTo,
  enabled = true
}: UseEngagementMetricsParams): UseQueryResult<EngagementMetrics, Error> {
  return useQuery({
    queryKey: ['engagement-metrics', level, id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({
        level,
        id
      });

      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);

      const response = await fetch(
        `/api/analytics/engagement?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch engagement metrics');
      }

      const result = await response.json();
      return result.data;
    },
    enabled: enabled && !!level && !!id,
    staleTime: 15 * 60 * 1000, // 15 minutes
    refetchInterval: 15 * 60 * 1000 // Refetch every 15 minutes
  });
}
