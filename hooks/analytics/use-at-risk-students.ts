import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { AtRiskStudent, OrganizationalLevel } from '@/types/analytics';

interface UseAtRiskStudentsParams {
  level: OrganizationalLevel;
  id: string;
  enabled?: boolean;
}

interface AtRiskResponse {
  success: boolean;
  count: number;
  data: AtRiskStudent[];
}

/**
 * Hook to fetch at-risk students for early intervention
 *
 * @example
 * const { data, isLoading, error } = useAtRiskStudents({
 *   level: 'section',
 *   id: 'section-uuid'
 * });
 */
export function useAtRiskStudents({
  level,
  id,
  enabled = true
}: UseAtRiskStudentsParams): UseQueryResult<AtRiskStudent[], Error> {
  return useQuery({
    queryKey: ['at-risk-students', level, id],
    queryFn: async () => {
      const params = new URLSearchParams({
        level,
        id
      });

      const response = await fetch(
        `/api/analytics/engagement/at-risk?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch at-risk students');
      }

      const result: AtRiskResponse = await response.json();
      return result.data;
    },
    enabled: enabled && !!level && !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000 // Refetch every 5 minutes (important for interventions)
  });
}
