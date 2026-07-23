/**
 * Dashboard v2 — Metrics Service (server-side)
 *
 * Calls the consolidated `fn_dashboard_metrics(p_institution_id, p_department_id)`
 * RPC which returns all 4 hero tile values in a single round-trip.
 *
 * Day 2 (2026-04-15): initial implementation.
 * Spec: specs/myjkkn-dashboard-v2-spec.md §7.1
 */

import { createClient } from '@/lib/supabase/server';

export type DashboardScope = {
  institutionId?: string | null;
  departmentId?: string | null;
};

export type OhsBand = 'red' | 'amber' | 'green';

export type DashboardMetrics = {
  ohs: {
    score: number;
    band: OhsBand;
    components: {
      attendance: number;
      sla: number;
      fees: number;
      escalations: number;
    };
  };
  pipeline: {
    value_inr: number;
    lead_count: number;
  };
  attendance: {
    pct_today: number | null;
    pct_baseline: number | null;
    present: number;
    total: number;
  };
  pending_decisions: {
    count: number;
  };
  scope: {
    institution_id: string | null;
    department_id: string | null;
    computed_at: string;
  };
};

const EMPTY_METRICS: DashboardMetrics = {
  ohs: {
    score: 0,
    band: 'red',
    components: { attendance: 0, sla: 0, fees: 0, escalations: 0 }
  },
  pipeline: { value_inr: 0, lead_count: 0 },
  attendance: { pct_today: null, pct_baseline: null, present: 0, total: 0 },
  pending_decisions: { count: 0 },
  scope: {
    institution_id: null,
    department_id: null,
    computed_at: new Date().toISOString()
  }
};

/**
 * Fetches all 4 dashboard hero tile metrics in a single RPC call.
 * Throws on error — caller's <DashboardErrorBoundary> renders a visible error
 * card instead of silently swallowing into a zero-state blank tile.
 *
 * 2026-04-21: Silent-swallow fix. Before: `return EMPTY_METRICS` on both RPC
 * error and unexpected throw → director dashboard rendered blank zeros when
 * auth cookie was stale, with no UI signal. Now: throw → boundary surfaces it.
 */
export async function getDashboardMetrics(
  scope: DashboardScope = {}
): Promise<DashboardMetrics> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('fn_dashboard_metrics', {
    p_institution_id: scope.institutionId ?? null,
    p_department_id: scope.departmentId ?? null
  });

  if (error) {
    // Serialize via getOwnPropertyNames — Supabase v2 wraps fetch failures in
    // FetchError instances whose `.message` is non-enumerable, so the default
    // `console.error('label:', err)` renders as `{}` and hides the real cause.
    // Most common trigger here: stale auth cookie after long dev sessions or
    // session expiry → PostgREST 401 → FetchError with empty enumerable props.
    // (See comment block above re: 2026-04-21 silent-swallow fix.)
    const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
    const looksAuthStale =
      !error.message ||
      /jwt|token|expired|unauthor/i.test(error.message ?? '') ||
      serialized === '{}';
    console.error('[dashboard/metrics] RPC error:', serialized, {
      hint: looksAuthStale
        ? 'Likely stale auth cookie — try a hard refresh / re-login.'
        : 'Check fn_dashboard_metrics body and referenced tables.'
    });
    throw new Error(
      `fn_dashboard_metrics failed: ${error.message ?? serialized}` +
        (looksAuthStale ? ' (likely stale auth cookie — re-login)' : '')
    );
  }

  return (data as DashboardMetrics) ?? EMPTY_METRICS;
}

/**
 * Formats Indian rupees with crore/lakh suffixes for compact display.
 * 15,93,50,000 → "₹15.93 Cr", 450000 → "₹4.5 L", 1200 → "₹1,200"
 */
export function formatInr(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '₹0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_00_00_000)
    return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000)
    return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  return `${sign}₹${abs.toFixed(0)}`;
}

/**
 * Returns the appropriate color band for a 0-100 score.
 * Thresholds read from dashboard_config (default: red<60, amber 60-79, green 80+).
 */
export function scoreBand(score: number): OhsBand {
  if (score < 60) return 'red';
  if (score < 80) return 'amber';
  return 'green';
}

/**
 * Formats attendance percentage with delta vs baseline.
 * 82.5% vs 85% → "82.5% · ↓ 2.5 vs 7d avg"
 */
export function formatAttendanceDelta(
  pctToday: number | null,
  pctBaseline: number | null
): { primary: string; delta: string | null; direction: 'up' | 'down' | 'flat' } {
  if (pctToday === null) return { primary: '—', delta: null, direction: 'flat' };
  const primary = `${pctToday.toFixed(1)}%`;
  if (pctBaseline === null || pctBaseline === 0)
    return { primary, delta: null, direction: 'flat' };
  const diff = pctToday - pctBaseline;
  if (Math.abs(diff) < 0.5)
    return { primary, delta: '≈ baseline', direction: 'flat' };
  const direction = diff > 0 ? 'up' : 'down';
  const arrow = direction === 'up' ? '↑' : '↓';
  return {
    primary,
    delta: `${arrow} ${Math.abs(diff).toFixed(1)} vs 7d avg`,
    direction
  };
}
