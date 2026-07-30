// hooks/accreditation/use-cac-metrics.ts
// ============================================================================
// The measured half of the Cluster Academic Council page.
//
// One call to fn_cac_measured_metrics() returns every institution × metric pair
// that has real substrate — a minority of the CEO's forty-eight. The rest are
// absent from the response ON PURPOSE: the catalog already records why each one
// has no number, and inventing empty rows here would let the screen show a zero
// it cannot defend.
//
// The function takes no arguments. That is not an oversight to be "improved"
// later by passing an institution id — it is the security property. Every leak
// closed at JKKN this month came from a SECURITY DEFINER function that accepted
// a caller-supplied id and trusted it.
//
// Read-only. There is nothing to mutate here: the numbers are derived from other
// modules' records, and the way to change one is to use that module.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/** One institution's value for one metric, as the function returns it. */
export interface CacMeasuredRow {
  institution_id: string;
  metric_key: string;
  value_numeric: number | null;
  value_label: string | null;
  detail: Record<string, unknown> | null;
}

/** institution_id -> metric_key -> row. The shape the grid reads. */
export type CacMetricIndex = Record<string, Record<string, CacMeasuredRow>>;

export const cacMetricKeys = {
  all: ['accreditation', 'cac-metrics'] as const,
  measured: () => [...cacMetricKeys.all, 'measured'] as const,
};

/**
 * Index the flat rows by institution and metric.
 *
 * Exported and pure so the shaping is testable without a database — the page
 * itself cannot be imported under vitest (module-scope Supabase client).
 */
export function indexMeasuredRows(rows: CacMeasuredRow[]): CacMetricIndex {
  return rows.reduce<CacMetricIndex>((acc, row) => {
    if (!row.institution_id || !row.metric_key) return acc;
    acc[row.institution_id] ??= {};
    // Last write wins. The function returns one row per pair, so a duplicate
    // would mean a grouping bug there — worth not hiding behind a silent merge.
    acc[row.institution_id][row.metric_key] = row;
    return acc;
  }, {});
}

/**
 * Which metrics came back with a value for at least one institution.
 *
 * The page prints this rather than a hardcoded "N of 48": if a nightly job
 * fails and a metric stops returning, the header should fall by itself instead
 * of continuing to claim a number the grid no longer shows.
 *
 * The same reasoning is why no comment in this module states how many metrics
 * are wired. That count changed once already — parent engagement was dropped on
 * 2026-07-30 once it turned out to be measuring provisioned accounts rather than
 * engagement — and every comment naming it went stale in the same commit while
 * the runtime stayed correct, because the runtime derives it and prose cannot.
 */
export function metricsWithData(rows: CacMeasuredRow[]): Set<string> {
  return new Set(
    rows
      .filter((r) => r.value_numeric !== null || Boolean(r.value_label))
      .map((r) => r.metric_key),
  );
}

export function useCacMeasuredMetrics() {
  return useQuery({
    queryKey: cacMetricKeys.measured(),
    queryFn: async (): Promise<CacMeasuredRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_cac_measured_metrics');
      if (error) throw error;
      return (data ?? []) as CacMeasuredRow[];
    },
    // The underlying records change on other modules' timelines, not this
    // page's. Five minutes keeps the attendance window aggregation off the
    // critical path of every navigation back to the page.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
