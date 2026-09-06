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
// period label + metric code} ∪ {the year components of a genuine academic-year
// range — '2026-27' also allows 2027, since prose and evidence spell the same
// academic year both ways}. Anything else → verdict 'ungrounded'.
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
// A FULL ISO-8601 timestamp (date + time, optional fraction + zone), matched
// and compared as ONE atomic token. Evidence metadata carries values like
// '2026-07-26T04:29:45.706507+00:00'; when the model quotes one verbatim the
// old strip order left the time behind ('T04:29:45.706507+00:00') and the bare
// -number pass then read '29' and '45.706507' as ungrounded figures. Treating
// the timestamp atomically is also STRICTER than the old behaviour: a
// fabricated timestamp is rejected whole instead of leaking matching fragments.
const ISO_TS_RE =
  /\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})?/g;
// ISO date next (so its digits are not later mis-read as bare numbers).
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
// An academic-year range: '2026-27' or '2026-2027'. The tail MUST be the
// successor year, which is what keeps this conservative — an ISO fragment like
// '2026-07' can never qualify (07 is not 27), so no arbitrary 4-digit number is
// blanket-allowed. Both the abbreviated and expanded components are then
// allowed, because prose legitimately writes the same academic year either way
// ('AY 2026-27' vs '2026-2027') and the BoS evidence rows store the expanded
// form while the period label carries the abbreviated one.
const ACADEMIC_YEAR_RE = /\b(\d{4})-(\d{2}|\d{4})\b/g;
// A "code" token contains BOTH a letter and a digit (e.g. MR3691, EDU101).
// Pure-numeric course codes (e.g. 383813) are intentionally treated as numbers
// and checked against the allowed-number set instead.
const CODE_RE = /\b(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]+\b/g;
// A bare number: integer or decimal, optional thousands commas.
const NUMBER_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
// A number-word compound: a leading number joined by a hyphen to a plain word
// ('3-year', '5-day', '2-fold'). The NUMBER is the only factual part — the word
// is a descriptor, not evidence — so we check the number and ignore the word,
// rather than letting CODE_RE flag the whole compound as an unaccounted code.
// A fabricated figure in this shape ('92-percent') is still caught, because its
// number is still checked against the allowed-number set.
const NUM_WORD_RE = /\b\d+(?:\.\d+)?-[A-Za-z]+\b/g;

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
  timestamps: Set<string>; // full ISO-8601, canonicalised
}

/** Canonical key for a full ISO timestamp: case-folded, and sub-second precision
 *  dropped so quoting '…T04:29:45+00:00' for an evidence value of
 *  '…T04:29:45.706507+00:00' still matches. Truncation is bounded to the
 *  fraction — a different second, minute, hour or zone is still a mismatch. */
function tsKey(raw: string): string {
  return raw.toUpperCase().replace(/\.\d+/, '');
}

/** Allow the year components of every genuine academic-year range in `text`.
 *  '2026-27' and '2026-2027' both yield {2026, 27, 2027}; a non-successor pair
 *  (e.g. the '2026-07' inside an ISO date) yields nothing. */
function collectAcademicYears(text: string, sets: AllowedSets): void {
  for (const m of text.matchAll(ACADEMIC_YEAR_RE)) {
    const start = Number.parseInt(m[1], 10);
    const tail = Number.parseInt(m[2], 10);
    const next = start + 1;
    const isAbbrev = m[2].length === 2 && tail === next % 100;
    const isExpanded = m[2].length === 4 && tail === next;
    if (!isAbbrev && !isExpanded) continue;
    sets.numbers.add(numKey(String(start)));
    sets.numbers.add(numKey(String(next)));
    sets.numbers.add(numKey(String(next % 100)));
  }
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
    // full ISO timestamp(s) → allowed as atomic tokens
    for (const t of value.match(ISO_TS_RE) ?? []) sets.timestamps.add(tsKey(t));
    // academic-year range(s) → allow both the abbreviated and expanded years
    collectAcademicYears(value, sets);
    // numeric-looking string → allowed number
    if (/^-?\d+(?:\.\d+)?$/.test(value.trim())) sets.numbers.add(numKey(value));
    // A number written INSIDE a free-text evidence value (e.g. the event name
    // 'Annual Cultural Day 2024 (Retro)') is a verbatim evidence value and must
    // be quotable. Date/time components are stripped FIRST so this never
    // re-opens the fragments ISO_TS_RE deliberately keeps atomic — a '29' that
    // only exists as the minutes of a timestamp stays ungrounded.
    const prose = value.replace(ISO_TS_RE, ' ').replace(ISO_DATE_RE, ' ');
    for (const n of prose.match(NUMBER_RE) ?? []) sets.numbers.add(numKey(n));
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

// A criterion/attribute REFERENCE — 'Attribute 7', 'Criterion 7.10',
// 'Metric 7.10.1'. Such a number names the metric being written about; it is a
// label, not a factual claim, so it must not be read as an unaccounted figure.
const CRITERION_REF_RE = /\b(?:attribute|criterion|criteria|metric|standard)s?\s+(\d+(?:\.\d+)*)/gi;

/** Remove criterion references whose number is a dotted PREFIX of the metric
 *  code under review, so 'Attribute 7' is not read as the bare number 7 in a
 *  7.10.1 narrative. Deliberately phrase-scoped and prefix-checked: the digits
 *  are dropped only inside such a phrase, so this can never make a metric-code
 *  digit quotable as a free-standing count ('3 papers were published' stays
 *  ungrounded under metric 3.2.1), and an unrelated reference such as
 *  'Criterion 6' is left in place to be flagged. */
function stripCriterionRefs(md: string, metricCode: string | undefined): string {
  if (!metricCode) return md;
  const parts = metricCode.split('.');
  const prefixes = new Set<string>();
  for (let i = 1; i <= parts.length; i++) prefixes.add(parts.slice(0, i).join('.'));
  return md.replace(CRITERION_REF_RE, (whole, num: string) =>
    prefixes.has(num) ? ' ' : whole,
  );
}

/** Add every number/code/date fragment of a free-text context string. */
function collectContext(text: string | undefined, sets: AllowedSets): void {
  if (!text) return;
  for (const t of text.match(ISO_TS_RE) ?? []) sets.timestamps.add(tsKey(t));
  for (const d of text.match(ISO_DATE_RE) ?? []) sets.dates.add(d);
  // e.g. period 'AY 2026-27' also allows the expanded 2027 / '2026-2027' form.
  collectAcademicYears(text, sets);
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
  const sets: AllowedSets = {
    numbers: new Set(),
    codes: new Set(),
    dates: new Set(),
    timestamps: new Set(),
  };

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
  // Drop 'Attribute 7' / 'Criterion 7.10' style references to THIS metric before
  // any token pass — they name the metric rather than assert a figure.
  let remaining = stripCriterionRefs(narrativeMd, context.metricCode);

  // Extract in strip order: full timestamps → dates → codes → bare numbers.
  // Timestamps go first so a verbatim-quoted evidence timestamp is never
  // shredded into its time fragments and re-read as unaccounted numbers.
  for (const t of remaining.match(ISO_TS_RE) ?? []) {
    if (!sets.timestamps.has(tsKey(t))) offending.push(t);
  }
  remaining = remaining.replace(ISO_TS_RE, ' ');

  for (const d of remaining.match(ISO_DATE_RE) ?? []) {
    if (!sets.dates.has(d)) offending.push(d);
  }
  remaining = remaining.replace(ISO_DATE_RE, ' ');

  // Number-word compounds ('3-year', '5-day') BEFORE codes: decompose to the
  // number and check that (the word is a descriptor, not evidence), so a
  // grounded descriptor passes while a fabricated figure in the same shape
  // ('92-percent') still fails on its number.
  for (const m of remaining.match(NUM_WORD_RE) ?? []) {
    const num = m.match(/^\d+(?:\.\d+)?/)![0];
    if (!sets.numbers.has(numKey(num))) offending.push(num);
  }
  remaining = remaining.replace(NUM_WORD_RE, ' ');

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
