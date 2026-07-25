// lib/services/accreditation/accreditation-draft-service.ts
// ============================================================================
// Grounded retrieval + prompt assembly for the AI NAAC narrative drafter.
// (spec: specs/accreditation-narrative-drafter-plan-2026-07-25.md)
//
// The drafter's ONLY fact source is the metric's quality_evidence_mappings
// rows. This module reads them (service-role, scoped by explicit institution +
// metric), and builds a strict grounded prompt that forbids inventing figures
// and requires per-claim [E#] citations. The deterministic grounding-validator
// (grounding-validator.ts) then gates whatever the model returns.
//
// Assessor-facing OUTPUT keeps NAAC's own vocabulary ('students'/'faculty') —
// see the terminology allowlist. This module's own prose uses JKKN terms.
// ============================================================================

import type { EvidenceRow } from './grounding-validator';

/** Minimal client shape so a service-role or session client both fit. */
type SupabaseLike = { from: (t: string) => any };

export interface MetricMeta {
  metric_code: string;
  metric_name: string;
  category: string | null;
}

export interface GroundingSet {
  metric: MetricMeta;
  rows: EvidenceRow[];
}

/** A citation the model emits: an [E#] marker mapped to a real evidence source_id. */
export interface DraftCitation {
  marker: string; // e.g. 'E1'
  source_id: string;
}

export interface ParsedDraft {
  narrative_md: string;
  citations: DraftCitation[];
}

/** Current academic-year label, 'AY 2026-27' style (JKKN AY starts in June). */
export function currentAcademicYearLabel(now: Date = new Date()): string {
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 5 ? y : y - 1; // Jun (month 5) onward = new AY
  const end = String((startYear + 1) % 100).padStart(2, '0');
  return `AY ${startYear}-${end}`;
}

/** Read the metric's evidence rows (the sole allowed facts) + the metric meta. */
export async function getGroundingSet(
  client: SupabaseLike,
  args: { institutionId: string; metricCode: string; bodyCode: string },
): Promise<GroundingSet> {
  const { data: evRows, error: evErr } = await client
    .from('quality_evidence_mappings')
    .select('source_id, metric_code, body_code, metadata')
    .eq('body_code', args.bodyCode)
    .eq('institution_id', args.institutionId)
    .eq('metric_code', args.metricCode);
  if (evErr) throw new Error(`getGroundingSet evidence read: ${evErr.message}`);

  const { data: metricRow } = await client
    .from('sh_accreditation_metrics')
    .select('metric_code, metric_name, category')
    .eq('metric_type', args.bodyCode)
    .eq('metric_code', args.metricCode)
    .maybeSingle();

  return {
    metric: {
      metric_code: args.metricCode,
      metric_name: metricRow?.metric_name ?? args.metricCode,
      category: metricRow?.category ?? null,
    },
    rows: (evRows ?? []) as EvidenceRow[],
  };
}

/**
 * Build the grounded synthesis prompt. The model is told the evidence rows are
 * the ONLY facts, must cite each factual claim with an [E#] marker, must quote
 * exact figures (never round, never derive percentages), and must return JSON.
 */
export function buildGroundingPrompt(args: {
  metric: MetricMeta;
  rows: EvidenceRow[];
  period: string;
  scopeLabel: string;
}): string {
  const { metric, rows, period, scopeLabel } = args;

  const factBlock = rows.length
    ? rows
        .map((r, i) => `[E${i + 1}] source_id=${r.source_id}\n${JSON.stringify(r.metadata)}`)
        .join('\n\n')
    : '(no evidence rows for this metric in this period)';

  return [
    `You are drafting the NAAC accreditation criteria narrative for one metric of one institution.`,
    `This narrative will be read by a NAAC assessor. Write in the assessor's own vocabulary`,
    `(use "students", "faculty", "the institution" — this is the one place that terminology is required).`,
    ``,
    `METRIC: ${metric.metric_code} — ${metric.metric_name}`,
    metric.category ? `CATEGORY: ${metric.category}` : ``,
    `INSTITUTION: ${scopeLabel}`,
    `PERIOD: ${period}`,
    ``,
    `THE ONLY FACTS YOU MAY USE (each is one measured evidence record):`,
    factBlock,
    ``,
    `HARD RULES (an automated gate rejects any violation):`,
    `1. Use ONLY numbers, dates, and course codes that appear verbatim in the facts above.`,
    `   Never invent, estimate, round, or compute a figure. Quote exact values (e.g. 3.80, not ~3.8).`,
    `2. Express proportions as the raw counts from the facts (e.g. "3 of 5 respondents"),`,
    `   NEVER as a derived percentage.`,
    `3. Cite every factual sentence with the [E#] marker(s) of the record(s) it draws from.`,
    `4. If the evidence is thin or empty, say so plainly. Do not pad with unsupported claims.`,
    `5. Write connected assessor-ready prose (2-5 short paragraphs), not a bullet dump.`,
    ``,
    `Return STRICT JSON only, no prose outside it:`,
    `{"narrative_md": "<the narrative, with [E#] markers inline>",`,
    ` "citations": [{"marker": "E1", "source_id": "<the source_id for E1>"}, ...]}`,
  ]
    .filter((l) => l !== ``)
    .join('\n');
}

/** Citation-marker pattern; stripped before grounding validation so the [E#]
 *  tokens are not themselves read as ungrounded alphanumeric codes. */
export const CITATION_MARKER_RE = /\[E\d+\]/g;

/** Remove [E#] citation markers so the validator sees only factual prose. */
export function stripCitationMarkers(md: string): string {
  return md.replace(CITATION_MARKER_RE, '');
}

/**
 * Parse the model output into a draft. Robust to a bare-markdown reply (no JSON):
 * falls back to treating the whole text as the narrative with no citations, so a
 * malformed reply still flows through the grounding gate (and is caught there).
 */
export function parseModelDraft(text: string): ParsedDraft {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      if (obj && typeof obj.narrative_md === 'string') {
        const citations = Array.isArray(obj.citations)
          ? obj.citations
              .filter((c: any) => c && typeof c.marker === 'string' && typeof c.source_id === 'string')
              .map((c: any) => ({ marker: c.marker, source_id: c.source_id }))
          : [];
        return { narrative_md: obj.narrative_md, citations };
      }
    } catch {
      /* fall through to bare-text fallback */
    }
  }
  return { narrative_md: text.trim(), citations: [] };
}
