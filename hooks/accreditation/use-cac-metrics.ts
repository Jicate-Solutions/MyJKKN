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
  attendanceRollup: () =>
    [...cacMetricKeys.all, 'attendance-rollup-freshness'] as const,
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

/**
 * How much of the measured read can be believed at all.
 *
 * `values`           — the read worked and something came back with a number.
 * `read-failed`      — the request errored. Nothing is known about any value.
 * `nothing-returned` — the request succeeded and carried no value for any metric
 *                      of any institution.
 *
 * The third state exists because it is neither of the other two and must not be
 * folded into either. It is not a failure — the request came back 200 — so
 * saying "could not be read" would misdescribe what happened. It is also not a
 * finding: every wired metric emptying at the same moment is a fault in the read
 * path, not fourteen institutions going quiet at once. Kept apart, the page can
 * say the true thing, which is that one read returned nothing.
 */
export type CacReadOutcome = 'values' | 'read-failed' | 'nothing-returned';

export function classifyMeasuredRead(
  rows: CacMeasuredRow[] | undefined,
  readFailed: boolean,
): CacReadOutcome {
  if (readFailed) return 'read-failed';
  // Deliberately not `rows.length === 0`. A response of value-less placeholder
  // rows carries exactly as much information as no response, and the page must
  // treat the two the same or the emptier-looking one gets the better wording.
  if (!rows || metricsWithData(rows).size === 0) return 'nothing-returned';
  return 'values';
}

/**
 * Which wired metrics came back with nothing at all.
 *
 * A metric the catalog calls `measured` has real substrate behind it, so an
 * absence spanning every institution is far more likely to be a broken feed than
 * a cluster that genuinely emptied. Several of these depend on an overnight job
 * — the exam mirror into coe_naac_evidence among them — and a job that stops
 * leaves the RPC returning 200 with the other metrics intact.
 *
 * Without this, every institution's cell for such a metric falls to the
 * no-row branch and prints "none recorded", which this page's own legend defines
 * as a fact about that institution. A dead overnight job would then read as a
 * finding against every college, and keep reading that way for as long as it
 * stayed broken.
 *
 * Guarded on the whole-read outcome for a reason: when nothing came back at all,
 * every wired metric is trivially absent, and reporting each one as
 * independently stopped would turn a single fault into a screenful of alarms.
 * That case belongs to the caller's banner, so this returns nothing for it.
 */
export function stoppedReportingMetrics(
  measuredMetricIds: readonly string[],
  live: Set<string>,
  outcome: CacReadOutcome,
): Set<string> {
  if (outcome !== 'values') return new Set();
  return new Set(measuredMetricIds.filter((id) => !live.has(id)));
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

// ---------------------------------------------------------------------------
// How old the attendance rollup is.
//
// cac_attendance_rollup holds the all-history attendance totals, recomputed
// nightly as `postgres` because the live JSONB expansion cannot finish inside
// the 8s statement_timeout the `authenticated` role carries. Nothing on the
// page reads its NUMBERS yet — that rewire is deliberately deferred — but the
// council still has to be told when the figure behind attendance was last
// worked out, because a nightly job that quietly stops looks exactly like a
// nightly job that is working.
//
// The read is one row: the newest computed_at the viewer is allowed to see.
// ---------------------------------------------------------------------------

/** Past this age the rollup is called out rather than simply reported. */
export const CAC_ROLLUP_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * `never`   — the rollup holds nothing. The nightly job has not produced a
 *             figure the viewer can see, so there is no date to show and
 *             showing one anyway would invent a computation that never ran.
 * `fresh`   — computed inside the window.
 * `stale`   — computed, but longer ago than the window allows.
 * `unknown` — the read failed, or the stored value would not parse. Kept
 *             apart from `never` on purpose: "nobody has computed this" and
 *             "we could not find out" are different claims, and only one of
 *             them is a statement about the job.
 */
export type CacRollupFreshness =
  | { state: 'never' }
  | { state: 'unknown' }
  | { state: 'fresh'; computedAt: Date }
  | { state: 'stale'; computedAt: Date };

export function classifyRollupFreshness(
  computedAt: string | null | undefined,
  readFailed: boolean,
  now: Date = new Date(),
  staleAfterMs: number = CAC_ROLLUP_STALE_AFTER_MS,
): CacRollupFreshness {
  if (readFailed) return { state: 'unknown' };
  if (!computedAt) return { state: 'never' };

  const at = new Date(computedAt);
  // An unparseable timestamp is not evidence that nothing ran, so it must not
  // borrow the `never` wording — every downstream branch would then read a
  // storage fault as a finding about the job.
  if (Number.isNaN(at.getTime())) return { state: 'unknown' };

  const age = now.getTime() - at.getTime();
  return age > staleAfterMs
    ? { state: 'stale', computedAt: at }
    : { state: 'fresh', computedAt: at };
}

/**
 * The newest computed_at in cac_attendance_rollup, or null when the table
 * holds no row the viewer may read.
 *
 * `null` is a real answer here, not a missing one, which is why the query
 * resolves rather than throws on an empty table — the caller distinguishes it
 * from a failure through `error`. RLS on the table is per-institution, so this
 * is "the newest figure you are allowed to see", which is the only honest
 * reading a page can offer.
 */
export function useCacAttendanceRollupFreshness() {
  return useQuery({
    queryKey: cacMetricKeys.attendanceRollup(),
    queryFn: async (): Promise<string | null> => {
      const sb = createClientSupabaseClient() as any;
      // ORDER BY ... LIMIT 1 rather than an aggregate: PostgREST returns the
      // rows RLS allows, and max() over a denied set is indistinguishable from
      // max() over an empty one anyway. One row off a ten-row table.
      const { data, error } = await sb
        .from('cac_attendance_rollup')
        .select('computed_at')
        .order('computed_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0]?.computed_at as string | undefined) ?? null;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
