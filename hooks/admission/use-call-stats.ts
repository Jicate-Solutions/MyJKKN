// hooks/admission/use-call-stats.ts
// React Query hook for call analytics / statistics

import { useQuery } from '@tanstack/react-query';
import type { CallStats } from '@/lib/services/telephony/telephony-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const callStatsKeys = {
  all: ['call-stats'] as const,
  stats: (institutionId: string, fromDate?: string, toDate?: string) =>
    [...callStatsKeys.all, institutionId, fromDate, toDate] as const,
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

/**
 * Hook to fetch call statistics for an institution.
 */
export function useCallStats(
  institutionId?: string,
  fromDate?: string,
  toDate?: string
) {
  const query = useQuery<CallStats>({
    queryKey: callStatsKeys.stats(institutionId || '', fromDate, toDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('institution_id', institutionId!);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/admission/calls/stats?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to fetch call stats' }));
        throw new Error(err.message || 'Failed to fetch call stats');
      }

      const json = await res.json();
      return json.data;
    },
    enabled: !!institutionId,
    staleTime: 60000, // 1 minute
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
export type { CallStats };
