// hooks/admission/use-call-stats.ts
// React Query hook for call analytics / statistics

import { useQuery } from '@tanstack/react-query';
import type { CallStats, InboundCallStats, CallDirection } from '@/lib/services/telephony/telephony-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const callStatsKeys = {
  all: ['call-stats'] as const,
  stats: (institutionId: string, fromDate?: string, toDate?: string, direction?: string, admissionOnly?: boolean) =>
    [...callStatsKeys.all, institutionId, fromDate, toDate, direction, admissionOnly] as const,
  inbound: (institutionId: string, fromDate?: string, toDate?: string, admissionOnly?: boolean) =>
    [...callStatsKeys.all, 'inbound', institutionId, fromDate, toDate, admissionOnly] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

const EMPTY_STATS: CallStats = {
  total_calls: 0,
  completed_calls: 0,
  missed_calls: 0,
  failed_calls: 0,
  avg_duration_seconds: 0,
  total_duration_seconds: 0,
  calls_by_disposition: {},
  calls_by_status: {},
  calls_by_counselor: [],
  calls_by_date: [],
  calls_without_notes: 0,
};

const EMPTY_INBOUND_STATS: InboundCallStats = {
  total_incoming: 0,
  answered: 0,
  missed: 0,
  answer_rate: 0,
  missed_without_callback: 0,
  avg_duration_seconds: 0,
  calls_by_date: [],
  calls_by_hour: [],
  top_callers: [],
};

/**
 * Hook to fetch call statistics for an institution.
 * Optionally filter by direction (inbound/outbound).
 */
export function useCallStats(
  institutionId?: string,
  fromDate?: string,
  toDate?: string,
  direction?: CallDirection,
  admissionOnly?: boolean
) {
  const query = useQuery<CallStats>({
    queryKey: callStatsKeys.stats(institutionId || '', fromDate, toDate, direction, admissionOnly),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (direction) params.set('direction', direction);
      if (admissionOnly !== undefined) params.set('admission_only', String(admissionOnly));

      const res = await fetch(`/api/admission/calls/stats?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to fetch call stats' }));
        throw new Error(err.message || 'Failed to fetch call stats');
      }

      const json = await res.json();
      return json.data;
    },
    enabled: true,
    staleTime: 30000,
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    refetchOnWindowFocus: true,
  });

  return {
    stats: query.data || EMPTY_STATS,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch inbound-specific analytics (answer rate, hourly distribution, callback status).
 */
export function useInboundCallStats(
  institutionId?: string,
  fromDate?: string,
  toDate?: string,
  admissionOnly?: boolean
) {
  const query = useQuery<InboundCallStats>({
    queryKey: callStatsKeys.inbound(institutionId || '', fromDate, toDate, admissionOnly),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('direction', 'inbound');
      if (admissionOnly !== undefined) params.set('admission_only', String(admissionOnly));

      const res = await fetch(`/api/admission/calls/stats?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to fetch inbound stats' }));
        throw new Error(err.message || 'Failed to fetch inbound stats');
      }

      const json = await res.json();
      return json.data;
    },
    enabled: true,
    staleTime: 30000,
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    refetchOnWindowFocus: true,
  });

  return {
    stats: query.data || EMPTY_INBOUND_STATS,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Format seconds into human-readable duration (e.g., "2m 30s").
 */
export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

// Re-export types
export type { CallStats, InboundCallStats };
