// hooks/admission/use-call-funnel.ts
// React Query hook for call-to-enrollment funnel data

import { useQuery } from '@tanstack/react-query';

// ============================================================================
// TYPES
// ============================================================================

export interface FunnelStage {
  name: string;
  key: string;
  count: number;
  rate: number | null;
}

export interface CallFunnelData {
  stages: FunnelStage[];
  total_calls: number;
  overall_conversion_rate: number;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const callFunnelKeys = {
  all: ['call-funnel'] as const,
  funnel: (institutionId?: string, fromDate?: string, toDate?: string) =>
    [...callFunnelKeys.all, institutionId, fromDate, toDate] as const,
};

// ============================================================================
// EMPTY STATE
// ============================================================================

const EMPTY_FUNNEL: CallFunnelData = {
  stages: [
    { name: 'Total Calls', key: 'total_calls', count: 0, rate: null },
    { name: 'Answered', key: 'answered', count: 0, rate: 0 },
    { name: 'Leads Created', key: 'leads_created', count: 0, rate: 0 },
    { name: 'Applications', key: 'applications', count: 0, rate: 0 },
    { name: 'Enrolled', key: 'enrolled', count: 0, rate: 0 },
  ],
  total_calls: 0,
  overall_conversion_rate: 0,
};

// ============================================================================
// HOOK
// ============================================================================

export function useCallFunnel(
  institutionId?: string,
  fromDate?: string,
  toDate?: string,
) {
  const query = useQuery({
    queryKey: callFunnelKeys.funnel(institutionId, fromDate, toDate),
    queryFn: async (): Promise<CallFunnelData> => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);

      const url = `/api/admission/calls/funnel${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch funnel data: ${res.status}`);
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch funnel data');
      return json.data;
    },
    staleTime: 60_000, // 60 seconds
  });

  return {
    funnel: query.data ?? EMPTY_FUNNEL,
    isLoading: query.isLoading,
    error: query.error,
  };
}
