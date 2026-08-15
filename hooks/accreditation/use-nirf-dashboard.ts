// hooks/accreditation/use-nirf-dashboard.ts
// ============================================================================
// React Query hooks for /accreditation/nirf dashboard (PR-A9 — Unification 9/15).
//
// NIRF (National Institutional Ranking Framework) is the MoE annual ranking.
// At JKKN it applies cluster-wide (all 8 colleges) — college switcher needed.
// The 5 canonical NIRF parameters: TLR, RPC, GO, OI, PR.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export const nirfKeys = {
  all: ['accreditation', 'nirf'] as const,
  metrics: () => [...nirfKeys.all, 'metrics'] as const,
  evidenceCounts: (institutionId: string | 'cluster') =>
    [...nirfKeys.all, 'evidence-counts', institutionId] as const,
};

export interface NIRFMetric {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
  calculation_method: string | null;
  notes: string | null;
}

export function useNIRFMetrics() {
  return useQuery({
    queryKey: nirfKeys.metrics(),
    queryFn: async (): Promise<NIRFMetric[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score, calculation_method, notes')
        .eq('metric_type', 'NIRF')
        .eq('is_active', true)
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as NIRFMetric[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * PostgREST stops at `max-rows` (10,000 on this project) and says so ONLY in the
 * `content-range` header, which the JS client does not surface. An unpaged
 * `.select()` over a bigger table therefore returns a short array with
 * `error === null` — the read looks perfectly successful and the count is just
 * wrong. That is the same silent shape as an RLS denial, and it is why this
 * needs pagination rather than a bigger single request.
 *
 * Measured 2026-08-02, the day NIRF evidence was seeded: 11,396 NIRF rows
 * cluster-wide against a 10,000 cap. The page defaults to `'cluster'`, so its
 * DEFAULT view was under-reporting by 1,396 rows. Per-institution the largest
 * is 2,503 (ASSF), so only the cluster path ever crossed the line — but a cap
 * that is only breached at cluster scale is exactly the one nobody notices.
 */
export const PAGE_SIZE = 1000;
/** 100 pages = 100k rows. A stop, not a limit — it exists so a server that
 *  ignores `.range()` cannot spin this loop forever. */
export const MAX_PAGES = 100;

/** Fetches one page. Returns the rows for `[from, to]` inclusive. */
export type PageFetcher = (
  from: number,
  to: number,
) => Promise<{ metric_code: string }[]>;

/**
 * Tallies every row by `metric_code`, paging until the set is exhausted.
 *
 * Pure and exported so the pagination contract can be tested against a fake
 * server that enforces a row cap — the real failure. A test that re-counted a
 * fixture array would only prove this file agrees with itself.
 */
export async function tallyMetricCountsPaged(
  fetchPage: PageFetcher,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchPage(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    for (const row of batch) {
      if (!row?.metric_code) continue;
      counts[row.metric_code] = (counts[row.metric_code] ?? 0) + 1;
    }
    // A short page means the set is exhausted. Checked AFTER counting so the
    // final partial page is never dropped.
    if (batch.length < PAGE_SIZE) break;
  }
  return counts;
}

export function useNIRFEvidenceCounts(institutionId: string | 'cluster') {
  return useQuery({
    queryKey: nirfKeys.evidenceCounts(institutionId),
    queryFn: async (): Promise<Record<string, number>> => {
      const sb = createClientSupabaseClient() as any;
      return tallyMetricCountsPaged(async (from, to) => {
        let query = sb
          .from('quality_evidence_mappings')
          .select('metric_code')
          .eq('body_code', 'NIRF');
        if (institutionId !== 'cluster') {
          query = query.eq('institution_id', institutionId);
        }
        // Ordered so the pages partition the set. Without a stable sort,
        // PostgREST may return overlapping or skipped rows across ranges and
        // the totals drift — a subtler wrong number than the truncation itself.
        const { data, error } = await query
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return (data ?? []) as { metric_code: string }[];
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}

// `useJKKNInstitutionsNIRF()` used to live here — a byte-identical copy of
// `useJKKNInstitutions()` in use-body-dashboard.ts, sharing its cache key. The
// NIRF page now goes through `useVisibleInstitutions()`, which narrows that one
// canonical read to the colleges the reader can actually see. Deleted rather
// than left in place: a second copy of a read whose result is now a printed
// claim about the reader is a copy that will drift.
