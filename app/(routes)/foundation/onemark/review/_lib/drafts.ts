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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { OneMarkExamKeys, type FpItemOneMarkColumns } from '@/types/onemark';

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];
export const BLOOM_LEVELS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

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

/** Decision 7 — one Senior Learner's tick. The row must still be a draft. */
export async function approveDraft(id: string, patch: DraftPatch, userId: string): Promise<void> {
  const { data, error } = await sb()
    .from('fp_items')
    .update({ ...patch, is_active: true, updated_by: userId })
    .eq('id', id)
    .eq('is_active', false)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('This draft was already approved or removed by someone else.');
  }
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
      if (examId) qc.invalidateQueries({ queryKey: oneMarkKeys.drafts(examId) });
    },
  });
}

export function useApproveDraft(examId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: DraftPatch; userId: string }) =>
      approveDraft(v.id, v.patch, v.userId),
    onSuccess: () => {
      if (examId) qc.invalidateQueries({ queryKey: oneMarkKeys.drafts(examId) });
    },
  });
}
