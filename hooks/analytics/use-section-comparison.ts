import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { SectionComparison } from '@/types/analytics';

interface UseSectionComparisonParams {
  semesterId: string;
  enabled?: boolean;
}

interface SectionComparisonResponse {
  success: boolean;
  count: number;
  data: SectionComparison[];
}

/**
 * Hook to fetch and compare engagement metrics across sections in a semester
 *
 * @example
 * const { data, isLoading, error } = useSectionComparison({
 *   semesterId: 'semester-uuid'
 * });
 */
export function useSectionComparison({
  semesterId,
  enabled = true
}: UseSectionComparisonParams): UseQueryResult<SectionComparison[], Error> {
  return useQuery({
    queryKey: ['section-comparison', semesterId],
    queryFn: async () => {
      const params = new URLSearchParams({
        semester_id: semesterId
      });

      const response = await fetch(
        `/api/analytics/engagement/sections/compare?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || 'Failed to fetch section comparison data'
        );
      }

      const result: SectionComparisonResponse = await response.json();
      return result.data;
    },
    enabled: enabled && !!semesterId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    refetchInterval: 15 * 60 * 1000 // Refetch every 15 minutes
  });
}
