// lib/services/accreditation/accreditation-service.ts
// ============================================================================
// Read-only service for the /accreditation/* dashboards (PR-A7).
//
// Reads only — no mutations. Writes to the substrate happen via:
//   - Fan-out triggers (PR-A5 already live: anti-ragging → evidence)
//   - Future trigger PRs (PR-A3 Admission, PR-A9 NIRF publications, etc.)
//   - Manual tagging by IQAC coordinators (PR-A8 NAAC dashboard UI)
//
// All queries are scoped to the user's role via RLS on the underlying tables.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import { measureCoverage, tallyEvidence } from './coverage-measure';
import type { CatalogueIndex, EvidenceRef } from './coverage-measure';
import type {
  AccreditationBodyCode,
  BodyScoreboard,
  CoverageMatrixRow,
} from '@/lib/types/accreditation';

/**
 * The bodies this service reports on, in display order.
 *
 * Derived from ACCREDITATION_BODIES rather than repeated as a literal: the
 * same ten codes were written out twice in this file, and a body added to the
 * metadata but not to both copies would silently get no scoreboard row and no
 * sort position — which is exactly what happened to the five bodies added on
 * 2026-08-06 before this line existed.
 */
const BODY_ORDER: AccreditationBodyCode[] = ACCREDITATION_BODIES.map((b) => b.code);

/**
 * PostgREST's configured `max_rows` on this project. A plain `.select()` stops
 * silently at this many rows — no error, no flag, just a short array.
 *
 * This is not hypothetical here: quality_evidence_mappings held 11,703 rows on
 * 2026-09-07, so the single unpaged select these dashboards used to run was
 * dropping ~1,700 of them and reporting the remainder as the total. The clamp
 * on the old coverage formula hid it, because 10,000 rows over 17 metrics and
 * 11,703 rows over 17 metrics both rendered as 100%.
 */
const PAGE_SIZE = 10000;

/**
 * Hard stop on the paging loop. At PAGE_SIZE this covers 500,000 evidence
 * rows — about 43× today's volume. It exists so that a server that answers
 * every range with the same rows cannot spin this dashboard forever; a
 * dashboard that under-reports is a bug, one that never returns is an outage.
 */
const MAX_PAGES = 50;

export class AccreditationService {
  private static supabase = createClientSupabaseClient();

  /**
   * Every evidence mapping, paged past PostgREST's row cap.
   *
   * Two round trips at today's volume, not one — worth it, because the
   * alternative is a dashboard that under-reports evidence and cannot say by
   * how much. Ordered by `id` so the pages partition the table rather than
   * overlapping: without an ORDER BY, `range()` offsets are only as stable as
   * the planner feels like being.
   */
  private static async fetchAllEvidence(): Promise<EvidenceRef[]> {
    const all: EvidenceRef[] = [];
    let from = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { data, error } = await (this.supabase as any)
        .from('quality_evidence_mappings')
        .select('body_code, metric_code, institution_id')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as EvidenceRef[];
      if (rows.length === 0) break;
      all.push(...rows);
      // Advance by what actually came back, not by PAGE_SIZE. The server is
      // free to return fewer rows than asked for — max_rows is server-side
      // configuration this file cannot see — and a loop that assumed it got a
      // full page would step straight over the remainder and call it the end
      // of the table, which is the silent truncation being fixed here.
      from += rows.length;
    }
    return all;
  }

  /**
   * The active framework catalogue, as a set of metric codes per body.
   *
   * A set rather than a count, because coverage needs both halves of it: the
   * size is the denominator, and membership is what filters evidence down to
   * metrics that actually exist in the catalogue. Rows with a blank code are
   * excluded — a metric with no code cannot be tagged, so it can never be
   * answered, and counting it in the denominator would report a gap nobody is
   * able to close.
   */
  private static async fetchCatalogue(): Promise<CatalogueIndex> {
    const { data, error } = await (this.supabase as any)
      .from('sh_accreditation_metrics')
      .select('metric_type, metric_code')
      .eq('is_active', true)
      .not('metric_code', 'is', null)
      .neq('metric_code', '');
    if (error) throw error;

    const catalogue: Record<string, Set<string>> = {};
    for (const row of (data ?? []) as { metric_type: string; metric_code: string }[]) {
      (catalogue[row.metric_type] ??= new Set<string>()).add(row.metric_code);
    }
    return catalogue;
  }

  /**
   * One row per body for the landing page scoreboard cards.
   *
   * COVERAGE IS METRICS ANSWERED, NOT ROWS FILED. It used to be
   * `evidence_rows / metrics_seeded`, which divided a count of rows by a count
   * of metrics and then clamped the result to 100%. On prod that read NAAC,
   * NIRF and NBA at a flat 100% while 48 of 69 NAAC metrics, 13 of 17 NIRF
   * metrics and 8 of 9 NBA metrics had never been touched. See
   * ./coverage-measure.ts for the measure and why the clamp hid it.
   *
   * `evidence_rows` is still reported — it is the honest answer to "how much
   * material is on file", which is a different question from "how much of the
   * framework is answered", and both belong on the card.
   */
  static async getLandingScoreboard(): Promise<BodyScoreboard[]> {
    const catalogue = await this.fetchCatalogue();
    const evidence = await this.fetchAllEvidence();
    const byBody = tallyEvidence(evidence, catalogue, (row) => row.body_code);

    return BODY_ORDER.map((body_code) => {
      const tally = byBody[body_code];
      const measure = measureCoverage(
        catalogue[body_code]?.size ?? 0,
        tally?.metricsWithEvidence ?? 0,
      );
      return {
        body_code,
        metrics_seeded: measure.catalogueSize,
        metrics_with_evidence: measure.metricsWithEvidence,
        evidence_rows: tally?.evidenceRows ?? 0,
        coverage_pct: measure.coveragePct,
      };
    });
  }

  /**
   * Per-(body, institution) coverage breakdown for the /accreditation/coverage
   * dashboard. Only returns rows where the body is relevant to the institution
   * (e.g., DCI returns one row — JKKN Dental College — not all 8).
   *
   * The denominator is the body's whole active catalogue, the same one the
   * landing card uses — not the metrics this particular college happens to
   * have tagged. A college that has answered 13 of NAAC's 69 metrics reads
   * 19%, where the row-count formula read it as 100% off 112 evidence rows.
   */
  static async getCoverageMatrix(): Promise<CoverageMatrixRow[]> {
    const evidence = await this.fetchAllEvidence();

    // All JKKN institutions with their names + iqac_code
    const { data: institutions, error: instError } = await (this.supabase as any)
      .from('institutions')
      .select('id, name, iqac_code, institution_type')
      .not('iqac_code', 'is', null);
    if (instError) throw instError;

    const catalogue = await this.fetchCatalogue();

    // Same tally as the landing scoreboard, one grain finer.
    const byCell = tallyEvidence(
      evidence,
      catalogue,
      (e) => `${e.body_code}::${e.institution_id}`,
    );

    // Build matrix — only include (body × institution) pairs that have evidence
    const matrix: CoverageMatrixRow[] = [];
    for (const [key, tally] of Object.entries(byCell)) {
      const [body_code, institution_id] = key.split('::');
      const inst = (institutions ?? []).find((i: any) => i.id === institution_id);
      if (!inst) continue;
      const measure = measureCoverage(
        catalogue[body_code!]?.size ?? 0,
        tally.metricsWithEvidence,
      );
      matrix.push({
        body_code: body_code as AccreditationBodyCode,
        institution_id: institution_id!,
        institution_name: inst.name,
        iqac_code: inst.iqac_code,
        evidence_rows: tally.evidenceRows,
        metrics_seeded: measure.catalogueSize,
        metrics_with_evidence: measure.metricsWithEvidence,
        coverage_pct: measure.coveragePct,
      });
    }

    // Sort: body first (stable order), then coverage desc
    matrix.sort((a, b) => {
      const aIdx = BODY_ORDER.indexOf(a.body_code);
      const bIdx = BODY_ORDER.indexOf(b.body_code);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return b.coverage_pct - a.coverage_pct;
    });

    return matrix;
  }
}
