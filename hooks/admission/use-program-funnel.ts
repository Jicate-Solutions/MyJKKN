// hooks/admission/use-program-funnel.ts
// React Query hook for college/program funnel analytics.
// Shows which programs attract inquiries vs convert to enrollment.

import { useQuery } from '@tanstack/react-query';
import type { ProgramFunnelRow, ProgramFunnelResponse } from '@/app/api/admission/analytics/program-funnel/route';

// Re-export types so consumers don't need to import from the API route directly
export type { ProgramFunnelRow, ProgramFunnelResponse };

// ── Query keys ────────────────────────────────────────────────────────────────

export const programFunnelKeys = {
  all: ['program-funnel'] as const,
  funnel: (institutionId?: string) =>
    [...programFunnelKeys.all, institutionId] as const,
};

// ── Empty state ───────────────────────────────────────────────────────────────

const EMPTY_FUNNEL: ProgramFunnelResponse = {
  programs: [],
  group_by: 'program',
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProgramFunnel(institutionId?: string) {
  const query = useQuery({
    queryKey: programFunnelKeys.funnel(institutionId),
    queryFn: async (): Promise<ProgramFunnelResponse> => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);

      const url = `/api/admission/analytics/program-funnel${
        params.toString() ? `?${params}` : ''
      }`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch program funnel: ${res.status}`);
      }
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || 'Failed to fetch program funnel');
      }
      return json.data as ProgramFunnelResponse;
    },
    staleTime: 5 * 60_000, // 5 minutes — analytics data changes infrequently
  });

  return {
    funnel: query.data ?? EMPTY_FUNNEL,
    programs: query.data?.programs ?? [],
    groupBy: query.data?.group_by ?? 'program',
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
