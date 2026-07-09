// lib/services/accreditation/loop-evidence-service.ts
// ============================================================================
// Quality Loops → NAAC Metric 7.3 "Quality Assurance System" evidence reader
// + Binary Accreditation Framework (2024) draft formatter
// (Loop → accreditation bridge, PR-2 of 2).
//
// Reads the rows PR-1's loop evidence rollup writes into
// quality_evidence_mappings (body_code='NAAC', metric_code IN
// 7.3.d/7.3.e/7.3.f — facet letters under Metric 7.3, Attribute 7 Governance
// and Administration, per the NAAC Reforms 2024 Binary Accreditation
// Framework), is_auto=true, metadata per the pinned contract in
// lib/types/accreditation. READ-ONLY — no mutations.
//
// The pre-existing numeric row 7.3.1 (IQAC meeting frequency) is a different
// concern and is deliberately excluded — the .in() filter below only matches
// the facet-letter codes. Under the outgoing framework this evidence maps to
// AQAR Criterion 6.5 (IQAC).
//
// Server-usable: every query method takes the Supabase client as an argument
// so the same logic runs from the NAAC dashboard (browser client, RLS-scoped)
// and from /api/accreditation/naac/qas-73-draft (session server client, also
// RLS-scoped). Do NOT pass a service-role client — RLS governs this table.
// ============================================================================

import type {
  LoopDeltaSummary,
  LoopEvidenceMetadata,
  LoopEvidenceRow,
  QualityLoopSummary,
} from '@/lib/types/accreditation';
import { LOOP_METRIC_CODES } from '@/lib/types/accreditation';

/** Minimal structural client type so both browser + server clients fit. */
type SupabaseLike = { from: (table: string) => any };

/**
 * NAAC's own facet language for Metric 7.3 (Binary Accreditation Framework
 * 2024). The draft sections mirror these phrasings verbatim.
 */
const FACET_HEADINGS: Record<string, string> = {
  '7.3.d':
    'Regularly conducts audits / performance assessment and provides feedback to the system',
  '7.3.e': 'Practice of Quality circles',
  '7.3.f':
    'Conducts periodic stakeholder satisfaction survey and provides feedback',
};

/** Facet render order in the draft: d, e, f. */
const FACET_ORDER = ['7.3.d', '7.3.e', '7.3.f'] as const;

export interface LoopEvidenceFilters {
  /** Specific institution, or null/undefined for cluster-wide (RLS still applies). */
  institutionId?: string | null;
  /** 'AY 2026-27'-style period_label, or null/undefined for all periods. */
  period?: string | null;
}

export class LoopEvidenceService {
  /**
   * Fetch Metric 7.3 loop evidence rows, newest first.
   * Returns [] when PR-1's rollup has not run yet — callers render the
   * designed empty state, never an error.
   */
  static async getLoopEvidenceRows(
    sb: SupabaseLike,
    filters: LoopEvidenceFilters = {},
  ): Promise<LoopEvidenceRow[]> {
    let query = sb
      .from('quality_evidence_mappings')
      .select(
        'id, institution_id, metric_code, period_label, mapped_at, source_table, is_auto, metadata',
      )
      .eq('body_code', 'NAAC')
      // Facet letters only — excludes the pre-existing 7.3.1 (meeting
      // frequency) row, which is a different concern.
      .in('metric_code', [...LOOP_METRIC_CODES])
      .order('mapped_at', { ascending: false });

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.period) {
      // Deep-review MEDIUM (2026-07-08): the dashboard buckets null-period rows
      // under the current AY ((r.period_label ?? currentAY)) — a plain .eq()
      // silently drops them from the export, so the downloaded NAAC draft
      // contradicts the on-screen tiles. Mirror the dashboard: for the CURRENT
      // AY, null period_label counts as current.
      if (filters.period === this.currentAcademicYearLabel()) {
        query = query.or(`period_label.is.null,period_label.eq.${filters.period}`);
      } else {
        query = query.eq('period_label', filters.period);
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as LoopEvidenceRow[];
  }

  /**
   * Group evidence rows by metadata->>'loop_key' into per-loop tiles:
   * cycles measured, last measured, delta breakdown, latest outcome numbers.
   * Rows missing loop_key fall back to source_table so nothing is dropped.
   */
  static groupByLoop(rows: LoopEvidenceRow[]): QualityLoopSummary[] {
    const byLoop = new Map<string, QualityLoopSummary>();

    for (const row of rows) {
      const meta = (row.metadata ?? {}) as LoopEvidenceMetadata;
      const loopKey = meta.loop_key || row.source_table || 'unknown';
      let summary = byLoop.get(loopKey);
      if (!summary) {
        summary = {
          loop_key: loopKey,
          loop_name: meta.loop_name || loopKey,
          metric_code: row.metric_code,
          cycles: 0,
          last_measured_at: null,
          deltas: { improved: 0, no_change: 0, worse: 0, na: 0 },
          latest_outcome: null,
        };
        byLoop.set(loopKey, summary);
      }

      summary.cycles += 1;

      const delta = (meta.delta_summary ?? 'n/a') as LoopDeltaSummary;
      if (delta === 'improved') summary.deltas.improved += 1;
      else if (delta === 'no_change') summary.deltas.no_change += 1;
      else if (delta === 'worse') summary.deltas.worse += 1;
      else summary.deltas.na += 1;

      // Skeptic r2 (2026-07-09): mapped_at is the ROLLUP-RUN time and refreshes
      // nightly for in-window rows (#1899's upsert design) — reading it for a
      // "measured" field would show "yesterday 04:23" forever. The pinned
      // metadata contract carries the authoritative measured_at; mapped_at is
      // only the fallback for legacy/manual rows without one.
      const measuredAt =
        typeof meta.measured_at === 'string' && meta.measured_at
          ? meta.measured_at
          : row.mapped_at;
      if (!summary.last_measured_at || measuredAt > summary.last_measured_at) {
        summary.last_measured_at = measuredAt;
        // Rows arrive newest-first, but don't rely on order — track explicitly.
        // Deep-review MEDIUM (2026-07-08): set unconditionally — keeping an
        // OLDER cycle's numbers when the newest row lacks meta.outcome would
        // print stale figures under "Latest measured outcome" in the draft.
        summary.latest_outcome =
          meta.outcome && typeof meta.outcome === 'object'
            ? (meta.outcome as Record<string, unknown>)
            : null;
        if (meta.loop_name) summary.loop_name = meta.loop_name;
        summary.metric_code = row.metric_code;
      }
    }

    // Stable order: facet code (d, e, f) then loop_name.
    return Array.from(byLoop.values()).sort((a, b) => {
      if (a.metric_code !== b.metric_code) {
        return a.metric_code.localeCompare(b.metric_code);
      }
      return a.loop_name.localeCompare(b.loop_name);
    });
  }

  /**
   * Current academic-year label with the June cutoff used by PR-1's rollup:
   * Jun–Dec → 'AY <y>-<y+1 short>', Jan–May → 'AY <y-1>-<y short>'.
   * e.g. July 2026 → 'AY 2026-27'.
   */
  static currentAcademicYearLabel(now: Date = new Date()): string {
    const month = now.getMonth(); // 0-based; June = 5
    const startYear = month >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    const endShort = String((startYear + 1) % 100).padStart(2, '0');
    return `AY ${startYear}-${endShort}`;
  }

  /**
   * Render metadata.outcome numbers as readable "key: value" pairs.
   * Only scalar entries are rendered; nested objects are skipped.
   */
  private static formatOutcome(outcome: Record<string, unknown> | null): string {
    if (!outcome) return '';
    const parts: string[] = [];
    for (const [key, value] of Object.entries(outcome)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue;
      parts.push(`${key.replace(/_/g, ' ')}: ${String(value)}`);
    }
    return parts.join(', ');
  }

  private static describeDeltas(loop: QualityLoopSummary): string {
    // Deep-review MEDIUM (2026-07-08): `cycles` includes n/a rows — omitting
    // them here made the three numbers sum to less than the stated cycle
    // count, a self-inconsistent figure in a NAAC-bound document.
    const { improved, no_change, worse, na } = loop.deltas;
    const base = `${improved} improved, ${no_change} no change, ${worse} declined`;
    return na > 0 ? `${base}, ${na} not yet comparable` : base;
  }

  /**
   * Build the Metric 7.3 "Quality Assurance System" evidence draft (Binary
   * Accreditation Framework 2024) as markdown — one section per facet d/e/f,
   * each mirroring NAAC's own facet language and populated per-loop with
   * cycles + delta breakdowns. Honest scaffolding: facets with zero rows say
   * "No measured cycles recorded for <period>" — numbers are never invented.
   */
  static buildQas73DraftMarkdown(
    rows: LoopEvidenceRow[],
    opts: { period: string; scopeLabel: string; generatedAt?: Date },
  ): string {
    const generatedAt = opts.generatedAt ?? new Date();
    const loops = this.groupByLoop(rows);
    const byFacet = (code: string) => loops.filter((l) => l.metric_code === code);

    const lines: string[] = [];
    lines.push(
      '# Metric 7.3 Quality Assurance System — evidence draft (Binary Accreditation Framework 2024)',
    );
    lines.push('');
    lines.push('**Attribute 7:** Governance and Administration  ');
    lines.push(`**Period:** ${opts.period}  `);
    lines.push(`**Scope:** ${opts.scopeLabel}  `);
    lines.push(
      '**Source:** MyJKKN closed-loop quality evidence (`quality_evidence_mappings`, auto-tagged)',
    );
    lines.push('');

    for (const facet of FACET_ORDER) {
      lines.push(`## ${facet} — ${FACET_HEADINGS[facet]}`);
      lines.push('');
      const facetLoops = byFacet(facet);
      if (facetLoops.length === 0) {
        lines.push(`No measured cycles recorded for ${opts.period}.`);
        lines.push('');
        continue;
      }

      // Facet-level lead sentence, then one paragraph/bullet per loop with
      // cycles + deltas + latest measured numbers.
      if (facet === '7.3.d') {
        const names = facetLoops.map((l) => l.loop_name).join(', ');
        lines.push(
          `The institution regularly conducts audits and performance assessments through ` +
            `${facetLoops.length} closed platform loop${facetLoops.length === 1 ? '' : 's'} ` +
            `(${names}); each measured cycle's outcome is compared to the previous cycle's ` +
            `baseline and fed back to the system automatically.`,
        );
        lines.push('');
      } else if (facet === '7.3.e') {
        lines.push(
          `Quality-circle practice evidenced by ${facetLoops.length} measured ` +
            `loop${facetLoops.length === 1 ? '' : 's'} on the MyJKKN platform:`,
        );
        lines.push('');
      } else {
        lines.push(
          `The institution conducts periodic stakeholder satisfaction surveys through ` +
            `${facetLoops.length} closed feedback loop${facetLoops.length === 1 ? '' : 's'}; ` +
            `results are fed back to stakeholders and the next cycle is measured against ` +
            `the previous one.`,
        );
        lines.push('');
      }

      for (const loop of facetLoops) {
        const outcome = this.formatOutcome(loop.latest_outcome);
        lines.push(
          `- **${loop.loop_name}** — ran ${loop.cycles} measured review ` +
            `cycle${loop.cycles === 1 ? '' : 's'} in ${opts.period}; outcomes vs baseline: ` +
            `${this.describeDeltas(loop)}` +
            (outcome ? `. Latest measured outcome — ${outcome}` : '') +
            '.',
        );
      }
      lines.push('');
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    lines.push('---');
    lines.push('');
    lines.push(
      `Generated from MyJKKN closed-loop evidence, ${generatedAt.toISOString()}. ` +
        'Human review required before NAAC submission.',
    );
    lines.push('');
    lines.push(
      'Under the outgoing framework this evidence maps to AQAR Criterion 6.5 (IQAC).',
    );
    lines.push('');

    return lines.join('\n');
  }
}
