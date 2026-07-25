// lib/services/accreditation/grounding-validator.ts
// ============================================================================
// Deterministic grounding validator — the fraud gate for the AI NAAC
// narrative drafter (spec: specs/accreditation-narrative-drafter-plan-2026-07-25.md).
//
// Purpose: an AI-drafted accreditation narrative must never state a number,
// date, or course-code that is not traceable to the real evidence it was
// grounded on. This module is a PURE function — no DB, no model, no network —
// that mechanically extracts every factual token from the prose and asserts
// each one is accounted for. Mirrors the SCF note-safety judge discipline
// (grounded, source-cited, human-gated).
//
// Security principle: the model cannot introduce a factual token the validator
// cannot independently account for. Allowed = {verbatim evidence values}
// ∪ {structural aggregates the validator RECOMPUTES itself: total rows,
// per-loop counts, distinct-course counts} ∪ {context numbers from the
// period label + metric code}. Anything else → verdict 'ungrounded'.
//
// A draft that comes back 'ungrounded' is NOT approvable in the UI. This gate
// is conservative by design: plainer prose is an acceptable price for a gate
// that a fabricated figure can never pass. The drafting prompt therefore
// instructs the model to quote exact evidence figures and express ratios as
// raw counts (never derived percentages).
// ============================================================================

/** One quality_evidence_mappings row, as passed to the drafter as an allowed fact. */
export interface EvidenceRow {
  source_id: string;
  metric_code: string;
  body_code?: string;
  metadata: Record<string, unknown>;
}

/** Non-evidence context whose tokens are legitimately allowed in the prose. */
export interface GroundingContext {
  /** e.g. 'AY 2026-27' — the reporting period the drafter was asked for. */
  period?: string;
  /** e.g. '7.3.d' — the metric code (its numeric fragments are allowed). */
  metricCode?: string;
  /** e.g. 'Quality Assurance System — …' — the metric name. */
  metricName?: string;
  /** e.g. 'JKKN College of …' — the institution/scope label. */
  scopeLabel?: string;
}

export interface GroundingResult {
  verdict: 'grounded' | 'ungrounded';
  /** The offending tokens (empty when grounded). */
  ungroundedTokens: string[];
}

// ── token regexes ──────────────────────────────────────────────────────────
// ISO date first (so its digits are not later mis-read as bare numbers).
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
// A "code" token contains BOTH a letter and a digit (e.g. MR3691, EDU101).
// Pure-numeric course codes (e.g. 383813) are intentionally treated as numbers
// and checked against the allowed-number set instead.
const CODE_RE = /\b(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]+\b/g;
// A bare number: integer or decimal, optional thousands commas.
const NUMBER_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** Canonical key for numeric equality: 3.80 → "3.8", trims trailing zeros. */
function numKey(raw: string): string {
  const n = Number.parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? String(n) : raw;
}

/** True for an ISO-8601-ish date value in evidence (date part only). */
function isoDatePart(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : null;
}

interface AllowedSets {
  numbers: Set<string>; // numKey values
  codes: Set<string>; // upper-cased
  dates: Set<string>; // YYYY-MM-DD
}

/** Recursively collect every primitive token from an arbitrary JSON value. */
function collect(value: unknown, sets: AllowedSets): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) sets.numbers.add(numKey(String(value)));
    return;
  }
  if (typeof value === 'string') {
    const iso = isoDatePart(value);
    if (iso) sets.dates.add(iso);
    // numeric-looking string → allowed number
    if (/^-?\d+(?:\.\d+)?$/.test(value.trim())) sets.numbers.add(numKey(value));
    // mixed alnum token(s) inside the string → allowed code(s)
    for (const c of value.match(CODE_RE) ?? []) sets.codes.add(c.toUpperCase());
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collect(v, sets);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collect(v, sets);
  }
}

/** Structural aggregates the validator can recompute itself (so allowing them
 *  never trusts the model): total rows, per-loop-key counts, distinct courses. */
function structuralNumbers(evidence: EvidenceRow[]): string[] {
  const out: string[] = [String(evidence.length)];
  const perLoop = new Map<string, number>();
  const courses = new Set<string>();
  for (const row of evidence) {
    const md = row.metadata ?? {};
    const loopKey = typeof md.loop_key === 'string' ? md.loop_key : '';
    perLoop.set(loopKey, (perLoop.get(loopKey) ?? 0) + 1);
    const outcome = (md.outcome ?? {}) as Record<string, unknown>;
    const cc = outcome.course_code ?? (md as Record<string, unknown>).course_code;
    if (typeof cc === 'string' || typeof cc === 'number') courses.add(String(cc));
  }
  for (const n of perLoop.values()) out.push(String(n));
  out.push(String(courses.size));
  return out;
}

/** Add every number/code/date fragment of a free-text context string. */
function collectContext(text: string | undefined, sets: AllowedSets): void {
  if (!text) return;
  for (const d of text.match(ISO_DATE_RE) ?? []) sets.dates.add(d);
  for (const c of text.match(CODE_RE) ?? []) sets.codes.add(c.toUpperCase());
  for (const n of text.match(NUMBER_RE) ?? []) sets.numbers.add(numKey(n));
}

/**
 * Validate that every factual token in `narrativeMd` is grounded in `evidence`
 * (or the allowed structural/context sets). Returns 'ungrounded' with the list
 * of offending tokens if any token cannot be accounted for.
 */
export function validateGrounding(
  narrativeMd: string,
  evidence: EvidenceRow[],
  context: GroundingContext = {},
): GroundingResult {
  const sets: AllowedSets = { numbers: new Set(), codes: new Set(), dates: new Set() };

  // 1) verbatim evidence tokens (walk metadata + the source_id/metric_code cols)
  for (const row of evidence) {
    collect(row.metadata, sets);
    if (row.source_id) sets.codes.add(row.source_id.toUpperCase());
    if (row.metric_code) collectContext(row.metric_code, sets);
  }
  // 2) structural aggregates the validator recomputes itself
  for (const n of structuralNumbers(evidence)) sets.numbers.add(numKey(n));
  // 3) context tokens (period label, metric code/name, scope label)
  collectContext(context.period, sets);
  collectContext(context.metricCode, sets);
  collectContext(context.metricName, sets);
  collectContext(context.scopeLabel, sets);

  const offending: string[] = [];
  let remaining = narrativeMd;

  // Extract in strip order: dates → codes → bare numbers.
  for (const d of remaining.match(ISO_DATE_RE) ?? []) {
    if (!sets.dates.has(d)) offending.push(d);
  }
  remaining = remaining.replace(ISO_DATE_RE, ' ');

  for (const c of remaining.match(CODE_RE) ?? []) {
    if (!sets.codes.has(c.toUpperCase())) offending.push(c);
  }
  remaining = remaining.replace(CODE_RE, ' ');

  for (const n of remaining.match(NUMBER_RE) ?? []) {
    if (!sets.numbers.has(numKey(n))) offending.push(n);
  }

  return {
    verdict: offending.length === 0 ? 'grounded' : 'ungrounded',
    ungroundedTokens: offending,
  };
}
