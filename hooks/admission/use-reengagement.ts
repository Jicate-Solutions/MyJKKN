// hooks/admission/use-reengagement.ts
// React Query hook for re-engagement funnel analytics

import { useQuery } from '@tanstack/react-query';

// ============================================================================
// TYPES
// ============================================================================

export interface ReengagementStageBreakdown {
  stage: string;
  count: number;
}

export interface ReengagementData {
  dormant_count: number;
  lost_count: number;
  reengaged_count: number;
  avg_dormant_days: number;
  by_last_stage: ReengagementStageBreakdown[];
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const reengagementAnalyticsKeys = {
  all: ['reengagement-analytics'] as const,
  metrics: (institutionId?: string) =>
    [...reengagementAnalyticsKeys.all, institutionId] as const,
};

// ============================================================================
// EMPTY STATE
// ============================================================================

const EMPTY_DATA: ReengagementData = {
  dormant_count: 0,
  lost_count: 0,
  reengaged_count: 0,
  avg_dormant_days: 0,
  by_last_stage: [],
};

// ============================================================================
// HOOK
// ============================================================================

export function useReengagement(institutionId?: string) {
  const query = useQuery({
    queryKey: reengagementAnalyticsKeys.metrics(institutionId),
    queryFn: async (): Promise<ReengagementData> => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);

      const url = `/api/admission/analytics/reengagement${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch re-engagement metrics: ${res.status}`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.message || 'Failed to fetch re-engagement metrics');
      return json as ReengagementData;
    },
    staleTime: 60_000, // 60 seconds
  });

  return {
    data: query.data ?? EMPTY_DATA,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
