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
import type {
  AccreditationBodyCode,
  BodyScoreboard,
  CoverageMatrixRow,
} from '@/lib/types/accreditation';

export class AccreditationService {
  private static supabase = createClientSupabaseClient();

  /**
   * One row per body for the landing page scoreboard cards.
   * Aggregates: metric count from sh_accreditation_metrics + evidence row
   * count from quality_evidence_mappings + coarse coverage %.
   *
   * Coverage formula: evidence_rows / metrics_seeded (both per body), capped
   * at 100%. Placeholder — real weighted coverage (per docs §8) lands in
   * per-body dashboards when each body's full catalog is seeded.
   */
  static async getLandingScoreboard(): Promise<BodyScoreboard[]> {
    // Metrics count per body
    const { data: metrics, error: metricsError } = await (this.supabase as any)
      .from('sh_accreditation_metrics')
      .select('metric_type')
      .eq('is_active', true);

    if (metricsError) throw metricsError;

    const metricCounts = (metrics ?? []).reduce<Record<string, number>>((acc, row: any) => {
      acc[row.metric_type] = (acc[row.metric_type] ?? 0) + 1;
      return acc;
    }, {});

    // Evidence row count per body
    const { data: evidence, error: evidenceError } = await (this.supabase as any)
      .from('quality_evidence_mappings')
      .select('body_code');

    if (evidenceError) throw evidenceError;

    const evidenceCounts = (evidence ?? []).reduce<Record<string, number>>((acc, row: any) => {
      acc[row.body_code] = (acc[row.body_code] ?? 0) + 1;
      return acc;
    }, {});

    const allBodies: AccreditationBodyCode[] = [
      'NAAC', 'UGC', 'NIRF', 'QS', 'NBA', 'AICTE', 'NCTE', 'DCI', 'PCI', 'INC',
    ];

    return allBodies.map((body_code) => {
      const metrics_seeded = metricCounts[body_code] ?? 0;
      const evidence_rows = evidenceCounts[body_code] ?? 0;
      // Placeholder coverage: 0% if no evidence, else clamped.
      // Real formula per docs §8 lands with per-body dashboards.
      const coverage_pct =
        metrics_seeded === 0
          ? 0
          : Math.min(100, Math.round((evidence_rows / Math.max(metrics_seeded, 1)) * 100));
      return { body_code, metrics_seeded, evidence_rows, coverage_pct };
    });
  }

  /**
   * Per-(body, institution) coverage breakdown for the /accreditation/coverage
   * dashboard. Only returns rows where the body is relevant to the institution
   * (e.g., DCI returns one row — JKKN Dental College — not all 8).
   */
  static async getCoverageMatrix(): Promise<CoverageMatrixRow[]> {
    // Evidence by (body_code, institution_id)
    const { data: evidence, error: evidenceError } = await (this.supabase as any)
      .from('quality_evidence_mappings')
      .select('body_code, institution_id');
    if (evidenceError) throw evidenceError;

    // All JKKN institutions with their names + iqac_code
    const { data: institutions, error: instError } = await (this.supabase as any)
      .from('institutions')
      .select('id, name, iqac_code, institution_type')
      .not('iqac_code', 'is', null);
    if (instError) throw instError;

    // Metric counts per body (reused from scoreboard logic)
    const { data: metrics } = await (this.supabase as any)
      .from('sh_accreditation_metrics')
      .select('metric_type')
      .eq('is_active', true);

    const metricCounts = (metrics ?? []).reduce<Record<string, number>>((acc, row: any) => {
      acc[row.metric_type] = (acc[row.metric_type] ?? 0) + 1;
      return acc;
    }, {});

    // Group evidence by (body, institution)
    const evidenceGrouped: Record<string, number> = {};
    for (const e of evidence ?? []) {
      const key = `${e.body_code}::${e.institution_id}`;
      evidenceGrouped[key] = (evidenceGrouped[key] ?? 0) + 1;
    }

    // Build matrix — only include (body × institution) pairs that have evidence
    const matrix: CoverageMatrixRow[] = [];
    for (const [key, evidence_rows] of Object.entries(evidenceGrouped)) {
      const [body_code, institution_id] = key.split('::');
      const inst = (institutions ?? []).find((i: any) => i.id === institution_id);
      if (!inst) continue;
      const metrics_seeded = metricCounts[body_code] ?? 0;
      const coverage_pct =
        metrics_seeded === 0
          ? 0
          : Math.min(100, Math.round((evidence_rows / Math.max(metrics_seeded, 1)) * 100));
      matrix.push({
        body_code: body_code as AccreditationBodyCode,
        institution_id,
        institution_name: inst.name,
        iqac_code: inst.iqac_code,
        evidence_rows,
        metrics_seeded,
        coverage_pct,
      });
    }

    // Sort: body first (stable order), then coverage desc
    const bodyOrder: AccreditationBodyCode[] = [
      'NAAC', 'UGC', 'NIRF', 'QS', 'NBA', 'AICTE', 'NCTE', 'DCI', 'PCI', 'INC',
    ];
    matrix.sort((a, b) => {
      const aIdx = bodyOrder.indexOf(a.body_code);
      const bIdx = bodyOrder.indexOf(b.body_code);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return b.coverage_pct - a.coverage_pct;
    });

    return matrix;
  }
}
