import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { ModuleBreakdown } from '@/types/usage-analytics';

interface UseModuleBreakdownParams {
  dateFrom: string;
  dateTo: string;
  institutionId?: string;
  module?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch module breakdown data.
 * Can drill down into a specific module by passing the module param.
 */
export function useModuleBreakdown({
  dateFrom,
  dateTo,
  institutionId,
  module,
  enabled = true,
}: UseModuleBreakdownParams): UseQueryResult<ModuleBreakdown[], Error> {
  return useQuery({
    queryKey: ['lifecycle-modules', dateFrom, dateTo, institutionId, module],
    queryFn: async () => {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });

      if (institutionId) params.append('institution_id', institutionId);
      if (module) params.append('module', module);

      const response = await fetch(
        `/api/analytics/usage/modules?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch module data');
      }

      const result = await response.json();
      return result.data;
    },
    enabled: enabled && !!dateFrom && !!dateTo,
    staleTime: 4.5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
