// lib/services/onemark/paper-service.ts
//
// OneMark — the Senior Learner's paper wizard (PRD §3), Wave 2 Lane W.
//
// Two halves, deliberately in one file so the browser and the API route share
// one vocabulary:
//   1. PURE selection logic — filtering, the JABT level mix (decision 6), the
//      English board shape (decision 15), shortfall (decision 11), lock survival
//      (decision 12), swap candidates, copy-on-write overrides (decision 14).
//      No I/O, no supabase client, deterministic under a seed, unit-testable.
//   2. PaperService — a thin fetch client over /api/foundation/onemark/paper.
//      The API route is where identity, permissions and the answer-key boundary
//      live; nothing here ever touches fp_items directly.
//
// Rulings of record: specs/onemark-decisions-2026-09-02.md.

import type { OneMarkOptionLayout } from '@/types/onemark';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type PaperState = 'DRAFT' | 'PREVIEW' | 'EDITED' | 'FINALIZED';
export type PaperStep = 1 | 2 | 3 | 4 | 5;
export type SelectionMode = 'generate' | 'manual';
export type DistributionMode = 'proportional' | 'equal';
export type PreviewLanguage = 'ta' | 'en' | 'both';

/** JABT K levels — the only difficulty axis OneMark uses (decision 6). */
export const JABT_LEVELS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as const;
export type JabtLevel = (typeof JABT_LEVELS)[number];
/** fp_items.bloom_level is NULL until a reviewer levels the item. Such items are
 *  shown as their own bucket rather than silently dropped. */
export const UNLEVELLED = 'unlevelled' as const;
export type LevelKey = JabtLevel | typeof UNLEVELLED;
export const LEVEL_KEYS: readonly LevelKey[] = [...JABT_LEVELS, UNLEVELLED];
export type LevelMix = Record<LevelKey, number>;

export const JABT_LEVEL_LABELS: Record<LevelKey, string> = {
  K1: 'K1 Remembering',
  K2: 'K2 Understanding',
  K3: 'K3 Applying',
  K4: 'K4 Analysing',
  K5: 'K5 Evaluating',
  K6: 'K6 Creating',
  unlevelled: 'Not yet levelled',
};

/** English board shape (PRD English §4.2, decision 15). */
export const BOARD_SHAPE_QUESTION_COUNT = 20;
export const BOARD_SHAPE_SLOTS = [
  { tag: 'synonyms', from: 1, to: 3 },
  { tag: 'antonyms', from: 4, to: 6 },
] as const;
export const QUANTITY_PRESETS = [10, 15, 20, 25, 50] as const;
export const SERIES_LETTERS = ['A', 'B', 'C', 'D'] as const;

export interface PaperParams {
  selection_mode: SelectionMode;
  /** cdc_exam_syllabus_topics ids; empty = every chapter. Items with topic_id
   *  NULL (chapter-agnostic English grammar) are never excluded by this. */
  topic_ids: string[];
  /** onemark_item_tags keys; empty = any tag. */
  tag_keys: string[];
  /** onemark_item_sources keys; empty = any source. */
  source_keys: string[];
  year_from: number | null;
  year_to: number | null;
  /** Exclude items used in the last N finalized papers of this subject; 0 = off. */
  exclude_recent_papers: number;
  question_count: number;
  level_mix: LevelMix;
  distribution_mode: DistributionMode;
  board_shape: boolean;
  series_count: number;
  preview_language: PreviewLanguage;
}

/** Decision 14 — edits live on the paper, never on fp_items. */
export interface QuestionOverride {
  stem?: string;
  stem_ta?: string | null;
  options?: string[];
  options_ta?: string[] | null;
}

export interface PaperOutput {
  open_at: string | null;
  close_at: string | null;
  duration_min: number | null;
  shuffle_options: boolean;
  published_at: string | null;
}

export interface Shortfall {
  requested: number;
  available: number;
}

/** Everything the wizard persists into fp_assessments.config. */
export interface PaperConfig {
  onemark: true;
  state: PaperState;
  step: PaperStep;
  params: PaperParams;
  seed: string;
  selected_ids: string[];
  locked_ids: string[];
  question_overrides: Record<string, QuestionOverride>;
  shortfall: Shortfall | null;
  output: PaperOutput | null;
  finalized_at: string | null;
}

/** An fp_items row as the API hands it to the browser. `answer` is present
 *  ONLY for a holder of foundation.items.manage. */
export interface BankItem {
  id: string;
  topic_id: string | null;
  stem: string;
  stem_ta: string | null;
  options: string[];
  options_ta: string[] | null;
  bloom_level: JabtLevel | null;
  tags: string[];
  source_key: string | null;
  source_year: number | null;
  times_served: number;
  option_layout: OneMarkOptionLayout;
  explanation: string | null;
  explanation_ta: string | null;
  answer?: unknown;
}

export interface BankTopic {
  id: string;
  config_key: string;
  display_name: string;
  description: string | null;
  sort_order: number;
}

export interface BankTag {
  key: string;
  label: string;
  subject_exam_definition_id: string | null;
}

export interface BankSource {
  key: string;
  label: string;
}

export interface BankWeight {
  tag_key: string;
  weight: number;
}

export interface RecentPaper {
  id: string;
  title: string;
  finalized_at: string | null;
  item_ids: string[];
}

export interface BankCohort {
  id: string;
  term: string | null;
  school_name: string | null;
}

export interface PaperPolicies {
  question_count: number;
  max_series: number;
  timed_default_minutes: number;
}

export interface PaperExam {
  id: string;
  config_key: string;
  display_name: string;
}

export interface PaperBank {
  exam: PaperExam;
  topics: BankTopic[];
  tags: BankTag[];
  sources: BankSource[];
  weights: BankWeight[];
  items: BankItem[];
  recent_papers: RecentPaper[];
  cohorts: BankCohort[];
  policies: PaperPolicies;
  can_see_answers: boolean;
}

export interface PaperRow {
  id: string;
  exam_definition_id: string;
  cohort_id: string | null;
  title: string;
  kind: 'mock';
  config: PaperConfig;
  created_at: string;
  updated_at: string;
  item_count: number;
  exam?: PaperExam;
}

// ---------------------------------------------------------------------------
// Deterministic randomness — the seed lives in config so "Regenerate" with the
// same scope reproduces the same paper, and a new seed is a deliberate act.
// ---------------------------------------------------------------------------

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 — small, seedable, good enough to shuffle a question bank. */
export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function shuffled<T>(list: T[], rng: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function levelOf(item: Pick<BankItem, 'bloom_level'>): LevelKey {
  return item.bloom_level ?? UNLEVELLED;
}

export function emptyMix(): LevelMix {
  return { K1: 0, K2: 0, K3: 0, K4: 0, K5: 0, K6: 0, unlevelled: 0 };
}

export function mixTotal(mix: LevelMix): number {
  return LEVEL_KEYS.reduce((sum, k) => sum + (mix[k] ?? 0), 0);
}

/** Scale a set of per-level pool counts to `total` by largest remainder, so
 *  the default mix is "the same shape as the pool" (spec: default proportional). */
export function proportionalMix(items: Pick<BankItem, 'bloom_level'>[], total: number): LevelMix {
  const counts = emptyMix();
  for (const it of items) counts[levelOf(it)] += 1;
  const pool = mixTotal(counts);
  const mix = emptyMix();
  if (pool === 0 || total <= 0) return mix;
  const target = Math.min(total, pool);
  const remainders: { k: LevelKey; r: number }[] = [];
  let assigned = 0;
  for (const k of LEVEL_KEYS) {
    const exact = (counts[k] / pool) * target;
    const floor = Math.floor(exact);
    mix[k] = Math.min(floor, counts[k]);
    assigned += mix[k];
    remainders.push({ k, r: exact - floor });
  }
  remainders.sort((a, b) => b.r - a.r);
  for (const { k } of remainders) {
    if (assigned >= target) break;
    if (mix[k] < counts[k]) {
      mix[k] += 1;
      assigned += 1;
    }
  }
  return mix;
}

export function defaultParams(examKey: string, policies: PaperPolicies): PaperParams {
  const boardShape = examKey === 'tn_hsc_english';
  return {
    selection_mode: 'generate',
    topic_ids: [],
    tag_keys: [],
    source_keys: [],
    year_from: null,
    year_to: null,
    exclude_recent_papers: 3,
    question_count: boardShape ? BOARD_SHAPE_QUESTION_COUNT : policies.question_count,
    level_mix: emptyMix(),
    distribution_mode: 'proportional',
    board_shape: boardShape,
    series_count: 1,
    preview_language: 'both',
  };
}

export function newConfig(params: PaperParams): PaperConfig {
  return {
    onemark: true,
    state: 'DRAFT',
    step: 1,
    params,
    seed: newSeed(),
    selected_ids: [],
    locked_ids: [],
    question_overrides: {},
    shortfall: null,
    output: null,
    finalized_at: null,
  };
}

/** A config read back from the database may predate a field; fill the gaps
 *  rather than crash the wizard on an older draft. */
export function normaliseConfig(raw: unknown, examKey: string, policies: PaperPolicies): PaperConfig {
  const base = newConfig(defaultParams(examKey, policies));
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<PaperConfig>;
  const params = { ...base.params, ...(c.params ?? {}) } as PaperParams;
  params.level_mix = { ...emptyMix(), ...(params.level_mix ?? {}) };
  return {
    ...base,
    ...c,
    onemark: true,
    params,
    selected_ids: Array.isArray(c.selected_ids) ? c.selected_ids : [],
    locked_ids: Array.isArray(c.locked_ids) ? c.locked_ids : [],
    question_overrides: c.question_overrides ?? {},
    seed: c.seed ?? base.seed,
  };
}

// ---------------------------------------------------------------------------
// Filtering — the scope step
// ---------------------------------------------------------------------------

/** Item ids used in the last N finalized papers (exclude-recent-tests). */
export function recentlyUsedIds(recent: RecentPaper[], lastN: number): Set<string> {
  const out = new Set<string>();
  if (lastN <= 0) return out;
  for (const paper of recent.slice(0, lastN)) {
    for (const id of paper.item_ids) out.add(id);
  }
  return out;
}

export function filterBank(items: BankItem[], params: PaperParams, recentIds: Set<string>): BankItem[] {
  const topics = new Set(params.topic_ids);
  const tags = new Set(params.tag_keys);
  const sources = new Set(params.source_keys);
  return items.filter((it) => {
    // Chapter scope. PRD §4.4 / spec: a chapter-agnostic item (topic_id NULL)
    // is never excluded by a chapter filter.
    if (topics.size > 0 && it.topic_id !== null && !topics.has(it.topic_id)) return false;
    if (tags.size > 0 && !it.tags.some((t) => tags.has(t))) return false;
    if (sources.size > 0 && (it.source_key === null || !sources.has(it.source_key))) return false;
    // Year range only bites on items that carry a year; an authored item has
    // no board year and stays in scope.
    if (it.source_year !== null) {
      if (params.year_from !== null && it.source_year < params.year_from) return false;
      if (params.year_to !== null && it.source_year > params.year_to) return false;
    }
    if (recentIds.has(it.id)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Generation — the preview step
// ---------------------------------------------------------------------------

export interface GenerateInput {
  /** The bank after filterBank. */
  pool: BankItem[];
  /** Every item of the subject, so a locked item that fell out of the filter
   *  can still be placed (decision 12). */
  byId: Map<string, BankItem>;
  params: PaperParams;
  lockedIds: string[];
  weights: BankWeight[];
  seed: string;
}

export interface GenerateResult {
  selected_ids: string[];
  shortfall: Shortfall | null;
}

/** Take up to `n` items from `candidates` (already excluding selected ones),
 *  preferring an item whose level still has quota, least-served first, ties
 *  broken by the seeded order. Mutates `quota` and `taken`. */
function take(
  candidates: BankItem[],
  n: number,
  quota: LevelMix,
  taken: Set<string>,
  rng: () => number,
): BankItem[] {
  if (n <= 0) return [];
  const ordered = shuffled(candidates.filter((c) => !taken.has(c.id)), rng).sort(
    (a, b) => a.times_served - b.times_served,
  );
  const picked: BankItem[] = [];
  // Pass 1 — honour the level mix.
  for (const it of ordered) {
    if (picked.length >= n) break;
    const k = levelOf(it);
    if (quota[k] > 0) {
      quota[k] -= 1;
      taken.add(it.id);
      picked.push(it);
    }
  }
  // Pass 2 — the mix cannot be met from this slice; fill with what exists
  // rather than leave a hole (the mix is a target, the count is the promise).
  for (const it of ordered) {
    if (picked.length >= n) break;
    if (taken.has(it.id)) continue;
    taken.add(it.id);
    picked.push(it);
  }
  return picked;
}

function groupByTopic(items: BankItem[]): Map<string, BankItem[]> {
  const groups = new Map<string, BankItem[]>();
  for (const it of items) {
    const key = it.topic_id ?? '__general__';
    const list = groups.get(key) ?? [];
    list.push(it);
    groups.set(key, list);
  }
  return groups;
}

/** Split `n` across chapter groups — proportional to each group's pool
 *  (largest remainder) or as equal as the pools allow. Never more than a group
 *  holds. */
function chapterTargets(groups: Map<string, BankItem[]>, n: number, mode: DistributionMode): Map<string, number> {
  const keys = Array.from(groups.keys());
  const sizes = keys.map((k) => groups.get(k)!.length);
  const pool = sizes.reduce((a, b) => a + b, 0);
  const target = new Map<string, number>();
  if (pool === 0 || n <= 0) return target;
  const want = Math.min(n, pool);
  if (mode === 'equal') {
    keys.forEach((k) => target.set(k, 0));
    let left = want;
    let progress = true;
    while (left > 0 && progress) {
      progress = false;
      for (let i = 0; i < keys.length && left > 0; i++) {
        if ((target.get(keys[i]) ?? 0) < sizes[i]) {
          target.set(keys[i], (target.get(keys[i]) ?? 0) + 1);
          left -= 1;
          progress = true;
        }
      }
    }
    return target;
  }
  let assigned = 0;
  const rem: { k: string; r: number; cap: number }[] = [];
  keys.forEach((k, i) => {
    const exact = (sizes[i] / pool) * want;
    const floor = Math.min(Math.floor(exact), sizes[i]);
    target.set(k, floor);
    assigned += floor;
    rem.push({ k, r: exact - floor, cap: sizes[i] });
  });
  rem.sort((a, b) => b.r - a.r);
  for (const { k, cap } of rem) {
    if (assigned >= want) break;
    if ((target.get(k) ?? 0) < cap) {
      target.set(k, (target.get(k) ?? 0) + 1);
      assigned += 1;
    }
  }
  return target;
}

/** Weighted draw of a tag key among those with remaining candidates. */
function drawTag(tagPools: Map<string, BankItem[]>, weights: Map<string, number>, taken: Set<string>, rng: () => number): string | null {
  const live: { tag: string; w: number }[] = [];
  for (const [tag, list] of tagPools) {
    if (list.some((it) => !taken.has(it.id))) live.push({ tag, w: weights.get(tag) ?? 1 });
  }
  if (live.length === 0) return null;
  const total = live.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const x of live) {
    r -= x.w;
    if (r <= 0) return x.tag;
  }
  return live[live.length - 1].tag;
}

/** Generate a paper. Locked items always survive (decision 12); the paper is
 *  never padded past what the scope holds (decision 11). */
export function generatePaper(input: GenerateInput): GenerateResult {
  const { pool, byId, params, lockedIds, weights, seed } = input;
  const rng = seededRandom(seed);
  const requested = Math.max(0, params.question_count);
  const quota: LevelMix = { ...params.level_mix };
  const taken = new Set<string>();

  const locked = lockedIds.map((id) => byId.get(id)).filter((x): x is BankItem => Boolean(x));
  for (const it of locked) {
    taken.add(it.id);
    const k = levelOf(it);
    if (quota[k] > 0) quota[k] -= 1;
  }

  let ordered: BankItem[] = [];

  if (params.board_shape) {
    // Reserved slots first, then the weighted pool for the rest (PRD §4.2/§4.3).
    const slotItems: BankItem[][] = [];
    const lockedLeft = new Set(locked.map((l) => l.id));
    for (const slot of BOARD_SHAPE_SLOTS) {
      const size = slot.to - slot.from + 1;
      const pre = locked.filter((l) => lockedLeft.has(l.id) && l.tags.includes(slot.tag)).slice(0, size);
      pre.forEach((p) => lockedLeft.delete(p.id));
      const cands = pool.filter((it) => it.tags.includes(slot.tag));
      const picked = [...pre, ...take(cands, size - pre.length, quota, taken, rng)];
      slotItems.push(picked);
    }
    const reservedCount = BOARD_SHAPE_SLOTS.reduce((s, x) => s + (x.to - x.from + 1), 0);
    const remainingLocked = locked.filter((l) => lockedLeft.has(l.id));
    const poolWant = requested - reservedCount - remainingLocked.length;
    const reservedTags = new Set<string>(BOARD_SHAPE_SLOTS.map((s) => s.tag));
    const weightMap = new Map(weights.map((w) => [w.tag_key, Number(w.weight)]));
    const tagPools = new Map<string, BankItem[]>();
    for (const it of pool) {
      for (const t of it.tags) {
        if (reservedTags.has(t)) continue;
        const list = tagPools.get(t) ?? [];
        list.push(it);
        tagPools.set(t, list);
      }
    }
    // Untagged items can still fill the pool as a last resort.
    const untagged = pool.filter((it) => it.tags.length === 0 || it.tags.every((t) => reservedTags.has(t)));
    const poolPicked: BankItem[] = [];
    let guard = 0;
    while (poolPicked.length < poolWant && guard++ < 10000) {
      const tag = drawTag(tagPools, weightMap, taken, rng);
      if (!tag) break;
      const got = take(tagPools.get(tag) ?? [], 1, quota, taken, rng);
      if (got.length === 0) break;
      poolPicked.push(got[0]);
    }
    if (poolPicked.length < poolWant) {
      poolPicked.push(...take(untagged, poolWant - poolPicked.length, quota, taken, rng));
    }
    ordered = [...slotItems.flat(), ...remainingLocked, ...poolPicked];
  } else {
    const want = requested - locked.length;
    const groups = groupByTopic(pool.filter((it) => !taken.has(it.id)));
    const targets = chapterTargets(groups, want, params.distribution_mode);
    const picked: BankItem[] = [];
    for (const [key, list] of groups) {
      picked.push(...take(list, targets.get(key) ?? 0, quota, taken, rng));
    }
    // A chapter may hold fewer than its share; top up from anywhere in scope
    // (least-served first) so the shortfall is real, not an artefact of the split.
    if (picked.length < want) {
      picked.push(...take(pool, want - picked.length, quota, taken, rng));
    }
    // Keep the previously generated order for locked items where we can:
    // locked first, in lock order, then the new picks in chapter order.
    const topicOrder = new Map<string, number>();
    let i = 0;
    for (const key of groups.keys()) topicOrder.set(key, i++);
    picked.sort((a, b) => (topicOrder.get(a.topic_id ?? '__general__') ?? 0) - (topicOrder.get(b.topic_id ?? '__general__') ?? 0));
    ordered = [...locked, ...picked];
  }

  const selected_ids = ordered.slice(0, Math.max(requested, locked.length)).map((it) => it.id);
  const shortfall: Shortfall | null =
    selected_ids.length < requested ? { requested, available: selected_ids.length } : null;
  return { selected_ids, shortfall };
}

// ---------------------------------------------------------------------------
// Preview-step helpers
// ---------------------------------------------------------------------------

export interface BoardShapeBand {
  /** Tag of the reserved slot, or 'pool' for Q7–20. */
  tag: string;
  /** 1-based positions on the paper this band actually occupies (from > to = empty). */
  from: number;
  to: number;
  /** How many the board shape wants in this band. */
  want: number;
}

/** Where each board-shape band actually sits on a generated paper. Read off
 *  the paper itself rather than fixed positions, so an under-filled reserved
 *  slot (only two synonyms in scope) shows as "Q1–2 · synonyms · 2 of 3"
 *  instead of borrowing the next question's number. */
export function boardShapeBands(items: Pick<BankItem, 'tags'>[], total: number): BoardShapeBand[] {
  const bands: BoardShapeBand[] = [];
  let cursor = 0;
  for (const slot of BOARD_SHAPE_SLOTS) {
    const want = slot.to - slot.from + 1;
    let n = 0;
    while (n < want && cursor + n < items.length && items[cursor + n].tags.includes(slot.tag)) n += 1;
    bands.push({ tag: slot.tag, from: cursor + 1, to: cursor + n, want });
    cursor += n;
  }
  const reserved = bands.reduce((s, b) => s + b.want, 0);
  bands.push({ tag: 'pool', from: cursor + 1, to: items.length, want: Math.max(0, total - reserved) });
  return bands;
}

/** Locked items that no longer match the scope — kept, but flagged (decision 12). */
export function lockedOutsideScope(lockedIds: string[], pool: BankItem[]): Set<string> {
  const inScope = new Set(pool.map((p) => p.id));
  return new Set(lockedIds.filter((id) => !inScope.has(id)));
}

/** Swap holds chapter + tag + level constant: same topic, same JABT level,
 *  at least one shared tag (or both untagged), not already on the paper. */
export function swapCandidates(item: BankItem, pool: BankItem[], selectedIds: string[]): BankItem[] {
  const onPaper = new Set(selectedIds);
  return pool.filter((c) => {
    if (c.id === item.id || onPaper.has(c.id)) return false;
    if (c.topic_id !== item.topic_id) return false;
    if (levelOf(c) !== levelOf(item)) return false;
    if (item.tags.length === 0) return c.tags.length === 0;
    return c.tags.some((t) => item.tags.includes(t));
  });
}

export function swapDisabledReason(item: BankItem, pool: BankItem[], selectedIds: string[]): string | null {
  if (swapCandidates(item, pool, selectedIds).length > 0) return null;
  const level = JABT_LEVEL_LABELS[levelOf(item)];
  const tag = item.tags[0] ? ` tagged ${item.tags[0]}` : '';
  return `No other ${level} question${tag} in this chapter is left to swap in.`;
}

/** The item as the paper shows it — the master row with this paper's edits
 *  laid over it (decision 14). */
export function applyOverride(item: BankItem, override: QuestionOverride | undefined): BankItem {
  if (!override) return item;
  return {
    ...item,
    stem: override.stem ?? item.stem,
    stem_ta: override.stem_ta === undefined ? item.stem_ta : override.stem_ta,
    options: override.options ?? item.options,
    options_ta: override.options_ta === undefined ? item.options_ta : override.options_ta,
  };
}

export function optionLetter(index: number): string {
  return String.fromCharCode(97 + index);
}

/** Series letters offered for the paper, capped by policy. */
export function seriesLetters(count: number, maxSeries: number): string[] {
  const n = Math.max(1, Math.min(count, maxSeries, SERIES_LETTERS.length));
  return SERIES_LETTERS.slice(0, n) as unknown as string[];
}

// ---------------------------------------------------------------------------
// Fetch client
// ---------------------------------------------------------------------------

const BASE = '/api/foundation/onemark/paper';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error ?? `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export interface CreatePaperInput {
  exam_definition_id: string;
  title: string;
  config: PaperConfig;
}

export interface UpdatePaperInput {
  title?: string;
  config?: PaperConfig;
  cohort_id?: string | null;
  finalize?: boolean;
}

export class PaperService {
  /** The two OneMark subjects the wizard can build for. */
  static listExams(): Promise<{ exams: PaperExam[] }> {
    return call(`${BASE}?exams=1`);
  }

  static listPapers(examDefinitionId?: string): Promise<{ papers: PaperRow[] }> {
    const q = examDefinitionId ? `&exam=${encodeURIComponent(examDefinitionId)}` : '';
    return call(`${BASE}?list=1${q}`);
  }

  static getBank(examDefinitionId: string): Promise<PaperBank> {
    return call(`${BASE}?exam=${encodeURIComponent(examDefinitionId)}`);
  }

  static createPaper(input: CreatePaperInput): Promise<{ paper: PaperRow }> {
    return call(BASE, { method: 'POST', body: JSON.stringify(input) });
  }

  static getPaper(id: string): Promise<{ paper: PaperRow }> {
    return call(`${BASE}/${encodeURIComponent(id)}`);
  }

  static updatePaper(id: string, input: UpdatePaperInput): Promise<{ paper: PaperRow }> {
    return call(`${BASE}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  static deletePaper(id: string): Promise<{ ok: true }> {
    return call(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}
