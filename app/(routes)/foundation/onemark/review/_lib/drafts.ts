'use client';

// OneMark review queue — data access + React Query hooks.
//
// Everything here runs through the BROWSER session client. fp_items is gated
// by RLS to foundation.items.view (read) / foundation.items.manage (write) —
// that policy, not this file, is the boundary. No service-role anywhere on
// the review path: the reviewer is allowed to see the answer key, so nothing
// needs to run above RLS.
//
// Approve (decision 7): ONE subject Senior Learner's tick. Flips is_active to
// true and stamps updated_by with the approver. No second reviewer, no batch.
// The flip itself is NOT done here: it goes through the server action in
// ../_actions/approve-draft.ts, which re-checks foundation.items.manage and
// the approval rules (_lib/approve-rules.ts) before writing. Save stays a
// plain RLS-gated UPDATE — it never changes is_active.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { OneMarkExamKeys, type FpItemOneMarkColumns } from '@/types/onemark';
import { approveDraft as approveDraftAction } from '../_actions/approve-draft';
import { normaliseStem, type BloomLevel, type OptionKey } from './approve-rules';

export { BLOOM_LEVELS, OPTION_KEYS, approvalBlockers, normaliseStem } from './approve-rules';
export type { BloomLevel, OptionKey } from './approve-rules';

export const BLOOM_LABELS: Record<BloomLevel, string> = {
  K1: 'K1 · Remembering',
  K2: 'K2 · Understanding',
  K3: 'K3 · Applying',
  K4: 'K4 · Analyzing',
  K5: 'K5 · Evaluating',
  K6: 'K6 · Creating',
};

export interface OneMarkExam {
  id: string;
  config_key: string;
  display_name: string;
}

export interface DraftTopic {
  id: string;
  config_key: string;
  display_name: string;
  sort_order: number;
}

export interface DraftTag {
  key: string;
  label: string;
  subject_exam_definition_id: string | null;
}

export interface ItemOption {
  key: OptionKey;
  text: string;
}

/** A draft as read from fp_items (the reviewer may see the answer). */
export interface DraftItem extends FpItemOneMarkColumns {
  id: string;
  exam_definition_id: string;
  topic_id: string | null;
  stem: string;
  options: ItemOption[];
  answer: { correct: OptionKey | null; pending?: boolean } | null;
  explanation: string | null;
  bloom_level: BloomLevel | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** What the editor may change. */
export interface DraftPatch {
  stem: string;
  stem_ta: string | null;
  options: ItemOption[];
  options_ta: ItemOption[] | null;
  answer: { correct: OptionKey | null; pending?: boolean };
  explanation: string | null;
  explanation_ta: string | null;
  topic_id: string | null;
  tags: string[];
  bloom_level: BloomLevel | null;
  option_layout: FpItemOneMarkColumns['option_layout'];
}

const DRAFT_COLUMNS = `id, exam_definition_id, topic_id, stem, stem_ta, options, options_ta,
  answer, explanation, explanation_ta, option_layout, tags, source_key, source_year,
  source_sitting, source_series, source_qno, times_served, times_correct,
  bloom_level, is_active, created_at, updated_at`;

const sb = () => createClientSupabaseClient() as any;

export const oneMarkKeys = {
  all: ['onemark'] as const,
  exams: () => [...oneMarkKeys.all, 'exams'] as const,
  topics: (examId: string) => [...oneMarkKeys.all, 'topics', examId] as const,
  tags: (examId: string) => [...oneMarkKeys.all, 'tags', examId] as const,
  drafts: (examId: string) => [...oneMarkKeys.all, 'drafts', examId] as const,
  stemIndex: (examId: string) => [...oneMarkKeys.all, 'stem-index', examId] as const,
};

export async function listOneMarkExams(): Promise<OneMarkExam[]> {
  const { data, error } = await sb()
    .from('exam_definitions')
    .select('id, config_key, display_name')
    .in('config_key', Object.values(OneMarkExamKeys))
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OneMarkExam[];
}

export async function listTopicsForExam(examId: string): Promise<DraftTopic[]> {
  const { data, error } = await sb()
    .from('exam_topic_map')
    .select('sort_order, topic:cdc_exam_syllabus_topics!inner(id, config_key, display_name)')
    .eq('exam_definition_id', examId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => r.topic)
    .map((r: any) => ({
      id: r.topic.id,
      config_key: r.topic.config_key,
      display_name: r.topic.display_name,
      sort_order: r.sort_order ?? 0,
    }));
}

export async function listTagsForExam(examId: string): Promise<DraftTag[]> {
  const { data, error } = await sb()
    .from('onemark_item_tags')
    .select('key, label, subject_exam_definition_id')
    .eq('is_active', true)
    .or(`subject_exam_definition_id.eq.${examId},subject_exam_definition_id.is.null`)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DraftTag[];
}

export async function listDrafts(examId: string): Promise<DraftItem[]> {
  const { data, error } = await sb()
    .from('fp_items')
    .select(DRAFT_COLUMNS)
    .eq('exam_definition_id', examId)
    .eq('is_active', false)
    .order('source_year', { ascending: false, nullsFirst: false })
    .order('source_qno', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    options: Array.isArray(row.options) ? row.options : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
  })) as DraftItem[];
}

export async function saveDraft(id: string, patch: DraftPatch, userId: string): Promise<void> {
  const { error } = await sb()
    .from('fp_items')
    .update({ ...patch, updated_by: userId })
    .eq('id', id)
    .eq('is_active', false);
  if (error) throw error;
}

/** Decision 7 — one Senior Learner's tick. Runs server-side: the action
 *  re-checks foundation.items.manage and refuses a draft with no JABT level,
 *  no correct option or fewer than four options, then flips is_active by id
 *  (never filtering on the column it writes — PostgREST would drop the row
 *  from its own RETURNING and report a failure for a write that landed). */
export async function approveDraft(id: string, patch: DraftPatch): Promise<void> {
  const result = await approveDraftAction({ id, patch });
  if (result.ok === false) throw new Error(result.error);
}

/** Every item of the exam (live and draft) keyed by normalised stem, so the
 *  queue can show a reviewer the twin of a flagged draft — a stem-only
 *  collision is FLAGGED for review, not skipped (PRD English B.3). Read under
 *  RLS with the reviewer's own session; the answer is NOT selected. */
export interface StemTwin {
  id: string;
  stem: string;
  options: ItemOption[];
  is_active: boolean;
  tags: string[];
  source_key: string | null;
  source_year: number | null;
  source_sitting: string | null;
  source_series: string | null;
  source_qno: number | null;
}

export async function listStemIndex(examId: string): Promise<Map<string, StemTwin[]>> {
  const index = new Map<string, StemTwin[]>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb()
      .from('fp_items')
      .select('id, stem, options, is_active, tags, source_key, source_year, source_sitting, source_series, source_qno')
      .eq('exam_definition_id', examId)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      const key = normaliseStem(String(row.stem ?? ''));
      if (!key) continue;
      const twin: StemTwin = {
        ...row,
        options: Array.isArray(row.options) ? row.options : [],
        tags: Array.isArray(row.tags) ? row.tags : [],
      };
      const list = index.get(key);
      if (list) list.push(twin);
      else index.set(key, [twin]);
    }
    if (!data || data.length < pageSize) break;
  }
  return index;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useOneMarkExams() {
  return useQuery({ queryKey: oneMarkKeys.exams(), queryFn: listOneMarkExams, staleTime: 5 * 60_000 });
}

export function useDraftTopics(examId: string | null) {
  return useQuery({
    queryKey: oneMarkKeys.topics(examId ?? ''),
    queryFn: () => listTopicsForExam(examId as string),
    enabled: !!examId,
    staleTime: 5 * 60_000,
  });
}

export function useDraftTags(examId: string | null) {
  return useQuery({
    queryKey: oneMarkKeys.tags(examId ?? ''),
    queryFn: () => listTagsForExam(examId as string),
    enabled: !!examId,
    staleTime: 5 * 60_000,
  });
}

export function useDrafts(examId: string | null) {
  return useQuery({
    queryKey: oneMarkKeys.drafts(examId ?? ''),
    queryFn: () => listDrafts(examId as string),
    enabled: !!examId,
  });
}

export function useSaveDraft(examId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: DraftPatch; userId: string }) =>
      saveDraft(v.id, v.patch, v.userId),
    onSuccess: () => {
      if (examId) {
        qc.invalidateQueries({ queryKey: oneMarkKeys.drafts(examId) });
        qc.invalidateQueries({ queryKey: oneMarkKeys.stemIndex(examId) });
      }
    },
  });
}

export function useStemIndex(examId: string | null) {
  return useQuery({
    queryKey: oneMarkKeys.stemIndex(examId ?? ''),
    queryFn: () => listStemIndex(examId as string),
    enabled: !!examId,
  });
}

export function useApproveDraft(examId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: DraftPatch }) => approveDraft(v.id, v.patch),
    onSuccess: () => {
      if (examId) {
        qc.invalidateQueries({ queryKey: oneMarkKeys.drafts(examId) });
        qc.invalidateQueries({ queryKey: oneMarkKeys.stemIndex(examId) });
      }
    },
  });
}
