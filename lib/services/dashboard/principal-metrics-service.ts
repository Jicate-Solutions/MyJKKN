/**
 * Dashboard v2 — Principal Metrics Service (server-side)
 *
 * Calls `fn_principal_metrics()` RPC which reads auth.uid() and returns
 * principal-scoped hero tile data:
 *   1) Institution Health Score (OHS from fn_dashboard_metrics)
 *   2) Staff attendance today (not_available until HR module ships)
 *   3) Today's incidents count (hostel_incidents)
 *   4) Pending approvals on my desk (user_notifications)
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 */

import { createClient } from '@/lib/supabase/server';

export type PrincipalBand = 'red' | 'amber' | 'green';

export type PrincipalMetrics = {
  health_score: {
    score: number;
    band: PrincipalBand;
    components: {
      attendance?: number;
      sla?: number;
      fees?: number;
      escalations?: number;
    };
    data_source?: string;
  };
  staff_attendance: {
    present: number;
    total: number;
    pct: number;
    data_source?: string;
  };
  incidents: {
    today_count: number;
    open_count: number;
    data_source?: string;
  };
  pending_approvals: {
    count: number;
    data_source?: string;
  };
  scope: {
    user_id: string | null;
    institution_id: string | null;
    computed_at: string;
  };
};

const EMPTY_PRINCIPAL_METRICS: PrincipalMetrics = {
  health_score: { score: 0, band: 'red', components: {} },
  staff_attendance: { present: 0, total: 0, pct: 0, data_source: 'not_available' },
  incidents: { today_count: 0, open_count: 0 },
  pending_approvals: { count: 0 },
  scope: { user_id: null, institution_id: null, computed_at: new Date().toISOString() }
};

/**
 * Fetches all 4 principal hero tile metrics in a single RPC call.
 * Returns EMPTY_PRINCIPAL_METRICS on error (resilient to DB hiccups).
 */
export async function getPrincipalMetrics(): Promise<PrincipalMetrics> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_principal_metrics');

    if (error) {
      console.error('[dashboard/principal-metrics] RPC error:', error);
      return EMPTY_PRINCIPAL_METRICS;
    }

    return (data as PrincipalMetrics) ?? EMPTY_PRINCIPAL_METRICS;
  } catch (err) {
    console.error('[dashboard/principal-metrics] unexpected error:', err);
    return EMPTY_PRINCIPAL_METRICS;
  }
}
