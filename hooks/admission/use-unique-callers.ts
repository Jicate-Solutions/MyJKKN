// hooks/admission/use-unique-callers.ts
// React Query hook for unique callers grouped view

import { useQuery } from '@tanstack/react-query';

// ============================================================================
// TYPES
// ============================================================================

export interface UniqueCaller {
  from_number: string;
  lead_id: string | null;
  lead_name: string | null;
  caller_location: string | null;
  total_attempts: number;
  missed_count: number;
  answered_count: number;
  first_call_at: string;
  last_call_at: string;
  days_trying: number;
  auto_sms_sent: boolean;
  callback_status: string | null;
  callback_priority: string | null;
  sla_breached: boolean;
  current_lead_priority: string | null;
}

export interface UniqueCallersSummary {
  unique_callers: number;
  total_calls: number;
  avg_attempts_per_caller: number;
  callers_never_reached: number;
  callers_with_breached_sla: number;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const uniqueCallersKeys = {
  all: ['unique-callers'] as const,
  list: (institutionId?: string, fromDate?: string, toDate?: string) =>
    [...uniqueCallersKeys.all, institutionId, fromDate, toDate] as const,
};

// ============================================================================
// HOOK
// ============================================================================

export function useUniqueCallers(
  institutionId?: string,
  fromDate?: string,
  toDate?: string
) {
  const query = useQuery<{ callers: UniqueCaller[]; summary: UniqueCallersSummary }>({
    queryKey: uniqueCallersKeys.list(institutionId, fromDate, toDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);

      const res = await fetch(`/api/admission/calls/unique-callers?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to fetch unique callers' }));
        throw new Error(err.message || 'Failed to fetch unique callers');
      }

      const json = await res.json();
      return json.data;
    },
    enabled: true,
    staleTime: 60000,
  });

  const emptySummary: UniqueCallersSummary = {
    unique_callers: 0,
    total_calls: 0,
    avg_attempts_per_caller: 0,
    callers_never_reached: 0,
    callers_with_breached_sla: 0,
  };

  return {
    callers: query.data?.callers || [],
    summary: query.data?.summary || emptySummary,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
