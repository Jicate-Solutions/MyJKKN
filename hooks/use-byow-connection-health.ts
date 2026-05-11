'use client';

// hooks/use-byow-connection-health.ts
//
// Spec 3 H2.1: Client-side React Query hook for the BYOW connection-health
// surface. Powers the global header badge (H2.1), Senior Learner dashboard
// card (H2.2), lead-card inline indicator (H2.3), and reconnect-deadline
// countdown (H3.3).
//
// Refresh cadence: 60s per spec §8c. RLS on the underlying API ensures the
// caller sees only connections their role/dept allows.

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
          };
        }
        throw new Error(`connection-health fetch failed: ${res.status}`);
      }
      return res.json();
    },
    refetchInterval: 60_000, // 60s per spec §8c
    staleTime: 30_000,
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
