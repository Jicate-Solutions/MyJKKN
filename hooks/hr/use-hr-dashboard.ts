'use client';

/**
 * React Query hook for the HR Command Center dashboard.
 *
 * - Manual refresh is the primary pattern (decision #9) — a refresh button
 *   shows `generated_at` and the user taps when they want fresh data.
 * - Realtime subscriptions (decision #21) invalidate specific quadrants when
 *   rows change in the 4 published tables, so a leave application submitted
 *   in another tab refreshes this dashboard without a manual click.
 */

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient as createBrowserClient } from '@supabase/supabase-js';
import type {
  HRDashboardPayload,
  DashboardMode,
  DashboardAccessLogEntry,
  RecentActivitiesPayload,
  EmployeeDistributionPayload,
} from '@/types/hr-dashboard';
import { REALTIME_INVALIDATION_MAP } from '@/types/hr-dashboard';

const DASHBOARD_BASE = '/api/hr/dashboard';
const DASHBOARD_KEY = 'hr-dashboard';

// Lazy singleton so we don't spawn a new ws on every hook call
let browserClient: ReturnType<typeof createBrowserClient> | null = null;
function getBrowserClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return browserClient;
}

export function useHRDashboard(mode: DashboardMode = 'institution-grid') {
  const queryClient = useQueryClient();

  const query = useQuery<HRDashboardPayload>({
    queryKey: [DASHBOARD_KEY, mode],
    queryFn: async () => {
      const params = new URLSearchParams({ mode });
      const res = await fetch(`${DASHBOARD_BASE}?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Dashboard fetch failed: ${res.status}`);
      }
      return (await res.json()) as HRDashboardPayload;
    },
    staleTime: 60_000, // 1 min — realtime subs invalidate on real change anyway
    retry: 1,          // auto-retry once after 2s (decision #25) — React Query default backoff
    retryDelay: 2000,
  });

  // --- Realtime subscriptions (decision #21) ---
  const channelRef = useRef<ReturnType<ReturnType<typeof getBrowserClient>['channel']> | null>(null);
  useEffect(() => {
    const sb = getBrowserClient();
    const channel = sb.channel('hr-dashboard-realtime');

    // Subscribe to all 4 tables from REALTIME_INVALIDATION_MAP
    for (const table of Object.keys(REALTIME_INVALIDATION_MAP)) {
      channel.on(
        // @ts-expect-error — the Supabase type for postgres_changes is over-narrow
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          // Any change anywhere in these tables → refetch the whole payload.
          // We could use the quadrant-level invalidation map for finer-grained
          // refetch, but the payload is a single query — refetching it is simpler
          // and still fast (<200ms per decision #2).
          queryClient.invalidateQueries({ queryKey: [DASHBOARD_KEY, mode] });
        }
      );
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      try {
        channel.unsubscribe();
      } catch {
        /* no-op */
      }
      channelRef.current = null;
    };
  }, [queryClient, mode]);

  return query;
}

// =====================================================================================
// Access log helper — called once per dashboard view by the /hr page
// =====================================================================================

/**
 * POST a batch of audit rows. Fire-and-forget: we don't block the UI on this,
 * and we don't surface errors to the user (compliance is best-effort).
 *
 * Derives the list of entries from the payload quadrants (or institution cards).
 */
export async function logDashboardAccess(payload: HRDashboardPayload): Promise<void> {
  const entries: DashboardAccessLogEntry[] = [];

  for (const q of payload.quadrants) {
    for (const k of q.kpis) {
      entries.push({
        quadrant: q.id,
        kpi_name: k.name,
        scope: payload.scope,
        hr_organization_id: payload.hr_organization_id,
        institution_id: payload.institution_id,
      });
    }
  }

  for (const card of payload.institution_cards) {
    // One row per institution card (scope='institution').
    entries.push({
      quadrant: 'institution_grid',
      kpi_name: 'institution_card',
      scope: 'institution',
      hr_organization_id: card.hr_organization_id,
      institution_id: card.institution_id,
    });
  }

  if (entries.length === 0) return;

  try {
    await fetch(`${DASHBOARD_BASE}/access-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
  } catch {
    /* best-effort; swallow */
  }
}

// =====================================================================================
// T3.3 — Recent Activities feed hook
// =====================================================================================

const ACTIVITIES_KEY = 'hr-dashboard-activities';

export function useRecentActivities(opts?: { hoursBack?: number; limit?: number }) {
  const hoursBack = opts?.hoursBack ?? 24;
  const limit = opts?.limit ?? 20;

  return useQuery<RecentActivitiesPayload>({
    queryKey: [ACTIVITIES_KEY, hoursBack, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        hours_back: String(hoursBack),
        limit: String(limit),
      });
      const res = await fetch(`${DASHBOARD_BASE}/activities?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Activities fetch failed: ${res.status}`);
      }
      return (await res.json()) as RecentActivitiesPayload;
    },
    staleTime: 60_000,
    retry: 1,
    retryDelay: 2000,
  });
}

// =====================================================================================
// T3.5 — Employee distribution donut hook
// =====================================================================================

const DISTRIBUTION_KEY = 'hr-dashboard-employee-distribution';

export function useEmployeeDistribution() {
  return useQuery<EmployeeDistributionPayload>({
    queryKey: [DISTRIBUTION_KEY],
    queryFn: async () => {
      const res = await fetch(`${DASHBOARD_BASE}/employee-distribution`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Distribution fetch failed: ${res.status}`);
      }
      return (await res.json()) as EmployeeDistributionPayload;
    },
    staleTime: 5 * 60_000, // 5 min — staff churn is slow
    retry: 1,
    retryDelay: 2000,
  });
}
