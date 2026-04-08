// hooks/admission/use-dropoff-analysis.ts
// React Query hook for the Drop-off Analysis funnel.

import { useQuery } from '@tanstack/react-query';
import type { DropoffAnalyticsResponse, DropoffStage } from '@/app/api/admission/analytics/dropoff/route';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const dropoffAnalysisKeys = {
  all: ['dropoff-analysis'] as const,
  funnel: (institutionId?: string) =>
    [...dropoffAnalysisKeys.all, institutionId ?? 'all'] as const,
};

// ============================================================================
// EMPTY STATE
// ============================================================================

const EMPTY_DATA: DropoffAnalyticsResponse = {
  stages: [],
  total_active: 0,
  biggest_bottleneck_stage: null,
};

// ============================================================================
// HOOK
// ============================================================================

/**
 * Fetches drop-off funnel data for the given institution.
 * When institutionId is undefined, returns aggregate across all institutions.
 */
export function useDropoffAnalysis(institutionId?: string) {
  const query = useQuery({
    queryKey: dropoffAnalysisKeys.funnel(institutionId),
    queryFn: async (): Promise<DropoffAnalyticsResponse> => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);

      const url = `/api/admission/analytics/dropoff${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? `Failed to fetch drop-off data: ${res.status}`);
      }

      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'Failed to fetch drop-off data');
      return json.data as DropoffAnalyticsResponse;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: true,
  });

  return {
    data: query.data ?? EMPTY_DATA,
    stages: query.data?.stages ?? [],
    totalActive: query.data?.total_active ?? 0,
    biggestBottleneckStage: query.data?.biggest_bottleneck_stage ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// Re-export the type for consumers that don't want to import from the route file.
export type { DropoffStage, DropoffAnalyticsResponse };
