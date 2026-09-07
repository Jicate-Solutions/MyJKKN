// lib/services/onemark/draft-contract.ts
// ============================================================================
// OneMark AI draft contract — PURE. No Supabase, no React, no Node built-ins.
//
// What the `onemark.item_draft` job's model output must satisfy before a
// single fp_items draft row is written. The prompt (Lane S job type, post
// Opus review) asks the model for items in the fp_items TABLE shape:
//   stem, stem_ta, options (4 strings), options_ta, answer {"correct":"A"},
//   explanation, explanation_ta, bloom_level (K1–K6), tags (tag keys),
//   option_layout
// and this file is the strict reader of that shape. It mirrors, deliberately
// by hand, the review queue's approve-rules (app/(routes)/foundation/onemark/
// review/_lib/approve-rules.ts, Lane I): four DISTINCT options keyed A–D,
// answer {correct:'A'..'D'} — a bare-string answer is REJECTED — bloom_level
// K1–K6 only (decision 6), a Tamil block for tn_hsc_physics (decision 5).
//
// The model is never trusted for identity or state: exam_definition_id and
// topic_id come from the job payload, is_active is always false, source_key
// is always 'internal', created_by is the requesting Senior Learner. An item
// that fails here is DROPPED and the reason recorded on the job — never
// written half-formed for a Senior Learner to discover on the review queue.
//
// Terminology: the people who approve are Senior Learners; the people who
// answer are learners. Rulings: specs/onemark-decisions-2026-09-02.md.
// ============================================================================

export const ONEMARK_DRAFT_JOB_TYPE = 'onemark.item_draft';

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];
export const BLOOM_LEVELS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];
export const OPTION_LAYOUTS = ['auto', 'inline_4', 'inline_2x2', 'stacked'] as const;
export type OptionLayout = (typeof OPTION_LAYOUTS)[number];

/** The payload Lane I's draft route enqueues (validated against the job
 *  type's input_schema before it reaches the lane). */
export interface DraftJobPayload {
  exam_definition_id: string;
  exam_key: string;
  topic_id: string | null;
  tag_keys: string[];
  count: number;
  bloom_level: BloomLevel;
}

/** One item, validated, in the shape the prompt asks for (fp_items columns). */
export interface DraftItem {
  stem: string;
  stem_ta: string | null;
  options: [string, string, string, string];
  options_ta: [string, string, string, string] | null;
  answer: { correct: OptionKey };
  explanation: string | null;
  explanation_ta: string | null;
  bloom_level: BloomLevel;
  tags: string[];
  option_layout: OptionLayout;
}

export interface RejectedItem {
  index: number;
  why: string;
  /** First 80 chars of the stem, so a reviewer can tell which one — never the answer. */
  stem_preview: string | null;
}

/** Flat (not a discriminated union): the repo runs strictNullChecks:false,
 *  under which a union would not narrow on `ok` — see remedial-plan-service. */
export interface ParsedDraftOutput {
  ok: boolean;
  items: unknown[];
  shortfall_reason: string | null;
  why: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lane I's route already validated this shape at enqueue; re-checking here
 *  keeps the runner honest when a job arrives from anywhere else. */
/** Build the ai_jobs payload for a drafting run.
 *
 *  The Max seat runner VALIDATES the job type's input_schema keys at the TOP
 *  LEVEL and SUBSTITUTES exactly one slot, {{prompt}}, from `payload.prompt`.
 *  It fills no other slot — measured 2026-09-06 across every working job type
 *  on the lane, and the hard way twice on this one: a flat payload left the
 *  template's {{payload}} slot empty and the model replied "I don't see the
 *  actual input payload" (ai_jobs 1096542b); an _ctx-only payload was refused
 *  before the model saw it, "missing required input(s)" (ai_jobs bbbf0cbc).
 *
 *  So the run's data is composed INTO the prompt text, and the same fields ride
 *  along under `_ctx` for the collect pass (parsePayload reads them there).
 *  Migration 20260918150000 makes the template and input_schema match this.
 */
export function buildDraftPayload(ctx: DraftJobPayload): {
  _ctx: DraftJobPayload;
  prompt: string;
} {
  return { _ctx: ctx, prompt: JSON.stringify(ctx, null, 2) };
}

export function parsePayload(raw: unknown): DraftJobPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const outer = raw as Record<string, unknown>;
  // The estate's Max-lane convention is payload._ctx: every working job type on
  // the lane (accreditation.naac_narrative_draft, ai_pulse.domain_starter,
  // learner.360_verdict, loops.charter_draft, improvement.rank_ideas,
  // induction.session_effectiveness) sends {_ctx: {...}, prompt: '...'} and the
  // seat runner substitutes _ctx into the template's {{payload}} slot. Lane I
  // originally sent its fields at the TOP level; the runner then rendered an
  // EMPTY payload slot and the model replied "I don't see the actual input
  // payload" (measured: ai_jobs 1096542b, 2026-09-06 06:09Z). Read _ctx when it
  // is there, fall back to the flat shape so any job queued before the route
  // change still files.
  const p =
    outer._ctx && typeof outer._ctx === 'object' && !Array.isArray(outer._ctx)
      ? (outer._ctx as Record<string, unknown>)
      : outer;
  const examDefinitionId = p.exam_definition_id;
  const examKey = p.exam_key;
  const topicId = p.topic_id ?? null;
  const tagKeys = p.tag_keys;
  const count = p.count;
  const bloomLevel = p.bloom_level;
  if (typeof examDefinitionId !== 'string' || !UUID_RE.test(examDefinitionId)) return null;
  if (typeof examKey !== 'string' || !examKey.trim()) return null;
  if (topicId !== null && (typeof topicId !== 'string' || !UUID_RE.test(topicId))) return null;
  if (!Array.isArray(tagKeys) || tagKeys.length === 0 || tagKeys.some((t) => typeof t !== 'string' || !t.trim())) {
    return null;
  }
  if (!Number.isInteger(count) || (count as number) < 1) return null;
  if (!(BLOOM_LEVELS as readonly string[]).includes(String(bloomLevel))) return null;
  return {
    exam_definition_id: examDefinitionId,
    exam_key: examKey,
    topic_id: topicId as string | null,
    tag_keys: Array.from(new Set(tagKeys as string[])),
    count: count as number,
    bloom_level: bloomLevel as BloomLevel,
  };
}

/** Strict JSON with the same tolerance the charter collector allows: a code
 *  fence or stray prose around the object (first '{' to last '}'). */
export function parseDraftOutput(text: string): ParsedDraftOutput {
  const candidates = [text, text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  let obj: Record<string, unknown> | null = null;
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
        break;
      }
    } catch {
      /* try the next shape */
    }
  }
  const bad = (why: string): ParsedDraftOutput => ({ ok: false, items: [], shortfall_reason: null, why });
  if (!obj) return bad('no parseable JSON object in the model output');
  if (!Array.isArray(obj.items)) return bad('output has no items[] array');
  const shortfall =
    typeof obj.shortfall_reason === 'string' && obj.shortfall_reason.trim()
      ? obj.shortfall_reason.trim()
      : null;
  return { ok: true, items: obj.items as unknown[], shortfall_reason: shortfall, why: null };
}

/** Same normalisation as approve-rules.ts `normaliseStem` / the ingest
 *  script (PRD B.3): NFC, underline markers removed, lowercase, punctuation
 *  to space, whitespace collapsed. Used for the duplicate guard. */
const UNDERLINE_MARKERS = /<\/?u>|__|(?<=\s|^)_(?=\S)|(?<=\S)_(?=\s|$|[.,;:!?])/g;
export function normaliseStem(text: string): string {
  return (text ?? '')
    .normalize('NFC')
    .replace(UNDERLINE_MARKERS, '')
    .toLowerCase()
    .replace(/\p{P}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BANNED_OPTION = /^(all|none)\s+of\s+the\s+above\.?$/i;

/** Four non-empty strings. A keyed form [{key,text}] is also accepted (the
 *  fp_items column shape) — the text is what is read, in array order. */
function fourStrings(v: unknown): [string, string, string, string] | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const out = v.map((x) => {
    if (typeof x === 'string') return x.trim();
    if (x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string') {
      return ((x as { text: string }).text ?? '').trim();
    }
    return '';
  });
  if (out.some((s) => !s)) return null;
  return out as [string, string, string, string];
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Flat for the same strictNullChecks reason as ParsedDraftOutput. */
export interface ValidationResult {
  ok: boolean;
  item: DraftItem | null;
  why: string | null;
}

/**
 * One raw model item → a DraftItem, or the reason it cannot be one.
 * `payload.exam_key` decides whether the Tamil block is mandatory (physics)
 * or optional (English items are English-only by design — decision 5).
 */
export function validateDraftItem(raw: unknown, payload: DraftJobPayload): ValidationResult {
  const no = (why: string): ValidationResult => ({ ok: false, item: null, why });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return no('item is not an object');
  const r = raw as Record<string, unknown>;

  const stem = str(r.stem);
  if (!stem) return no('missing stem');

  const options = fourStrings(r.options);
  if (!options) return no('options must be exactly four non-empty strings');
  const distinct = new Set(options.map((o) => o.toLowerCase()));
  if (distinct.size !== 4) return no('options are not four distinct options');
  if (options.some((o) => BANNED_OPTION.test(o))) return no('uses an "all/none of the above" option');

  // answer MUST be the fp_items shape {"correct":"A"}. A bare string is the
  // old contract and is refused, not coerced — the row must match what the
  // review queue and fn_onemark_record_response read.
  const a = r.answer;
  if (!a || typeof a !== 'object' || Array.isArray(a)) {
    return no('answer must be an object {"correct":"A".."D"}');
  }
  const correct = typeof (a as { correct?: unknown }).correct === 'string'
    ? (a as { correct: string }).correct.trim().toUpperCase()
    : '';
  if (!(OPTION_KEYS as readonly string[]).includes(correct)) {
    return no('answer.correct is not one of A, B, C, D');
  }

  const bloom = typeof r.bloom_level === 'string' ? r.bloom_level.trim().toUpperCase() : '';
  if (!(BLOOM_LEVELS as readonly string[]).includes(bloom)) {
    return no('bloom_level is not K1–K6 (decision 6: JABT K-dimension only)');
  }

  const tagsRaw = Array.isArray(r.tags) ? r.tags : typeof r.tags === 'string' ? [r.tags] : null;
  if (!tagsRaw || tagsRaw.length === 0) return no('tags must be a non-empty array of tag keys');
  const tags = Array.from(new Set(tagsRaw.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)));
  const unknown = tags.filter((t) => !payload.tag_keys.includes(t));
  if (tags.length === 0 || unknown.length > 0) {
    return no(`tags include a key that was not requested (${unknown.join(', ') || 'empty'}); allowed: ${payload.tag_keys.join(', ')}`);
  }

  const isPhysics = payload.exam_key === 'tn_hsc_physics';
  const stemTa = str(r.stem_ta);
  const optionsTa = r.options_ta == null ? null : fourStrings(r.options_ta);
  if (isPhysics) {
    if (!stemTa) return no('physics item has no Tamil stem (decision 5)');
    if (!optionsTa) return no('physics item has no four Tamil options (decision 5)');
  } else if (r.options_ta != null && !optionsTa) {
    return no('options_ta is present but is not four non-empty strings');
  }

  const layoutRaw = typeof r.option_layout === 'string' ? r.option_layout.trim() : 'auto';
  const layout: OptionLayout = (OPTION_LAYOUTS as readonly string[]).includes(layoutRaw)
    ? (layoutRaw as OptionLayout)
    : 'auto';

  return {
    ok: true,
    why: null,
    item: {
      stem,
      stem_ta: stemTa,
      options,
      options_ta: optionsTa,
      answer: { correct: correct as OptionKey },
      explanation: str(r.explanation),
      explanation_ta: str(r.explanation_ta),
      bloom_level: bloom as BloomLevel,
      tags,
      option_layout: layout,
    },
  };
}

/** The fp_items row — the SAME shape Lane I's ingest script writes (toRow in
 *  scripts/onemark/ingest-board-paper.ts), so both kinds of draft look
 *  identical on the review queue. Identity and state are SET here from the
 *  payload and the job, never read from the model: exam_definition_id,
 *  topic_id, is_active=false (decision 7), source_key='internal',
 *  created_by = the requesting Senior Learner. advanced_dimension stays NULL
 *  on every mcq_single row (JABT reachability matrix). */
export function toDraftRow(item: DraftItem, payload: DraftJobPayload, requestedBy: string | null) {
  const withKeys = (opts: [string, string, string, string]) =>
    opts.map((text, i) => ({ key: OPTION_KEYS[i], text }));
  return {
    exam_definition_id: payload.exam_definition_id,
    topic_id: payload.topic_id,
    q_type: 'mcq_single',
    stem: item.stem,
    stem_ta: item.stem_ta,
    options: withKeys(item.options),
    options_ta: item.options_ta ? withKeys(item.options_ta) : null,
    answer: { correct: item.answer.correct },
    explanation: item.explanation,
    explanation_ta: item.explanation_ta,
    source: 'ai_generated',
    is_active: false,
    option_layout: item.option_layout,
    tags: item.tags,
    source_key: 'internal',
    source_year: null,
    source_sitting: null,
    source_series: null,
    source_qno: null,
    bloom_level: item.bloom_level,
    advanced_dimension: null,
    created_by: requestedBy,
    updated_by: requestedBy,
  };
}

export interface ValidatedBatch {
  rows: ReturnType<typeof toDraftRow>[];
  rejected: RejectedItem[];
}

/**
 * Validate a whole model output against the payload, dropping duplicates
 * (within the batch and against `existingStems`, normalised) and anything
 * over `payload.count`. Deterministic; the collector and the tests share it.
 */
export function validateBatch(
  rawItems: unknown[],
  payload: DraftJobPayload,
  requestedBy: string | null,
  existingStems: Set<string>,
): ValidatedBatch {
  const rows: ValidatedBatch['rows'] = [];
  const rejected: RejectedItem[] = [];
  const seen = new Set<string>(existingStems);
  rawItems.forEach((raw, index) => {
    const preview =
      raw && typeof raw === 'object' && typeof (raw as { stem?: unknown }).stem === 'string'
        ? String((raw as { stem: string }).stem).slice(0, 80)
        : null;
    const v = validateDraftItem(raw, payload);
    if (!v.ok || !v.item) {
      rejected.push({ index, why: v.why ?? 'invalid item', stem_preview: preview });
      return;
    }
    const key = normaliseStem(v.item.stem);
    if (seen.has(key)) {
      rejected.push({ index, why: 'duplicate stem (already in the bank or earlier in this batch)', stem_preview: preview });
      return;
    }
    if (rows.length >= payload.count) {
      rejected.push({ index, why: `over the requested count (${payload.count})`, stem_preview: preview });
      return;
    }
    seen.add(key);
    rows.push(toDraftRow(v.item, payload, requestedBy));
  });
  return { rows, rejected };
}
