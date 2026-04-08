// hooks/admission/use-counselor-funnel.ts
// React Query hook for the per-counselor conversion funnel

import { useQuery } from '@tanstack/react-query';

// ============================================================================
// TYPES
// ============================================================================

export interface CounselorFunnelRow {
  counselor_id: string;
  name: string;
  assigned: number;
  contacted: number;
  qualified: number;
  applied: number;
  enrolled: number;
  conversion_rate: number; // enrolled / assigned × 100, 1dp
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const counselorFunnelKeys = {
  all: ['counselor-funnel'] as const,
  funnel: (institutionId?: string) =>
    [...counselorFunnelKeys.all, institutionId] as const,
};

// ============================================================================
// HOOK
// ============================================================================

export function useCounselorFunnel(institutionId?: string) {
  const query = useQuery({
    queryKey: counselorFunnelKeys.funnel(institutionId),
    queryFn: async (): Promise<CounselorFunnelRow[]> => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);

      const url = `/api/admission/analytics/counselor-funnel${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Failed to fetch counselor funnel: ${res.status}`);
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch counselor funnel');
      // API returns { counselors: [...] }
      return (json.counselors ?? []) as CounselorFunnelRow[];
    },
    staleTime: 60_000, // 60 seconds
  });

  return {
    counselors: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
