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
    `   Reproduce every date in the exact ISO form the facts use (e.g. 2026-06-05), character for`,
    `   character — never reword it into prose like "5 June 2026"; the gate matches dates literally.`,
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
 *  tokens are not themselves read as ungrounded alphanumeric codes.
 *
 *  Matches a SINGLE marker (`[E1]`) and the GROUPED form the model legitimately
 *  emits when one sentence draws on several records (`[E1,E2]`, `[E1, E2, E3]`).
 *  Before this handled the grouped form, the literal string
 *  `[E1, E2, E3, E4, E5, E7, E8]` survived stripping and the validator's CODE_RE
 *  then read E1…E8 as ungrounded factual codes — a false-positive that blocked
 *  a real drafted narrative on production (2026-07-26). */
export const CITATION_MARKER_RE = /\[E\d+(?:\s*,\s*E\d+)*\]/g;

/** Remove [E#] citation markers so the validator sees only factual prose. */
export function stripCitationMarkers(md: string): string {
  return md.replace(CITATION_MARKER_RE, '');
}

/** Every balanced top-level `{…}` region in the text, in the order they appear.
 *
 *  Scanned brace-by-brace rather than sliced from the first `{` to the last `}`,
 *  because a model reply can legitimately contain MORE THAN ONE object. String
 *  literals and their escapes are tracked so a brace inside the prose (or an
 *  escaped quote) cannot open or close a region. */
function jsonObjectSlices(text: string): string[] {
  const slices: string[] = [];
  let depth = 0;
  let startIdx = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && startIdx !== -1) {
        slices.push(text.slice(startIdx, i + 1));
        startIdx = -1;
      } else if (depth < 0) {
        // A stray closing brace in prose — resynchronise instead of going negative.
        depth = 0;
        startIdx = -1;
      }
    }
  }
  return slices;
}

/** Accept `narrative_md` as prose or as an array of paragraphs. */
function coerceNarrative(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (Array.isArray(value) && value.length > 0 && value.every((p) => typeof p === 'string')) {
    const joined = value.join('\n\n').trim();
    return joined ? joined : null;
  }
  return null;
}

function extractCitations(obj: any): ParsedDraft['citations'] {
  return Array.isArray(obj?.citations)
    ? obj.citations
        .filter((c: any) => c && typeof c.marker === 'string' && typeof c.source_id === 'string')
        .map((c: any) => ({ marker: c.marker, source_id: c.source_id }))
    : [];
}

/**
 * Parse the model output into a draft.
 *
 * Candidates are tried LAST-FIRST, because a model that corrects itself mid-reply
 * leaves its FINAL block as the answer. This is not hypothetical: a live 7.10.1
 * draft on production (2026-07-26) read
 *
 *     ```json
 *     {…first object, stray bracket…}
 *     ```
 *     Wait, I need to fix a stray bracket. Let me correct that.
 *     ```json
 *     {…second, correct object…}
 *     ```
 *
 * The old first-`{`-to-last-`}` slice spanned BOTH objects plus the English
 * sentence between them, so `JSON.parse` threw and the whole blob — code fences,
 * the model's self-talk and both JSON objects — was stored as the narrative.
 * That polluted the prose AND leaked the embedded `"marker": "E1"` into it, which
 * the grounding gate then correctly flagged as an unaccounted code. The draft was
 * unrecoverable and re-drafted every night.
 *
 * Still robust to a bare-markdown reply (no JSON at all): falls back to the whole
 * text, minus any wrapping code fence, so a genuinely malformed reply keeps
 * flowing through the grounding gate rather than being silently accepted.
 */
export function parseModelDraft(text: string): ParsedDraft {
  const candidates = jsonObjectSlices(text);
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(candidates[i]);
      const narrative = coerceNarrative(obj?.narrative_md);
      if (narrative !== null) {
        return { narrative_md: narrative, citations: extractCitations(obj) };
      }
    } catch {
      /* malformed candidate — try the one before it */
    }
  }
  return { narrative_md: stripWrappingFence(text), citations: [] };
}

/** Drop a single wrapping ```-fence so the fallback stores prose, not markup. */
function stripWrappingFence(text: string): string {
  return text
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}
