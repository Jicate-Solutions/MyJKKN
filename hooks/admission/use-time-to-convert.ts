// hooks/admission/use-time-to-convert.ts
// React Query hook for Time-to-Conversion funnel analysis

import { useQuery } from '@tanstack/react-query';
import type { TimeToConvertData, StageTransition } from '@/app/api/admission/analytics/time-to-convert/route';

// ============================================================================
// RE-EXPORT TYPES so consumers don't need to import from the API route
// ============================================================================

export type { TimeToConvertData, StageTransition };

// ============================================================================
// QUERY KEYS
// ============================================================================

export const timeToConvertKeys = {
  all: ['time-to-convert'] as const,
  byInstitution: (institutionId?: string) =>
    [...timeToConvertKeys.all, institutionId ?? 'all'] as const,
};

// ============================================================================
// EMPTY STATE
// ============================================================================

// NOTE: generated_at is omitted from EMPTY_DATA because it would capture
// module-load time (stale). The API response provides the real timestamp.
const EMPTY_DATA: TimeToConvertData = {
  stages: [],
  bottleneck: null,
  generated_at: '',
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format hours as human-readable: "4h 30m", "2d 3h", "12m", etc.
 */
export function formatHours(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins}m`;
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const days = Math.floor(hours / 24);
  const remaining = Math.round(hours % 24);
  return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`;
}

/**
 * Returns color class for a given avg_hours value.
 * green  = < 24h   (fast)
 * yellow = 24–72h  (moderate)
 * red    = > 72h   (slow/bottleneck)
 */
export function getSpeedColor(avgHours: number): 'green' | 'yellow' | 'red' {
  if (avgHours < 24) return 'green';
  if (avgHours <= 72) return 'yellow';
  return 'red';
}

/**
 * Format stage key ("follow_up_scheduled") to title case ("Follow Up Scheduled")
 */
export function formatStageName(stage: string): string {
  return stage
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ============================================================================
// HOOK
// ============================================================================

export function useTimeToConvert(institutionId?: string) {
  const query = useQuery({
    queryKey: timeToConvertKeys.byInstitution(institutionId),
    queryFn: async (): Promise<TimeToConvertData> => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);

      const url = `/api/admission/analytics/time-to-convert${
        params.toString() ? `?${params}` : ''
      }`;

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Failed to fetch time-to-convert data: ${res.status}`);
      }

      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch time-to-convert data');
      return json.data as TimeToConvertData;
    },
    staleTime: 5 * 60_000, // 5 minutes — works without institution_id (returns all institutions)
  });

  return {
    data: query.data ?? EMPTY_DATA,
    stages: query.data?.stages ?? [],
    bottleneck: query.data?.bottleneck ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
