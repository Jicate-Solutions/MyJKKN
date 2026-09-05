// lib/services/onemark/draft-contract.ts
// ============================================================================
// OneMark AI draft contract — PURE. No Supabase, no React, no Node built-ins.
//
// What the `onemark.item_draft` job's model output must satisfy before a
// single fp_items draft row is written. Mirrors, deliberately by hand, the
// review queue's approve-rules (app/(routes)/foundation/onemark/review/_lib/
// approve-rules.ts, Lane I): options [{key,text}] with four DISTINCT keys A–D,
// answer {correct:'A'..'D'}, bloom_level K1–K6 only (decision 6), a Tamil stem
// for tn_hsc_physics (decision 5). An item that fails here is DROPPED and the
// reason recorded on the job — never written half-formed for a Senior Learner
// to discover on the review queue.
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

/** One item exactly as the prompt asks the model to return it. */
export interface DraftItem {
  stem_en: string;
  stem_ta: string | null;
  options_en: [string, string, string, string];
  options_ta: [string, string, string, string] | null;
  answer: OptionKey;
  explanation_en: string | null;
  explanation_ta: string | null;
  bloom_level: BloomLevel;
  tag_key: string;
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
export function parsePayload(raw: unknown): DraftJobPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
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

function fourStrings(v: unknown): [string, string, string, string] | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const out = v.map((x) => (typeof x === 'string' ? x.trim() : ''));
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
 * `examKey` decides whether the Tamil block is mandatory (physics) or optional
 * (English items are English-only by design — approve-rules, decision 5).
 */
export function validateDraftItem(raw: unknown, payload: DraftJobPayload): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, item: null, why: 'item is not an object' };
  }
  const r = raw as Record<string, unknown>;

  const stemEn = str(r.stem_en);
  if (!stemEn) return { ok: false, item: null, why: 'missing stem_en' };

  const optionsEn = fourStrings(r.options_en);
  if (!optionsEn) return { ok: false, item: null, why: 'options_en must be exactly four non-empty strings' };
  const distinct = new Set(optionsEn.map((o) => o.toLowerCase()));
  if (distinct.size !== 4) return { ok: false, item: null, why: 'options_en are not four distinct options' };
  if (optionsEn.some((o) => BANNED_OPTION.test(o))) {
    return { ok: false, item: null, why: 'uses an "all/none of the above" option' };
  }

  const answer = typeof r.answer === 'string' ? r.answer.trim().toUpperCase() : '';
  if (!(OPTION_KEYS as readonly string[]).includes(answer)) {
    return { ok: false, item: null, why: 'answer is not one of A, B, C, D' };
  }

  const bloom = typeof r.bloom_level === 'string' ? r.bloom_level.trim().toUpperCase() : '';
  if (!(BLOOM_LEVELS as readonly string[]).includes(bloom)) {
    return { ok: false, item: null, why: 'bloom_level is not K1–K6 (decision 6: JABT K-dimension only)' };
  }

  const tagKey = str(r.tag_key);
  if (!tagKey || !payload.tag_keys.includes(tagKey)) {
    return { ok: false, item: null, why: `tag_key is not one of the requested tags (${payload.tag_keys.join(', ')})` };
  }

  const isPhysics = payload.exam_key === 'tn_hsc_physics';
  const stemTa = str(r.stem_ta);
  const optionsTa = r.options_ta == null ? null : fourStrings(r.options_ta);
  if (isPhysics) {
    if (!stemTa) return { ok: false, item: null, why: 'physics item has no Tamil stem (decision 5)' };
    if (!optionsTa) return { ok: false, item: null, why: 'physics item has no four Tamil options (decision 5)' };
  } else if (r.options_ta != null && !optionsTa) {
    return { ok: false, item: null, why: 'options_ta is present but is not four non-empty strings' };
  }

  const layoutRaw = typeof r.option_layout === 'string' ? r.option_layout.trim() : 'auto';
  const layout: OptionLayout = (OPTION_LAYOUTS as readonly string[]).includes(layoutRaw)
    ? (layoutRaw as OptionLayout)
    : 'auto';

  return {
    ok: true,
    why: null,
    item: {
      stem_en: stemEn,
      stem_ta: stemTa,
      options_en: optionsEn,
      options_ta: optionsTa,
      answer: answer as OptionKey,
      explanation_en: str(r.explanation_en),
      explanation_ta: str(r.explanation_ta),
      bloom_level: bloom as BloomLevel,
      tag_key: tagKey,
      option_layout: layout,
    },
  };
}

/** The fp_items row — the SAME shape Lane I's ingest script writes (toRow in
 *  scripts/onemark/ingest-board-paper.ts), so both kinds of draft look
 *  identical on the review queue. is_active=false always (decision 7); the
 *  requesting Senior Learner is created_by; advanced_dimension stays NULL on
 *  every mcq_single row (JABT reachability matrix). */
export function toDraftRow(item: DraftItem, payload: DraftJobPayload, requestedBy: string | null) {
  const withKeys = (opts: [string, string, string, string]) =>
    opts.map((text, i) => ({ key: OPTION_KEYS[i], text }));
  return {
    exam_definition_id: payload.exam_definition_id,
    topic_id: payload.topic_id,
    q_type: 'mcq_single',
    stem: item.stem_en,
    stem_ta: item.stem_ta,
    options: withKeys(item.options_en),
    options_ta: item.options_ta ? withKeys(item.options_ta) : null,
    answer: { correct: item.answer },
    explanation: item.explanation_en,
    explanation_ta: item.explanation_ta,
    source: 'ai_generated',
    is_active: false,
    option_layout: item.option_layout,
    tags: [item.tag_key],
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
      raw && typeof raw === 'object' && typeof (raw as any).stem_en === 'string'
        ? String((raw as any).stem_en).slice(0, 80)
        : null;
    const v = validateDraftItem(raw, payload);
    if (!v.ok || !v.item) {
      rejected.push({ index, why: v.why ?? 'invalid item', stem_preview: preview });
      return;
    }
    const key = normaliseStem(v.item.stem_en);
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
