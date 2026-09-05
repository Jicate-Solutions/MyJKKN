// lib/services/onemark/paper-service.ts
//
// OneMark — the Senior Learner's paper wizard (PRD §3, decisions 6 / 11 / 12 /
// 14 / 15 / 16 of specs/onemark-decisions-2026-09-02.md).
//
// Three things live here, deliberately in one file so the route and the
// browser agree on every shape:
//   1. the wizard's parameter object and the fp_assessments.config it is
//      persisted into (PRD §3.3, with decision 6: a JABT level mix, never a
//      three-step difficulty scale);
//   2. the PURE selection engine — generate, swap, lock-warnings — written
//      over plain arrays so it runs on the server and under vitest with no
//      database (PRD §8.1 / §8.2, translated from the SQLite draft);
//   3. `PaperService`, the thin fetch wrapper the hooks call. The browser
//      never reads fp_items directly: the API route is where the answer key
//      is projected — to a paper builder (assessments.manage, ruling
//      2026-09-05), never to a learner.
//
// Nothing here imports supabase. That is what keeps (2) testable.

import type { OneMarkOptionLayout } from '@/types/onemark';

// ---------------------------------------------------------------------------
// Parameters (PRD §3.3) and persisted config
// ---------------------------------------------------------------------------

export type SelectionMode = 'single' | 'multi' | 'unit' | 'volume' | 'full_syllabus';
export type DistributionMode = 'proportional' | 'equal_per_chapter' | 'manual';
export type PreviewLanguage = 'ta' | 'en' | 'both';

/** JABT knowledge levels (decision 6). `unlevelled` is the honest bucket for an
 *  approved item whose reviewer has not yet set fp_items.bloom_level — it is
 *  NOT a difficulty and is shown as such. */
export type JabtLevel = 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6';
export const JABT_LEVELS: JabtLevel[] = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
export const UNLEVELLED = 'unlevelled' as const;
export type LevelKey = JabtLevel | typeof UNLEVELLED;
export const LEVEL_KEYS: LevelKey[] = [...JABT_LEVELS, UNLEVELLED];

export const JABT_LEVEL_LABELS: Record<LevelKey, string> = {
  K1: 'K1 · Remember',
  K2: 'K2 · Understand',
  K3: 'K3 · Apply',
  K4: 'K4 · Analyse',
  K5: 'K5 · Evaluate',
  K6: 'K6 · Create',
  unlevelled: 'Not yet levelled',
};

export type PaperState = 'DRAFT' | 'PREVIEW' | 'EDITED' | 'FINALIZED';
export type WizardStep = 1 | 2 | 3 | 4 | 5;

export const QUANTITY_PRESETS = [10, 15, 20, 25, 50] as const;
export const MAX_POOL = 'max_pool' as const;

/** The whole PRD §3.3 parameter object, with decision 6 applied. */
export interface PaperParams {
  selection_mode: SelectionMode;
  /** cdc_exam_syllabus_topics ids in scope. Empty = every chapter of the exam. */
  chapter_ids: string[];
  /** onemark_item_tags keys. Empty = every tag. */
  tag_keys: string[];
  /** onemark_item_sources keys. Empty = every source, including items with no source recorded. */
  source_keys: string[];
  year_from: number | null;
  year_to: number | null;
  /** 0..10 — this Senior Learner's most recent papers on the same exam whose items are suppressed. */
  exclude_recent_tests: number;
  question_count: number;
  distribution_mode: DistributionMode;
  /** Only read when distribution_mode = 'manual': chapter id → count. */
  chapter_counts: Record<string, number>;
  /** JABT level → number of questions. Empty object = proportional to the pool (the default). */
  level_mix: Partial<Record<LevelKey, number>>;
  /** Decision 15 — English reserved slots Q1–3 synonyms, Q4–6 antonyms. */
  enforce_board_blueprint: boolean;
  /** 1..onemark.paper.max_series (decision 16). */
  series_count: number;
  preview_language: PreviewLanguage;
  pdf_include_key: boolean;
}

/** Decision 14 — copy-on-write edits scoped to this paper only. */
export interface QuestionOverride {
  stem?: string;
  stem_ta?: string;
  options?: OptionRow[];
  options_ta?: OptionRow[];
  explanation?: string;
  explanation_ta?: string;
}

export interface OptionRow {
  key: string;
  text: string;
}

export interface BlueprintShortfall {
  tag_key: string;
  needed: number;
  available: number;
}

export interface GenerationReport {
  requested: number;
  /** Questions the filters can actually place on THIS paper: the locked ones,
   *  the reserved slots the pool can fill, and the fresh pool. Under the board
   *  shape a fourth synonym cannot be placed anywhere, so it is not counted —
   *  "use the N available" therefore never promises more than it delivers. */
  available: number;
  selected: number;
  missing: number;
  blueprint_shortfalls: BlueprintShortfall[];
  /** Reserved slots the pool could not fill (sum over blueprint_shortfalls).
   *  This part of `missing` cannot be cured by a smaller count — only by
   *  widening the filters or switching the board shape off. */
  blueprint_missing: number;
  /** Locks that could not keep their slot (decision 12 + 15): moved, never
   *  dropped, never left in a reserved slot they do not qualify for. */
  lock_moves: LockMove[];
  generated_at: string;
}

export interface LockMove {
  item_id: string;
  /** 0-based board positions. */
  from: number;
  to: number;
  reason: string;
}

export interface PaperOutputs {
  pdf_exported_at?: string;
  published_at?: string;
}

/** fp_assessments.config for a OneMark paper. `onemark: true` is the discriminator. */
export interface PaperConfig {
  onemark: true;
  state: PaperState;
  step: WizardStep;
  params: PaperParams;
  locked_ids: string[];
  question_overrides: Record<string, QuestionOverride>;
  resolved_item_ids: string[];
  /** Decision 15 — 0-based board positions the blueprint reserved but the pool
   *  could not fill. They are kept as visible gaps (Q3 stays "Q3 — empty"), never
   *  collapsed onto the next item; `finalize` refuses while any remain. Always
   *  empty when the board shape is off. */
  empty_slots: number[];
  last_generation?: GenerationReport;
  open_at?: string;
  close_at?: string;
  duration_min?: number;
  shuffle_options?: boolean;
  outputs?: PaperOutputs;
}

/** Every quantity default is a policy row ("every policy decision = a config
 *  row"). `onemark.paper.question_count` is the base; a per-subject row
 *  `onemark.paper.question_count.<exam config_key>` overrides it. The server
 *  reads both through fn_get_policy_int and hands the resolved number here. */
export const PAPER_QUESTION_COUNT_POLICY_PREFIX = 'onemark.paper.question_count.';
/** Fallback ONLY when no per-subject row exists yet: PRD English §3.3 board
 *  shape is 20. Same role as OneMarkPolicyDefaults — a default, not the policy. */
export const ENGLISH_BOARD_QUESTION_COUNT_FALLBACK = 20;

/** Policies as the routes resolve them: the base count, the per-subject counts
 *  (one per OneMark exam config_key), and the series cap. */
export interface PaperPolicies {
  question_count: number;
  question_count_by_exam: Record<string, number>;
  max_series: number;
}

export function questionCountFor(examKey: string, policies: PaperPolicies): number {
  return policies.question_count_by_exam[examKey] ?? policies.question_count;
}

export function defaultParams(input: {
  examKey: string;
  /** Already resolved for this exam — see questionCountFor. */
  questionCount: number;
}): PaperParams {
  const isEnglish = input.examKey === 'tn_hsc_english';
  return {
    selection_mode: 'full_syllabus',
    chapter_ids: [],
    tag_keys: [],
    source_keys: [],
    year_from: null,
    year_to: null,
    exclude_recent_tests: 0,
    question_count: input.questionCount,
    distribution_mode: 'proportional',
    chapter_counts: {},
    level_mix: {},
    enforce_board_blueprint: isEnglish,
    series_count: 1,
    preview_language: 'both',
    pdf_include_key: true,
  };
}

export function newPaperConfig(params: PaperParams): PaperConfig {
  return {
    onemark: true,
    state: 'DRAFT',
    step: 1,
    params,
    locked_ids: [],
    question_overrides: {},
    resolved_item_ids: [],
    empty_slots: [],
  };
}

/** The paper as a board: resolved ids laid around the reserved gaps, so index
 *  === 0-based printed position. Feed this to generatePaper as `previousIds`
 *  so a locked item keeps its BOARD slot, not its compacted index. */
export function boardOf(config: Pick<PaperConfig, 'resolved_item_ids' | 'empty_slots'>): (string | null)[] {
  const gaps = new Set(config.empty_slots ?? []);
  const board: (string | null)[] = [];
  for (const id of config.resolved_item_ids) {
    while (gaps.has(board.length)) board.push(null);
    board.push(id);
  }
  // Trailing gaps (a reserved slot after the last resolved item).
  while (gaps.has(board.length)) board.push(null);
  return board;
}

export interface BoardConflict {
  /** 1-based printed position. */
  position: number;
  item_id: string;
  tag_key: string;
}

/** Decision 15 read back from the persisted paper: every reserved position
 *  must hold an item carrying that slot's tag. The generator guarantees this;
 *  finalize and the preview check it again so a config written by an older
 *  build (or a hand-edited row) can never print with the shape broken. */
export function boardShapeConflicts(
  config: Pick<PaperConfig, 'resolved_item_ids' | 'empty_slots' | 'params'>,
  examKey: string,
  tagsOf: (itemId: string) => readonly string[] | undefined,
): BoardConflict[] {
  if (examKey !== 'tn_hsc_english' || !config.params.enforce_board_blueprint) return [];
  const board = boardOf(config);
  const out: BoardConflict[] = [];
  for (const group of BLUEPRINT_SLOTS) {
    for (const p of group.positions) {
      const id = board[p];
      if (id === null || id === undefined) continue;
      const tags = tagsOf(id);
      if (tags && !tags.includes(group.tag_key)) out.push({ position: p + 1, item_id: id, tag_key: group.tag_key });
    }
  }
  return out;
}

/** THE single authority on whether learners may open a paper (Lane V reads
 *  this, nothing else): `config.outputs.published_at` set. A paper that still
 *  carries a cohort_id, a window and a duration but no published_at is NOT
 *  live — that is exactly the state `unpublish` leaves behind so the window
 *  can be corrected and published again. */
export function isPaperLive(config: Pick<PaperConfig, 'outputs'> | null | undefined): boolean {
  return !!config?.outputs?.published_at;
}

// ---------------------------------------------------------------------------
// The pure selection engine
// ---------------------------------------------------------------------------

/** The fp_items projection the engine needs. No stems, no answers. */
export interface PoolItem {
  id: string;
  topic_id: string | null;
  bloom_level: string | null;
  tags: string[];
  source_key: string | null;
  source_year: number | null;
  times_served: number;
}

export interface EngineContext {
  /** exam_definitions.config_key — 'tn_hsc_english' switches on the
   *  chapter-agnostic rule (PRD English §4.4) and the blueprint. */
  examKey: string;
  params: PaperParams;
  /** Item ids suppressed by exclude_recent_tests. */
  recentlyUsedIds: Set<string>;
  /** topic id → sort_order, so fresh picks read chapter-by-chapter. */
  chapterOrder: Record<string, number>;
  /** onemark_category_weights for the exam: tag key → weight. */
  categoryWeights: Record<string, number>;
  /** Topic ids that mean "anchored to no lesson" — Wave 1 seeded
   *  `onemark_eng_grammar_general` for English. An item filed under one of
   *  these is chapter-agnostic exactly like a NULL topic_id (PRD English §4.4). */
  generalTopicIds?: Set<string>;
  /** Injectable for deterministic tests. Defaults to Math.random. */
  rng?: () => number;
}

/** cdc_exam_syllabus_topics.config_key of the seeded English grammar-general
 *  "chapter". Canonical home for a lesson-agnostic English item; NULL topic_id
 *  is tolerated as the legacy spelling of the same fact. */
export const GENERAL_TOPIC_KEYS = new Set(['onemark_eng_grammar_general']);

/** PRD English §4.4 — true when the item is anchored to no lesson. English only;
 *  Physics has no such class, so there a NULL topic is simply "outside". */
export function isChapterAgnostic(
  item: Pick<PoolItem, 'topic_id'>,
  ctx: Pick<EngineContext, 'examKey' | 'generalTopicIds'>,
): boolean {
  if (ctx.examKey !== 'tn_hsc_english') return false;
  if (item.topic_id === null) return true;
  return ctx.generalTopicIds?.has(item.topic_id) ?? false;
}

export const BLUEPRINT_SLOTS: { tag_key: 'synonyms' | 'antonyms'; positions: number[] }[] = [
  { tag_key: 'synonyms', positions: [0, 1, 2] },
  { tag_key: 'antonyms', positions: [3, 4, 5] },
];
const BLUEPRINT_TAGS = new Set(['synonyms', 'antonyms']);

export function levelOf(item: Pick<PoolItem, 'bloom_level'>): LevelKey {
  const l = item.bloom_level;
  return l && (JABT_LEVELS as string[]).includes(l) ? (l as JabtLevel) : UNLEVELLED;
}

function isEnglish(ctx: Pick<EngineContext, 'examKey'>): boolean {
  return ctx.examKey === 'tn_hsc_english';
}

/** Why an item fails the current filters. Empty = it matches. Used both to
 *  build the eligible pool and to word the decision-12 lock warning. */
export function filterMismatches(
  item: PoolItem,
  ctx: Pick<EngineContext, 'examKey' | 'params' | 'generalTopicIds'>,
): string[] {
  const p = ctx.params;
  const reasons: string[] = [];

  if (p.chapter_ids.length > 0) {
    const inChapter = item.topic_id !== null && p.chapter_ids.includes(item.topic_id);
    // PRD English §4.4 — a grammar item anchored to no lesson (NULL topic or
    // the seeded grammar-general topic) survives any chapter selection.
    // Physics has no such class, so there the rule is plain.
    if (!inChapter && !isChapterAgnostic(item, ctx)) reasons.push('outside the selected chapters');
  }
  if (p.tag_keys.length > 0 && !item.tags.some((t) => p.tag_keys.includes(t))) {
    reasons.push('carries none of the selected tags');
  }
  if (p.source_keys.length > 0) {
    if (item.source_key === null || !p.source_keys.includes(item.source_key)) {
      reasons.push('not from a selected source');
    }
  }
  // PRD §8.1: an item with no year passes any year range.
  if (item.source_year !== null) {
    if (p.year_from !== null && item.source_year < p.year_from) reasons.push('older than the year range');
    if (p.year_to !== null && item.source_year > p.year_to) reasons.push('newer than the year range');
  }
  return reasons;
}

export function itemMatchesFilters(
  item: PoolItem,
  ctx: Pick<EngineContext, 'examKey' | 'params' | 'generalTopicIds'>,
): boolean {
  return filterMismatches(item, ctx).length === 0;
}

/** Largest-remainder apportionment of `total` across weights. Zero weights get zero. */
export function apportion(weights: Record<string, number>, total: number): Record<string, number> {
  const keys = Object.keys(weights);
  const sum = keys.reduce((s, k) => s + Math.max(0, weights[k] ?? 0), 0);
  const out: Record<string, number> = {};
  if (total <= 0 || sum <= 0) {
    for (const k of keys) out[k] = 0;
    return out;
  }
  const remainders: { k: string; r: number }[] = [];
  let used = 0;
  for (const k of keys) {
    const exact = (Math.max(0, weights[k] ?? 0) / sum) * total;
    const floor = Math.floor(exact);
    out[k] = floor;
    used += floor;
    remainders.push({ k, r: exact - floor });
  }
  remainders.sort((a, b) => b.r - a.r);
  for (let i = 0; i < remainders.length && used < total; i++) {
    out[remainders[i].k] += 1;
    used += 1;
  }
  return out;
}

/** Decision 6 default: the level mix follows the pool's own shape. */
export function defaultLevelMix(pool: PoolItem[], count: number): Record<LevelKey, number> {
  const weights: Record<string, number> = {};
  for (const k of LEVEL_KEYS) weights[k] = 0;
  for (const it of pool) weights[levelOf(it)] += 1;
  return apportion(weights, count) as Record<LevelKey, number>;
}

/** Resolves the level mix actually used: the Senior Learner's own counts when
 *  they set any, else proportional to the eligible pool. */
export function effectiveLevelMix(
  params: PaperParams,
  eligible: PoolItem[],
  need: number,
): Record<LevelKey, number> {
  const custom = params.level_mix ?? {};
  const setSum = LEVEL_KEYS.reduce((s, k) => s + (custom[k] ?? 0), 0);
  if (setSum <= 0) return defaultLevelMix(eligible, need);
  // Re-scale whatever was set onto the slots that are actually open (locked
  // slots are already spoken for).
  const weights: Record<string, number> = {};
  for (const k of LEVEL_KEYS) weights[k] = custom[k] ?? 0;
  return apportion(weights, need) as Record<LevelKey, number>;
}

function chapterTargets(
  params: PaperParams,
  eligible: PoolItem[],
  need: number,
  ctx: Pick<EngineContext, 'examKey' | 'generalTopicIds'>,
): Record<string, number> {
  const weights: Record<string, number> = {};
  const keyOf = (t: string | null) => (t === null || isChapterAgnostic({ topic_id: t }, ctx) ? '__none__' : t);
  for (const it of eligible) weights[keyOf(it.topic_id)] = (weights[keyOf(it.topic_id)] ?? 0) + 0;
  if (params.distribution_mode === 'manual') {
    for (const k of Object.keys(weights)) weights[k] = params.chapter_counts[k] ?? 0;
    // A chapter the Senior Learner did not name gets nothing in manual mode;
    // grammar-general (no chapter) gets the remainder if they left it unnamed.
    if ('__none__' in weights && !('__none__' in params.chapter_counts)) {
      const named = Object.values(params.chapter_counts).reduce((s, n) => s + n, 0);
      weights.__none__ = Math.max(0, need - named);
    }
    return apportion(weights, need);
  }
  if (params.distribution_mode === 'equal_per_chapter') {
    for (const k of Object.keys(weights)) weights[k] = 1;
    return apportion(weights, need);
  }
  for (const it of eligible) weights[keyOf(it.topic_id)] += 1;
  return apportion(weights, need);
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Least-served first, random among equals (PRD §8.1 ORDER BY). */
function leastServedOrder(items: PoolItem[], rng: () => number): PoolItem[] {
  return shuffled(items, rng).sort((a, b) => a.times_served - b.times_served);
}

export interface GenerationResult {
  /** Slot → item id; a null slot is a shortfall the Senior Learner must resolve. */
  slots: (string | null)[];
  /** The null slots that are RESERVED by the board shape (decision 15). The
   *  route keeps these as gaps; every other null is a trailing pool shortfall
   *  and is simply not written. */
  empty_reserved_slots: number[];
  report: GenerationReport;
}

/**
 * PRD §8.1 in TypeScript. Locked items keep their slot (decision 12); the
 * blueprint fills Q1–6 for English (decision 15); the rest is a stratified
 * draw over chapter × JABT level (decision 6) with a top-up pass; the engine
 * never pads from outside the filters (decision 11).
 */
export function generatePaper(input: {
  pool: PoolItem[];
  ctx: EngineContext;
  lockedIds: string[];
  /** The previous BOARD (see boardOf — gaps included), so a locked item keeps
   *  its printed slot. */
  previousIds: (string | null)[];
}): GenerationResult {
  const { pool, ctx, lockedIds, previousIds } = input;
  const rng = ctx.rng ?? Math.random;
  const count = Math.max(0, ctx.params.question_count);
  const byId = new Map(pool.map((it) => [it.id, it]));

  const slots: (string | null)[] = Array.from({ length: count }, () => null);
  const taken = new Set<string>();

  // 0. The board shape's reserved positions are known BEFORE any lock is
  //    placed (decision 15): a locked grammar item must never sit in Q1–6.
  const blueprintOn = isEnglish(ctx) && ctx.params.enforce_board_blueprint;
  const reserved = new Set<number>();
  if (blueprintOn) {
    for (const group of BLUEPRINT_SLOTS) for (const p of group.positions) if (p < slots.length) reserved.add(p);
  }
  const reservedTagAt = (slot: number) => BLUEPRINT_SLOTS.find((g) => g.positions.includes(slot))?.tag_key ?? null;
  const fitsReserved = (it: PoolItem, slot: number) => {
    const tag = reservedTagAt(slot);
    return tag === null || it.tags.includes(tag);
  };

  // 1. Locked items first, in the slot they held. A lock beyond the new count,
  //    or one whose slot is now reserved for a tag it does not carry, moves to
  //    the first open NON-reserved slot (appended if none) — never silently
  //    lost, never left breaking the shape. Each move is reported.
  const locked = lockedIds.filter((id) => byId.has(id));
  const overflow: { id: string; from: number }[] = [];
  const lockMoves: LockMove[] = [];
  for (const id of locked) {
    const prev = previousIds.indexOf(id);
    const keepable =
      prev >= 0 && prev < count && slots[prev] === null && (!reserved.has(prev) || fitsReserved(byId.get(id)!, prev));
    if (keepable) slots[prev] = id;
    else overflow.push({ id, from: prev });
    taken.add(id);
  }
  for (const { id, from } of overflow) {
    const free = slots.findIndex((s, i) => s === null && !reserved.has(i));
    const to = free >= 0 ? free : slots.length;
    if (free >= 0) slots[free] = id;
    else slots.push(id);
    if (from >= 0 && from !== to) {
      lockMoves.push({
        item_id: id,
        from,
        to,
        reason: reserved.has(from) ? `Q${from + 1} is reserved for ${reservedTagAt(from)}` : 'beyond the new question count',
      });
    }
  }

  // 2. Eligible pool — every filter applied, minus locked and recently used.
  const eligible = pool.filter(
    (it) => !taken.has(it.id) && !ctx.recentlyUsedIds.has(it.id) && itemMatchesFilters(it, ctx),
  );

  const blueprintShortfalls: BlueprintShortfall[] = [];
  let blueprintFilled = 0;
  const remaining = new Map(eligible.map((it) => [it.id, it]));

  const take = (it: PoolItem, slot: number) => {
    slots[slot] = it.id;
    taken.add(it.id);
    remaining.delete(it.id);
  };

  // 3. English board shape: Q1–3 synonyms, Q4–6 antonyms (decision 15).
  //    A reserved slot the pool cannot fill stays EMPTY and is named in the
  //    report — PRD English §3.4 forbids back-filling it with grammar.
  if (blueprintOn) {
    for (const group of BLUEPRINT_SLOTS) {
      const open = group.positions.filter((p) => p < slots.length && slots[p] === null);
      const candidates = leastServedOrder(
        [...remaining.values()].filter((it) => it.tags.includes(group.tag_key)),
        rng,
      );
      open.forEach((p, i) => {
        if (candidates[i]) {
          take(candidates[i], p);
          blueprintFilled += 1;
        }
      });
      if (candidates.length < open.length) {
        blueprintShortfalls.push({
          tag_key: group.tag_key,
          needed: open.length,
          available: candidates.length,
        });
      }
    }
  }

  // 4. Open slots — stratified draw.
  const openSlots = () =>
    slots.map((s, i) => (s === null && !reserved.has(i) ? i : -1)).filter((i) => i >= 0);
  let open = openSlots();
  const need = open.length;

  let freshPool = [...remaining.values()];
  if (blueprintOn) freshPool = freshPool.filter((it) => !it.tags.some((t) => BLUEPRINT_TAGS.has(t)));

  // What can actually land on this paper. With the shape off that is the whole
  // eligible pool; with it on, a synonym beyond the three reserved slots has
  // nowhere to go and must not be counted (it is what made "use the N
  // available" regenerate the same shortfall).
  const available = blueprintOn ? locked.length + blueprintFilled + freshPool.length : eligible.length + locked.length;

  const levelTarget = effectiveLevelMix(ctx.params, freshPool, need);
  const levelLeft: Record<string, number> = { ...levelTarget };

  const picks: PoolItem[] = [];
  if (blueprintOn) {
    // Q7–20 by empirical tag weight (PRD English §4.3), levels as a tiebreak.
    const weightOf = (it: PoolItem) =>
      it.tags.reduce((m, t) => Math.max(m, ctx.categoryWeights[t] ?? 0), 0) || 1;
    const primaryTag = (it: PoolItem) =>
      [...it.tags].sort((a, b) => (ctx.categoryWeights[b] ?? 0) - (ctx.categoryWeights[a] ?? 0))[0] ??
      '__untagged__';
    const tagWeights: Record<string, number> = {};
    for (const it of freshPool) {
      const t = primaryTag(it);
      if (!(t in tagWeights)) tagWeights[t] = t === '__untagged__' ? 1 : weightOf(it);
    }
    const tagLeft = apportion(tagWeights, need);
    const ordered = leastServedOrder(freshPool, rng);
    for (let round = 0; round < 2 && picks.length < need; round++) {
      for (const it of ordered) {
        if (picks.length >= need || taken.has(it.id)) continue;
        const t = primaryTag(it);
        const lv = levelOf(it);
        const tagOk = (tagLeft[t] ?? 0) > 0;
        const lvOk = (levelLeft[lv] ?? 0) > 0;
        // Round 0 honours both quotas; round 1 honours the tag quota only.
        if (round === 0 ? tagOk && lvOk : tagOk) {
          picks.push(it);
          taken.add(it.id);
          tagLeft[t] -= 1;
          if (lvOk) levelLeft[lv] -= 1;
        }
      }
    }
  } else {
    const chapterLeft = chapterTargets(ctx.params, freshPool, need, ctx);
    const chapterKey = (it: PoolItem) => (isChapterAgnostic(it, ctx) ? '__none__' : (it.topic_id ?? '__none__'));
    const ordered = leastServedOrder(freshPool, rng);
    for (let round = 0; round < 2 && picks.length < need; round++) {
      for (const it of ordered) {
        if (picks.length >= need || taken.has(it.id)) continue;
        const ch = chapterKey(it);
        const lv = levelOf(it);
        const chOk = (chapterLeft[ch] ?? 0) > 0;
        const lvOk = (levelLeft[lv] ?? 0) > 0;
        // Round 0 honours chapter AND level; round 1 honours the chapter only.
        if (round === 0 ? chOk && lvOk : chOk) {
          picks.push(it);
          taken.add(it.id);
          chapterLeft[ch] -= 1;
          if (lvOk) levelLeft[lv] -= 1;
        }
      }
    }
  }

  // 5. Top-up pass (PRD §3.4): whatever is still eligible, least-served first.
  if (picks.length < need) {
    for (const it of leastServedOrder(freshPool, rng)) {
      if (picks.length >= need) break;
      if (taken.has(it.id)) continue;
      picks.push(it);
      taken.add(it.id);
    }
  }

  // 6. Lay the fresh picks into the open slots chapter-by-chapter.
  const orderOf = (it: PoolItem) =>
    isChapterAgnostic(it, ctx) || it.topic_id === null
      ? Number.MAX_SAFE_INTEGER
      : (ctx.chapterOrder[it.topic_id] ?? 1e6);
  picks.sort((a, b) => orderOf(a) - orderOf(b));
  open = openSlots();
  picks.forEach((it, i) => {
    if (i < open.length) slots[open[i]] = it.id;
  });

  const selected = slots.filter((s) => s !== null).length;
  const emptyReserved = [...reserved].filter((p) => slots[p] === null).sort((a, b) => a - b);
  return {
    slots,
    empty_reserved_slots: emptyReserved,
    report: {
      requested: count,
      available,
      selected,
      missing: Math.max(0, count - selected),
      blueprint_shortfalls: blueprintShortfalls,
      blueprint_missing: blueprintShortfalls.reduce((s, b) => s + Math.max(0, b.needed - b.available), 0),
      lock_moves: lockMoves,
      generated_at: new Date().toISOString(),
    },
  };
}

/** PRD §8.2 — chapter, category tag and JABT level held constant. Returns
 *  null when the stratum is exhausted; the UI then disables the control. */
export function findSwap(input: {
  pool: PoolItem[];
  ctx: EngineContext;
  outgoing: PoolItem;
  currentIds: string[];
}): PoolItem | null {
  const { pool, ctx, outgoing, currentIds } = input;
  const rng = ctx.rng ?? Math.random;
  const current = new Set(currentIds);
  const primaryTag = outgoing.tags[0] ?? null;
  const candidates = pool.filter(
    (it) =>
      it.id !== outgoing.id &&
      !current.has(it.id) &&
      !ctx.recentlyUsedIds.has(it.id) &&
      it.topic_id === outgoing.topic_id &&
      levelOf(it) === levelOf(outgoing) &&
      (primaryTag === null ? true : it.tags.includes(primaryTag)) &&
      itemMatchesFilters(it, ctx),
  );
  if (candidates.length === 0) return null;
  return leastServedOrder(candidates, rng)[0];
}

/** Decision 12 — a locked item that no longer matches the filters is kept
 *  and flagged, never dropped. */
export function lockWarnings(
  lockedItems: PoolItem[],
  ctx: Pick<EngineContext, 'examKey' | 'params' | 'generalTopicIds'>,
): { item_id: string; reasons: string[] }[] {
  return lockedItems
    .map((it) => ({ item_id: it.id, reasons: filterMismatches(it, ctx) }))
    .filter((w) => w.reasons.length > 0);
}

/** The lane ruling shared with Lane P's renderer: `auto` is stacked when the
 *  longest option runs past this many characters or the item is tagged
 *  `assertion_set`; otherwise the four options print inline. */
export const AUTO_LAYOUT_STACK_OVER_CHARS = 40;
export const AUTO_LAYOUT_STACK_TAG = 'assertion_set';

/** PRD §4.5 / Physics §4.3 — `auto` resolves from the longest option and the
 *  assertion-set tag. The preview and the PDF must agree, so this is the only
 *  implementation; an explicit layout on the item is honoured as written. */
export function resolveOptionLayout(
  layout: OneMarkOptionLayout,
  options: OptionRow[] | null | undefined,
  tags: readonly string[] | null | undefined = [],
): Exclude<OneMarkOptionLayout, 'auto'> {
  if (layout !== 'auto') return layout;
  if ((tags ?? []).includes(AUTO_LAYOUT_STACK_TAG)) return 'stacked';
  const longest = (options ?? []).reduce((m, o) => Math.max(m, (o?.text ?? '').length), 0);
  return longest > AUTO_LAYOUT_STACK_OVER_CHARS ? 'stacked' : 'inline_4';
}

// ---------------------------------------------------------------------------
// What the API returns to the wizard
// ---------------------------------------------------------------------------

export interface ChapterRef {
  id: string;
  config_key: string;
  display_name: string;
  sort_order: number;
  pool_count: number;
}

export interface TagRef {
  key: string;
  label: string;
  pool_count: number;
}

export interface SourceRef {
  key: string;
  label: string;
}

export interface ExamRef {
  id: string;
  config_key: string;
  display_name: string;
}

export interface CohortRef {
  id: string;
  term: string | null;
  school_name: string | null;
}

export interface PaperSummary {
  id: string;
  title: string;
  exam_definition_id: string;
  exam_key: string;
  state: PaperState;
  step: WizardStep;
  question_count: number;
  selected: number;
  updated_at: string;
}

export interface ExamReference {
  exam: ExamRef;
  chapters: ChapterRef[];
  /** Items with no chapter — English grammar-general (PRD §4.4). */
  chapter_agnostic_count: number;
  tags: TagRef[];
  levels: Record<LevelKey, number>;
  years: { min: number | null; max: number | null };
  pool_total: number;
  cohorts: CohortRef[];
}

export interface WizardReference {
  can_see_answers: boolean;
  exams: ExamRef[];
  sources: SourceRef[];
  policies: PaperPolicies;
  papers: PaperSummary[];
  exam_reference: ExamReference | null;
}

/** A reserved board slot the pool could not fill (decision 15). Rendered as a
 *  gap in the preview at its printed position; blocks finalize. */
export interface EmptySlot {
  position: number;
  tag_key: string;
}

/** One resolved question as the browser sees it. `answer` / explanations are
 *  present for a paper builder (assessments.manage or items.manage — ruling
 *  2026-09-05); a learner-facing surface never receives them. */
export interface ResolvedQuestion {
  position: number;
  item_id: string;
  locked: boolean;
  stem: string;
  stem_ta: string | null;
  options: OptionRow[];
  options_ta: OptionRow[] | null;
  option_layout: OneMarkOptionLayout;
  topic_id: string | null;
  chapter_name: string | null;
  tags: string[];
  bloom_level: string | null;
  source_key: string | null;
  source_year: number | null;
  override: QuestionOverride | null;
  swap_available: boolean;
  lock_warning: string[] | null;
  answer?: unknown;
  explanation?: string | null;
  explanation_ta?: string | null;
}

export interface PaperDetail {
  id: string;
  title: string;
  exam: ExamRef;
  cohort_id: string | null;
  config: PaperConfig;
  questions: ResolvedQuestion[];
  /** Gaps in the board shape, in printed-position order. Empty unless the
   *  board shape is on and a reserved tag ran short. */
  empty_slots: EmptySlot[];
  /** Reserved positions holding an item without that slot's tag. Always empty
   *  after a regenerate; non-empty only for a config an older build wrote.
   *  Blocks finalize like a gap does. */
  board_conflicts: BoardConflict[];
  can_see_answers: boolean;
  updated_at: string;
}

export type PaperAction =
  | { action: 'save'; params?: Partial<PaperParams>; step?: WizardStep; title?: string }
  | { action: 'generate' }
  | { action: 'use_available' }
  | { action: 'swap'; item_id: string }
  | { action: 'lock'; item_id: string; locked: boolean }
  | { action: 'drop'; item_id: string }
  | { action: 'override'; item_id: string; fields: QuestionOverride | null }
  | { action: 'finalize' }
  | { action: 'reopen' }
  | { action: 'mark_exported' }
  | {
      action: 'publish';
      cohort_id: string;
      open_at: string;
      close_at: string;
      duration_min: number;
      shuffle_options: boolean;
    }
  /** Withdraws a publish — allowed until the first learner attempt exists. The
   *  window and cohort stay on the config so they can be corrected and
   *  re-published; the state stays FINALIZED. */
  | { action: 'unpublish' };

export interface ActionResult {
  paper: PaperDetail;
  /** Set on a swap that found nothing (PRD §3.2 swap exhaustion). */
  swap_exhausted?: { item_id: string; reason: string };
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

const BASE = '/api/foundation/onemark/paper';

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error ?? `Request failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export class PaperService {
  static async reference(examDefinitionId?: string | null): Promise<WizardReference> {
    const qs = examDefinitionId ? `?exam=${encodeURIComponent(examDefinitionId)}` : '';
    return parse<WizardReference>(await fetch(`${BASE}${qs}`, { cache: 'no-store' }));
  }

  static async create(input: {
    exam_definition_id: string;
    title: string;
  }): Promise<PaperDetail> {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return (await parse<{ paper: PaperDetail }>(res)).paper;
  }

  static async get(paperId: string): Promise<PaperDetail> {
    const res = await fetch(`${BASE}/${encodeURIComponent(paperId)}`, { cache: 'no-store' });
    return (await parse<{ paper: PaperDetail }>(res)).paper;
  }

  static async act(paperId: string, action: PaperAction): Promise<ActionResult> {
    const res = await fetch(`${BASE}/${encodeURIComponent(paperId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    return parse<ActionResult>(res);
  }

  /** Lane P's route. Series letters A–D; `key=1` asks for the answer key. */
  static pdfHref(paperId: string, series: string, key: boolean): string {
    return `${BASE}/${encodeURIComponent(paperId)}/pdf?series=${encodeURIComponent(series)}${key ? '&key=1' : ''}`;
  }
}

export const SERIES_LETTERS = ['A', 'B', 'C', 'D'] as const;
