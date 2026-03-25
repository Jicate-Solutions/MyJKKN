import { useQuery, UseQueryResult } from '@tanstack/react-query';

interface HierarchyData {
  id: string;
  name: string;
  total_students: number;
  high_engagement: number;
  medium_engagement: number;
  low_engagement: number;
  at_risk: number;
  active_percentage: number;
}

interface UseHierarchyDataParams {
  level: 'all' | 'institution' | 'department' | 'program' | 'semester' | 'section';
  parentId?: string;
  enabled?: boolean;
}

interface HierarchyResponse {
  success: boolean;
  level: string;
  parent_id?: string;
  data: HierarchyData[];
}

/**
 * Hook to fetch hierarchical engagement breakdown data
 *
 * @example
 * const { data, isLoading } = useHierarchyData({
 *   level: 'department',
 *   parentId: 'institution-uuid'
 * });
 */
export function useHierarchyData({
  level,
  parentId,
  enabled = true
}: UseHierarchyDataParams): UseQueryResult<HierarchyData[], Error> {
  return useQuery({
    queryKey: ['hierarchy-data', level, parentId],
    queryFn: async () => {
      const params = new URLSearchParams({
        level
      });

      if (parentId) {
        params.append('parent_id', parentId);
      }

      const response = await fetch(
        `/api/analytics/engagement/hierarchy?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch hierarchy data');
      }

      const result: HierarchyResponse = await response.json();
      return result.data;
    },
    enabled: enabled && !!level,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 10 * 60 * 1000 // Refetch every 10 minutes
  });
}
