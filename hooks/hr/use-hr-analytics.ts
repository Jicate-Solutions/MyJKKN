'use client';

/**
 * React Query hook for the HR Analytics dashboard (C1).
 *
 * Simple fetch-on-mount with staleTime — no realtime subscriptions needed
 * for analytics (decision: analytics are point-in-time snapshots).
 */

import { useQuery } from '@tanstack/react-query';
import type { HRAnalyticsPayload, HRAnalyticsFilters } from '@/types/hr-analytics';

const ANALYTICS_KEY = 'hr-analytics';

async function fetchAnalytics(
  filters: HRAnalyticsFilters
): Promise<HRAnalyticsPayload> {
  const params = new URLSearchParams();
  if (filters.institution_id) params.set('institution_id', filters.institution_id);
  if (filters.period) params.set('period', filters.period);

  const qs = params.toString();
  const url = `/api/hr/analytics${qs ? `?${qs}` : ''}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Analytics fetch failed (${res.status})`);
  }
  return res.json();
}

export function useHRAnalytics(filters: HRAnalyticsFilters = {}) {
  return useQuery<HRAnalyticsPayload>({
    queryKey: [ANALYTICS_KEY, filters],
    queryFn: () => fetchAnalytics(filters),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}
