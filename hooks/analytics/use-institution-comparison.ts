import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { InstitutionComparison } from '@/types/usage-analytics';

interface UseInstitutionComparisonParams {
  days?: number;
  enabled?: boolean;
}

/**
 * Hook to fetch cross-institution comparison data (super admin only).
 */
export function useInstitutionComparison({
  days = 30,
  enabled = true,
}: UseInstitutionComparisonParams = {}): UseQueryResult<InstitutionComparison[], Error> {
  return useQuery({
    queryKey: ['institution-comparison', days],
    queryFn: async () => {
      const params = new URLSearchParams({ days: days.toString() });

      const response = await fetch(
        `/api/analytics/usage/comparison?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch comparison data');
      }

      const result = await response.json();
      return result.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
