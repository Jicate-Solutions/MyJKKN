// hooks/accreditation/use-iqac-framework.ts
// ============================================================================
// Reads for the IQAC dashboard: the 107-row master framework, the evidence
// filed against it, and the 48 → 107 mapping registry.
//
// All three go through the browser Supabase client, so every read is the
// signed-in reader's own — RLS decides what comes back, and a reader without
// `accreditation.metrics.view` sees the refusal the page states rather than a
// silently empty grid.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  IqacMetricMapService,
  type IqacMetricMapReadout,
} from '@/lib/services/accreditation/iqac-metric-map-service';
import {
  evidenceKey,
  type FrameworkMetricRow,
} from '@/app/(routes)/accreditation/iqac/_lib/metric-framework';

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Every active row of the master framework — all bodies at once, which is the
 * whole point: the per-body dashboards each read their own slice, and nothing
 * before this read the framework as one thing.
 *
 * `weightage` is selected even though it is NULL on all 107 rows in production
 * (verified 2026-08-01). The page reports that absence rather than hiding the
 * column, because "the framework carries no weights" is a fact an IQAC
 * coordinator needs and a missing column would conceal.
 */
export function useFrameworkMetrics() {
  return useQuery({
    queryKey: ['accreditation', 'iqac', 'framework'],
    queryFn: async (): Promise<FrameworkMetricRow[]> => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase
        .from('sh_accreditation_metrics')
        .select('metric_type, metric_code, metric_name, category, max_score, weightage')
        .eq('is_active', true)
        .order('metric_type')
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as FrameworkMetricRow[];
    },
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });
}

/** One evidence mapping, as the page needs to see it. */
export interface EvidenceMappingRow {
  body_code: string;
  metric_code: string;
  source_table: string;
  source_id: string;
  period_label: string | null;
}

/**
 * Every evidence mapping the reader may see, in one read.
 *
 * This replaces the earlier counts-only read. The page now needs three different
 * cuts of the same 212 rows — per-metric counts, per-source-and-body grouping
 * for "collect once", and the list of academic years to offer in the selector —
 * and three queries for one small table would be three round trips to compute
 * what one already contains. The cuts are pure functions over this array, which
 * also makes them testable without a database.
 *
 * `source_id` is selected so a source claimed by two bodies can be counted ONCE:
 * counting mapping rows would report 92 course-attainment records where 46 exist.
 */
export const EVIDENCE_PAGE_SIZE = 1000;
/** 100 pages = 100k rows. A stop, not a limit — so a server that ignores
 *  `.range()` cannot spin the loop forever. */
export const EVIDENCE_MAX_PAGES = 100;

/** Fetches one page of mappings for `[from, to]` inclusive. */
export type EvidencePageFetcher = (
  from: number,
  to: number,
) => Promise<EvidenceMappingRow[]>;

/**
 * Reads every mapping, paging until the set is exhausted.
 *
 * PostgREST enforces `max-rows` (10,000 on this project) and reports the real
 * total ONLY in the `content-range` header, which the JS client does not
 * surface — so an unpaged `.select()` over a bigger table returns a short array
 * with `error === null`. A successful-looking read and a wrong number, the same
 * silent shape as an RLS denial.
 *
 * This crossed the line the day NIRF evidence was seeded: the table went from
 * 258 rows to 11,608, and this hook reads ALL bodies at once, so it was the
 * first caller to breach the cap. Measured 2026-08-02.
 *
 * Pure and exported so the pagination can be tested against a fake server that
 * enforces the cap — counting a fixture array in memory would pass against the
 * broken version too.
 */
export async function fetchEvidencePaged(
  fetchPage: EvidencePageFetcher,
): Promise<EvidenceMappingRow[]> {
  const rows: EvidenceMappingRow[] = [];
  for (let page = 0; page < EVIDENCE_MAX_PAGES; page += 1) {
    const batch = await fetchPage(
      page * EVIDENCE_PAGE_SIZE,
      page * EVIDENCE_PAGE_SIZE + EVIDENCE_PAGE_SIZE - 1,
    );
    rows.push(...batch);
    // Short page = set exhausted. Checked AFTER pushing, so the final partial
    // page is never dropped.
    if (batch.length < EVIDENCE_PAGE_SIZE) break;
  }
  return rows;
}

export function useEvidenceMappings() {
  return useQuery({
    queryKey: ['accreditation', 'iqac', 'evidence-mappings'],
    queryFn: async (): Promise<EvidenceMappingRow[]> => {
      const supabase = createClientSupabaseClient() as any;
      return fetchEvidencePaged(async (from, to) => {
        // Ordered by id so the ranges partition the set. Without a stable sort
        // PostgREST may return overlapping or skipped rows across ranges, and
        // the counts drift — a subtler wrong number than the truncation.
        const { data, error } = await supabase
          .from('quality_evidence_mappings')
          .select('body_code, metric_code, source_table, source_id, period_label')
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return (data ?? []) as EvidenceMappingRow[];
      });
    },
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });
}

/**
 * How many evidence records are filed against each framework metric, keyed by
 * body and code together — `metric_code` alone repeats across bodies, so a
 * single-key map would credit one body's evidence to another's metric.
 *
 * Counts DISTINCT source records rather than mapping rows. One record mapped to
 * a metric twice is one record; the earlier row count reported it as two.
 */
export function countEvidenceByMetric(
  rows: readonly EvidenceMappingRow[],
  periodLabel?: string,
): Record<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row?.body_code || !row?.metric_code) continue;
    if (periodLabel && row.period_label !== periodLabel) continue;
    const key = evidenceKey(row.body_code, row.metric_code);
    const bucket = seen.get(key) ?? new Set<string>();
    bucket.add(`${row.source_table}::${row.source_id}`);
    seen.set(key, bucket);
  }
  const counts: Record<string, number> = {};
  for (const [key, bucket] of seen) counts[key] = bucket.size;
  return counts;
}

/**
 * `(source_table, body_code)` pairs with distinct record counts, for the
 * "collect once" grouping. Aggregated here rather than in SQL because the whole
 * table is 212 rows and a dedicated RPC would be a second thing to keep in step
 * with this one.
 */
export function aggregateBySource(
  rows: readonly EvidenceMappingRow[],
  periodLabel?: string,
): { source_table: string; body_code: string; rows: number; distinct_sources: number }[] {
  const acc = new Map<string, { rows: number; ids: Set<string> }>();
  for (const row of rows) {
    if (!row?.source_table || !row?.body_code) continue;
    if (periodLabel && row.period_label !== periodLabel) continue;
    const key = `${row.source_table}::${row.body_code}`;
    const entry = acc.get(key) ?? { rows: 0, ids: new Set<string>() };
    entry.rows += 1;
    entry.ids.add(row.source_id);
    acc.set(key, entry);
  }
  return Array.from(acc, ([key, entry]) => {
    const [source_table, body_code] = key.split('::');
    return { source_table, body_code, rows: entry.rows, distinct_sources: entry.ids.size };
  });
}

/** Every academic-year label present in the data, for the window selector. */
export function periodLabelsIn(rows: readonly EvidenceMappingRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.period_label).filter((l): l is string => Boolean(l))));
}

/**
 * The 48 → 107 mapping registry.
 *
 * Never throws on a missing table: until the registry migration is applied the
 * readout carries `registryAvailable: false`, which the page reports as an
 * un-provisioned registry instead of an error.
 */
export function useIqacMetricMap() {
  return useQuery({
    queryKey: ['accreditation', 'iqac', 'metric-map'],
    queryFn: async (): Promise<IqacMetricMapReadout> => IqacMetricMapService.list(),
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });
}
