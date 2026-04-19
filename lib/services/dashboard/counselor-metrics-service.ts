/**
 * Dashboard v2 Week-2 — Counselor Metrics Service (server-side)
 *
 * Calls `fn_counselor_metrics()` RPC which reads auth.uid() and returns
 * counselor-scoped hero tile data (SLA today, daily rank, hot leads, calls).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 */

import { createClient } from '@/lib/supabase/server';

export type CounselorBand = 'red' | 'amber' | 'green';

/**
 * Doctrines v1 — Conversion Velocity Score (CVS)
 * Components (weights):
 *   - sla_compliance    30%
 *   - daily_rank        20% (inverted: 1st = 100)
 *   - calls_vs_target   25%
 *   - conversion        25% (30d enrolled / assigned)
 */
export type CvsComponents = {
  sla_compliance: number | null;
  daily_rank: number | null;
  calls_vs_target: number | null;
  conversion: number | null;
};

export type ConversionVelocityScore = {
  score: number;
  band: CounselorBand;
  components: CvsComponents;
  present_components?: string[];
  missing_components?: string[];
  effective_weights?: Record<string, number>;
  window?: 'trailing_30_days';
  data_source?: string;
};

export type CounselorMetrics = {
  sla: {
    median_minutes_today: number | null;
    compliance_pct: number;
    band: CounselorBand;
  };
  rank: {
    daily_rank: number | null;
    daily_total: number;
    weekly_delta: number;
  };
  hot_leads: {
    to_call_count: number;
    cold_count: number;
  };
  calls: {
    made_today: number;
    daily_target: number;
    pct: number;
  };
  conversion_velocity_score?: ConversionVelocityScore;
  scope: {
    user_id: string | null;
    computed_at: string;
  };
};

const EMPTY_COUNSELOR_METRICS: CounselorMetrics = {
  sla: { median_minutes_today: null, compliance_pct: 0, band: 'red' },
  rank: { daily_rank: null, daily_total: 0, weekly_delta: 0 },
  hot_leads: { to_call_count: 0, cold_count: 0 },
  calls: { made_today: 0, daily_target: 25, pct: 0 },
  conversion_velocity_score: {
    score: 0,
    band: 'red',
    components: { sla_compliance: null, daily_rank: null, calls_vs_target: null, conversion: null },
    data_source: 'empty'
  },
  scope: { user_id: null, computed_at: new Date().toISOString() }
};

/**
 * Fetches all 4 counselor hero tile metrics in a single RPC call.
 * Returns EMPTY_COUNSELOR_METRICS on error (resilient to DB hiccups).
 */
export async function getCounselorMetrics(): Promise<CounselorMetrics> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_counselor_metrics');

    if (error) {
      console.error('[dashboard/counselor-metrics] RPC error:', error);
      return EMPTY_COUNSELOR_METRICS;
    }

    return (data as CounselorMetrics) ?? EMPTY_COUNSELOR_METRICS;
  } catch (err) {
    console.error('[dashboard/counselor-metrics] unexpected error:', err);
    return EMPTY_COUNSELOR_METRICS;
  }
}
