'use client';

// hooks/use-byow-connection-health.ts
//
// Spec 3 H2.1: Client-side React Query hook for the BYOW connection-health
// surface. Powers the global header badge (H2.1), Senior Learner dashboard
// card (H2.2), lead-card inline indicator (H2.3), and reconnect-deadline
// countdown (H3.3).
//
// Refresh cadence (perf-tuned 2026-07-31, supersedes spec §8c's 60s):
// the underlying wa_byow_connection_health rows are only written by the
// connection-pulse cron every 5 minutes (vercel.json: */5 * * * *), so
// client polls faster than 5 min return identical data. This hook is
// mounted in the global Navbar for EVERY authenticated session, and the
// 60s cadence produced ~23.5k DB calls/day (211,726 calls / 22.5h of DB
// exec time in 9 days) — the platform's single chattiest statement.
// New cadence:
//   - in-scope users (summary.total > 0): 5 min, matching the pulse cron
//   - zero-scope users (RLS-empty — the vast majority of sessions, badge
//     renders null): 30 min, kept non-zero so a newly-granted connection
//     is still discovered without a page reload
//   - auth-not-yet-resolved (401 fallback): 60s, so a login race never
//     hides the badge from a real admin for half an hour
//   - hidden tabs never poll (refetchIntervalInBackground: false)
// RLS on the underlying API ensures the caller sees only connections
// their role/dept allows.

import { useQuery } from '@tanstack/react-query';

export interface ByowConnection {
  id: string;
  department_id: string;
  department_name: string | null;
  status: 'ready' | 'stale' | 'disconnected';
  phone_number: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  hours_since_last_inbound: number | null;
  hours_remaining_before_force_disconnect: number | null;
}

export interface ByowConnectionSummary {
  ready: number;
  stale: number;
  disconnected: number;
  total: number;
}

export interface ByowConnectionHealthResponse {
  connections: ByowConnection[];
  summary: ByowConnectionSummary;
  thresholds: {
    stale_after_hours: number;
    force_disconnect_after_hours: number;
  };
  /** Client-only marker: set when the API returned 401 (auth not yet
   *  resolved). Distinguishes "empty because auth race" (retry in 60s)
   *  from "empty because RLS scope is genuinely empty" (back off 30 min). */
  auth_pending?: boolean;
}

export function useByowConnectionHealth() {
  return useQuery<ByowConnectionHealthResponse>({
    queryKey: ['byow', 'connection-health'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp-personal/connection-health', {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 401) {
          // Auth-not-yet-resolved → empty surface, not an error.
          return {
            connections: [],
            summary: { ready: 0, stale: 0, disconnected: 0, total: 0 },
            thresholds: { stale_after_hours: 24, force_disconnect_after_hours: 72 },
            auth_pending: true,
          };
        }
        throw new Error(`connection-health fetch failed: ${res.status}`);
      }
      return res.json();
    },
    // Scope-aware cadence — see header comment for the arithmetic.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.auth_pending) return 60_000; // auth race → retry soon
      const total = data?.summary.total ?? 0;
      return total === 0 ? 30 * 60_000 : 5 * 60_000;
    },
    refetchIntervalInBackground: false, // hidden tabs never poll
    staleTime: 5 * 60_000, // remounts within the pulse window reuse cache
    refetchOnWindowFocus: false, // avoid thundering herd on tab focus
  });
}

/**
 * Derive a single overall pill color from the per-connection summary.
 * - 'green' = all ready (or no connections in scope at all)
 * - 'yellow' = at least one stale, none disconnected
 * - 'red' = at least one disconnected
 */
export function deriveOverallPillColor(
  summary: ByowConnectionSummary
): 'green' | 'yellow' | 'red' | 'gray' {
  if (summary.total === 0) return 'gray';
  if (summary.disconnected > 0) return 'red';
  if (summary.stale > 0) return 'yellow';
  return 'green';
}
