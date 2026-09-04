// app/api/foundation/onemark/paper/_shared.ts
//
// Server-side helpers shared by the paper wizard's two routes. Not a route
// (no HTTP verb exported) — Next.js ignores it.
//
// ONE CLIENT, ON PURPOSE — and the answer key still never leaks.
// Every read here uses the SESSION client. fp_items is gated under RLS to
// foundation.items.view / items.manage and fp_assessments to
// foundation.assessments.*, so the database, not this file, decides what a
// caller may read. What this file adds is the projection: `answer`,
// `explanation` and `explanation_ta` are dropped from the response unless
// the caller holds foundation.items.manage (lane spec: "never send answer to
// the browser except to a holder of foundation.items.manage").

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LEVEL_KEYS,
  defaultParams,
  filterMismatches,
  findSwap,
  levelOf,
  newPaperConfig,
  type ChapterRef,
  type EngineContext,
  type ExamRef,
  type LevelKey,
  type OptionRow,
  type PaperConfig,
  type PaperDetail,
  type PaperParams,
  type PoolItem,
  type ResolvedQuestion,
  type WizardStep,
} from '@/lib/services/onemark/paper-service';
import { OneMarkExamKeys, OneMarkPolicyDefaults, OneMarkPolicyKeys } from '@/types/onemark';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ONEMARK_EXAM_KEYS: string[] = [OneMarkExamKeys.PHYSICS, OneMarkExamKeys.ENGLISH];

/** fp_items row as the engine plus the preview need it. */
export interface FullItem extends PoolItem {
  stem: string;
  stem_ta: string | null;
  options: OptionRow[];
  options_ta: OptionRow[] | null;
  option_layout: 'auto' | 'inline_4' | 'inline_2x2' | 'stacked';
  answer: unknown;
  explanation: string | null;
  explanation_ta: string | null;
}

const ITEM_COLUMNS =
  'id, topic_id, bloom_level, tags, source_key, source_year, times_served, stem, stem_ta, options, options_ta, option_layout, answer, explanation, explanation_ta';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** fp_items.options is jsonb and has been written in two shapes — the
 *  console's `[{key:'A', text}]` and a bare `['alpha','beta']` list. Both
 *  become OptionRow[] here so the preview, the overrides and Lane P's renderer
 *  see one shape. */
export function normalizeOptions(raw: unknown): OptionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o, i) => {
    const fallbackKey = OPTION_LETTERS[i] ?? String(i + 1);
    if (o && typeof o === 'object') {
      const obj = o as Record<string, unknown>;
      const key = typeof obj.key === 'string' && obj.key ? obj.key : fallbackKey;
      const text =
        typeof obj.text === 'string' ? obj.text : typeof obj.label === 'string' ? obj.label : String(obj.value ?? '');
      return { key, text };
    }
    return { key: fallbackKey, text: String(o ?? '') };
  });
}

function normalizeItem(r: FullItem): FullItem {
  return {
    ...r,
    tags: Array.isArray(r.tags) ? r.tags : [],
    options: normalizeOptions(r.options),
    options_ta: Array.isArray(r.options_ta) && r.options_ta.length > 0 ? normalizeOptions(r.options_ta) : null,
    times_served: r.times_served ?? 0,
  };
}

export interface Gate {
  userId: string;
  canManage: boolean;
  canSeeAnswers: boolean;
}

/** Same key the page checks, checked again here. Single-argument overload:
 *  it resolves against auth.uid() internally, so nothing is forgeable. */
export async function gate(supabase: AnyClient): Promise<Gate | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: manage }, { data: items }] = await Promise.all([
    supabase.rpc('user_has_permission', { permission_name: 'foundation.assessments.manage' }),
    supabase.rpc('user_has_permission', { permission_name: 'foundation.items.manage' }),
  ]);
  return { userId: user.id, canManage: manage === true, canSeeAnswers: items === true };
}

export async function readPolicies(supabase: AnyClient) {
  const [{ data: count }, { data: series }] = await Promise.all([
    supabase.rpc('fn_get_policy_int', {
      p_key: OneMarkPolicyKeys.PAPER_QUESTION_COUNT,
      p_default: OneMarkPolicyDefaults[OneMarkPolicyKeys.PAPER_QUESTION_COUNT],
    }),
    supabase.rpc('fn_get_policy_int', {
      p_key: OneMarkPolicyKeys.PAPER_MAX_SERIES,
      p_default: OneMarkPolicyDefaults[OneMarkPolicyKeys.PAPER_MAX_SERIES],
    }),
  ]);
  return {
    question_count:
      typeof count === 'number' ? count : OneMarkPolicyDefaults[OneMarkPolicyKeys.PAPER_QUESTION_COUNT],
    max_series:
      typeof series === 'number' ? series : OneMarkPolicyDefaults[OneMarkPolicyKeys.PAPER_MAX_SERIES],
  };
}

export async function loadExams(supabase: AnyClient): Promise<ExamRef[]> {
  const { data, error } = await supabase
    .from('exam_definitions')
    .select('id, config_key, display_name, sort_order')
    .in('config_key', ONEMARK_EXAM_KEYS)
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((e: ExamRef) => ({
    id: e.id,
    config_key: e.config_key,
    display_name: e.display_name,
  }));
}

export async function loadExam(supabase: AnyClient, examId: string): Promise<ExamRef | null> {
  const { data, error } = await supabase
    .from('exam_definitions')
    .select('id, config_key, display_name')
    .eq('id', examId)
    .in('config_key', ONEMARK_EXAM_KEYS)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Chapters = exam_topic_map rows for the exam (Wave 1 seeded them). */
export async function loadChapters(
  supabase: AnyClient,
  examId: string,
): Promise<Omit<ChapterRef, 'pool_count'>[]> {
  const { data, error } = await supabase
    .from('exam_topic_map')
    .select('topic_id, sort_order, topic:cdc_exam_syllabus_topics(id, config_key, display_name, sort_order, is_active)')
    .eq('exam_definition_id', examId);
  if (error) throw error;
  return (data ?? [])
    .map((row: { topic_id: string; sort_order: number; topic: unknown }) => {
      const t = (Array.isArray(row.topic) ? row.topic[0] : row.topic) as
        | { id: string; config_key: string; display_name: string; sort_order: number | null; is_active: boolean }
        | null;
      if (!t || t.is_active === false) return null;
      return {
        id: t.id,
        config_key: t.config_key,
        display_name: t.display_name,
        sort_order: t.sort_order ?? row.sort_order ?? 100,
      };
    })
    .filter((c: unknown): c is Omit<ChapterRef, 'pool_count'> => c !== null)
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
}

/** The whole ACTIVE pool for the exam, paged past PostgREST's 1,000-row cap.
 *  Drafts (is_active=false) are invisible here — decision 11: never pad with
 *  unapproved items. */
export async function loadPool(supabase: AnyClient, examId: string): Promise<FullItem[]> {
  const PAGE = 1000;
  const out: FullItem[] = [];
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data, error } = await supabase
      .from('fp_items')
      .select(ITEM_COLUMNS)
      .eq('exam_definition_id', examId)
      .eq('is_active', true)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as FullItem[];
    for (const r of rows) out.push(normalizeItem(r));
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Specific items by id (locked items may sit outside the active pool only if
 *  somebody deactivated them after the lock — they are still shown, flagged). */
export async function loadItemsById(supabase: AnyClient, ids: string[]): Promise<FullItem[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('fp_items').select(ITEM_COLUMNS).in('id', ids);
  if (error) throw error;
  return ((data ?? []) as unknown as FullItem[]).map(normalizeItem);
}

export async function loadCategoryWeights(
  supabase: AnyClient,
  examId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('onemark_category_weights')
    .select('tag_key, weight')
    .eq('exam_definition_id', examId)
    .eq('is_active', true);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const w of data ?? []) out[w.tag_key] = Number(w.weight) || 0;
  return out;
}

/** PRD §8.1 step 2 — the caller's own last N papers on this exam. */
export async function recentlyUsedIds(
  supabase: AnyClient,
  input: { userId: string; examId: string; n: number; excludePaperId?: string },
): Promise<Set<string>> {
  const out = new Set<string>();
  if (input.n <= 0) return out;
  const { data, error } = await supabase
    .from('fp_assessments')
    .select('id, config')
    .eq('exam_definition_id', input.examId)
    .eq('created_by', input.userId)
    .eq('kind', 'mock')
    .contains('config', { onemark: true })
    .order('created_at', { ascending: false })
    .limit(input.n + 1);
  if (error) throw error;
  let taken = 0;
  for (const row of data ?? []) {
    if (row.id === input.excludePaperId) continue;
    if (taken >= input.n) break;
    taken += 1;
    const ids: unknown = row.config?.resolved_item_ids;
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') out.add(id);
  }
  return out;
}

/** Defensive: a config row written by an older build still parses. */
export function normalizeConfig(raw: unknown, fallbackParams: PaperParams): PaperConfig {
  const base = newPaperConfig(fallbackParams);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<PaperConfig>;
  const params = { ...fallbackParams, ...(r.params ?? {}) } as PaperParams;
  const step = ([1, 2, 3, 4, 5] as WizardStep[]).includes(r.step as WizardStep)
    ? (r.step as WizardStep)
    : 1;
  return {
    ...base,
    ...r,
    onemark: true,
    state: r.state ?? 'DRAFT',
    step,
    params,
    locked_ids: Array.isArray(r.locked_ids) ? r.locked_ids : [],
    question_overrides: r.question_overrides && typeof r.question_overrides === 'object' ? r.question_overrides : {},
    resolved_item_ids: Array.isArray(r.resolved_item_ids) ? r.resolved_item_ids : [],
  };
}

export function paramsFor(examKey: string, policyQuestionCount: number): PaperParams {
  return defaultParams({ examKey, policyQuestionCount });
}

export function engineContext(input: {
  examKey: string;
  params: PaperParams;
  recentlyUsedIds: Set<string>;
  chapters: Omit<ChapterRef, 'pool_count'>[];
  categoryWeights: Record<string, number>;
}): EngineContext {
  const chapterOrder: Record<string, number> = {};
  for (const c of input.chapters) chapterOrder[c.id] = c.sort_order;
  return {
    examKey: input.examKey,
    params: input.params,
    recentlyUsedIds: input.recentlyUsedIds,
    chapterOrder,
    categoryWeights: input.categoryWeights,
  };
}

export function levelCounts(pool: PoolItem[]): Record<LevelKey, number> {
  const out = {} as Record<LevelKey, number>;
  for (const k of LEVEL_KEYS) out[k] = 0;
  for (const it of pool) out[levelOf(it)] += 1;
  return out;
}

export interface AssessmentRow {
  id: string;
  title: string;
  exam_definition_id: string;
  cohort_id: string | null;
  kind: string;
  config: unknown;
  created_by: string | null;
  updated_at: string;
}

/** Builds the browser-facing paper: resolved questions in slot order, locks,
 *  warnings, swap availability — and the answer key only for a holder of
 *  foundation.items.manage. */
export function buildDetail(input: {
  row: AssessmentRow;
  exam: ExamRef;
  config: PaperConfig;
  pool: FullItem[];
  extraItems: FullItem[];
  chapters: Omit<ChapterRef, 'pool_count'>[];
  ctx: EngineContext;
  canSeeAnswers: boolean;
}): PaperDetail {
  const { row, exam, config, pool, extraItems, chapters, ctx, canSeeAnswers } = input;
  const byId = new Map<string, FullItem>();
  for (const it of pool) byId.set(it.id, it);
  for (const it of extraItems) if (!byId.has(it.id)) byId.set(it.id, it);
  const chapterName = new Map(chapters.map((c) => [c.id, c.display_name]));
  const locked = new Set(config.locked_ids);
  const currentIds = config.resolved_item_ids;

  const questions: ResolvedQuestion[] = [];
  currentIds.forEach((id, index) => {
    const it = byId.get(id);
    if (!it) return;
    const isLocked = locked.has(id);
    const mismatch = filterMismatches(it, ctx);
    const swap = findSwap({ pool, ctx, outgoing: it, currentIds });
    const q: ResolvedQuestion = {
      position: index + 1,
      item_id: it.id,
      locked: isLocked,
      stem: it.stem,
      stem_ta: it.stem_ta,
      options: it.options,
      options_ta: it.options_ta,
      option_layout: it.option_layout ?? 'auto',
      topic_id: it.topic_id,
      chapter_name: it.topic_id ? (chapterName.get(it.topic_id) ?? null) : null,
      tags: it.tags,
      bloom_level: it.bloom_level,
      source_key: it.source_key,
      source_year: it.source_year,
      override: config.question_overrides[it.id] ?? null,
      swap_available: swap !== null,
      lock_warning: isLocked && mismatch.length > 0 ? mismatch : null,
    };
    if (canSeeAnswers) {
      q.answer = it.answer;
      q.explanation = it.explanation;
      q.explanation_ta = it.explanation_ta;
    }
    questions.push(q);
  });

  return {
    id: row.id,
    title: row.title,
    exam,
    cohort_id: row.cohort_id,
    config,
    questions,
    can_see_answers: canSeeAnswers,
    updated_at: row.updated_at,
  };
}
