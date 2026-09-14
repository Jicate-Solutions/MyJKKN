// app/api/foundation/onemark/units/_shared.ts
//
// Server-side helpers for the OneMark units screen. Not a route (no HTTP verb
// exported) — Next.js ignores it.
//
// TWO CLIENTS, AND EXACTLY WHY.
//
// A OneMark unit is two rows in two tables whose write policies disagree:
//
//   exam_topic_map           write RLS = is_super_admin() OR is_cdc_head_or_super()
//                            OR user_has_permission('foundation.items.manage')
//                            -> a subject Senior Learner may write it. Session
//                               client, RLS decides. Nothing is elevated.
//
//   cdc_exam_syllabus_topics write RLS = is_cdc_head_or_super() ONLY
//                            -> a subject Senior Learner may NOT write it, so
//                               naming, describing or retiring a unit through
//                               the session client fails with a policy denial.
//
// That second table is a shared CDC config-master: it also holds the eight
// shared coaching topics and every domain topic behind the government-exam
// grid. Widening its policy is a schema change and this lane ships no SQL
// (Wave 3 Lane S3 is the only lane with a migration), so the elevation lives
// HERE, in the route, and is fenced twice:
//
//   1. the caller must hold foundation.items.manage, checked against
//      auth.uid() by the same RPC the page checks; and
//   2. the row must be a OneMark unit — its config_key must start with
//      `onemark_` AND it must be mapped to a OneMark subject in
//      exam_topic_map. A coaching topic can never be reached from here, so a
//      question author gains write access to OneMark's own units and to
//      nothing else in the table.
//
// Every read below still runs on the SESSION client, so RLS — not this file —
// decides what a caller may see.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ONEMARK_SUBJECT_KEYS,
  isOneMarkUnitKey,
  type RawExam,
  type RawItemCount,
  type RawMapping,
  type RawTopic,
} from '@/lib/services/onemark/units-service';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/** The shared taxonomy table a unit's name and state live in, and the per-exam
 *  junction that holds its position. Named once so every helper agrees. */
export const TOPICS_TABLE = 'cdc_exam_syllabus_topics';
export const MAP_TABLE = 'exam_topic_map';

export interface UnitsGate {
  userId: string;
  canManage: boolean;
}

/**
 * The same key the page checks, checked again here. Single-argument overload:
 * user_has_permission resolves against auth.uid() internally, so nothing is
 * forgeable from the browser.
 *
 * An RPC FAILURE is thrown, not read as "no" — a timed-out permission check
 * must surface as a 500, so a 403 keeps meaning what it says (CLAUDE.md #27).
 */
export async function gate(supabase: AnyClient): Promise<UnitsGate | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc('user_has_permission', {
    permission_name: 'foundation.items.manage',
  });
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  return { userId: user.id, canManage: data === true };
}

export async function loadSubjects(supabase: AnyClient): Promise<RawExam[]> {
  const { data, error } = await supabase
    .from('exam_definitions')
    .select('id, config_key, display_name, sort_order')
    .in('config_key', ONEMARK_SUBJECT_KEYS as string[])
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((e: RawExam) => ({
    id: e.id,
    config_key: e.config_key,
    display_name: e.display_name,
  }));
}

export async function loadMappings(supabase: AnyClient, examIds: string[]): Promise<RawMapping[]> {
  if (examIds.length === 0) return [];
  const { data, error } = await supabase
    .from(MAP_TABLE)
    .select('exam_definition_id, topic_id, sort_order')
    .in('exam_definition_id', examIds);
  if (error) throw error;
  return (data ?? []) as RawMapping[];
}

export async function loadTopics(supabase: AnyClient, topicIds: string[]): Promise<RawTopic[]> {
  if (topicIds.length === 0) return [];
  const { data, error } = await supabase
    .from(TOPICS_TABLE)
    .select('id, config_key, display_name, description, is_active, is_system')
    .in('id', topicIds);
  if (error) throw error;
  return (data ?? []) as RawTopic[];
}

const PAGE = 1000;

/** Every config_key already in the shared taxonomy — the uniqueness set a new
 *  unit key is minted against. The column is UNIQUE, so a race still loses at
 *  the database; this only keeps the common case off that error.
 *
 *  PAGED, as of the 2026-09-08 review. It was a single unbounded select, which
 *  PostgREST silently truncates at 1,000 rows — and this is precisely the read
 *  the uniqueness of a minted key depends on (`unitConfigKey`). A truncated
 *  list would hand back a key that already exists and the author would see a
 *  raw Postgres unique-violation as a 500. 36 topics live today (measured
 *  2026-09-08), so nothing broke; it would have broken quietly, later, in the
 *  shared taxonomy that CDC also grows. Ordered so the pages are stable. */
export async function loadTakenKeys(supabase: AnyClient): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TOPICS_TABLE)
      .select('config_key')
      .order('config_key', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { config_key: string }[];
    out.push(...rows.map((r) => r.config_key));
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Per-unit bank counts. Paged past PostgREST's 1,000-row cap because the bank
 *  is meant to reach 300 questions per subject (decision 8) and today holds 1.
 *
 *  THE ORDER IS PART OF THE PAGING, not decoration (review finding,
 *  2026-09-08). `.range()` over an UNORDERED select has no stable row order
 *  between requests, so once the bank passes 1,000 items the pages can repeat
 *  and drop rows — and every per-unit count on the screen goes quietly wrong,
 *  with no error to notice. Decision 8 targets 300 items per subject, so this
 *  would have started biting at roughly two subjects' worth of growth. */
export async function loadItemCounts(
  supabase: AnyClient,
  examIds: string[],
): Promise<RawItemCount[]> {
  if (examIds.length === 0) return [];
  const out: RawItemCount[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('fp_items')
      .select('topic_id, is_active')
      .in('exam_definition_id', examIds)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as RawItemCount[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export interface ResolvedUnit {
  topic_id: string;
  config_key: string;
  exam_definition_id: string;
  position: number;
}

/**
 * The fence in front of every write. Resolves a topic id to a OneMark unit, or
 * returns null when it is not one — a coaching topic, a Foundation Science
 * topic, or an id that does not exist. Both halves must hold: the key prefix
 * AND a mapping to a OneMark subject.
 */
export async function resolveOneMarkUnit(
  supabase: AnyClient,
  topicId: string,
): Promise<ResolvedUnit | null> {
  const subjects = await loadSubjects(supabase);
  const examIds = subjects.map((s) => s.id);
  if (examIds.length === 0) return null;

  const { data: mapRows, error: mapErr } = await supabase
    .from(MAP_TABLE)
    .select('exam_definition_id, topic_id, sort_order')
    .eq('topic_id', topicId)
    .in('exam_definition_id', examIds);
  if (mapErr) throw mapErr;
  const mapping = (mapRows ?? [])[0] as RawMapping | undefined;
  if (!mapping) return null;

  const { data: topic, error: topicErr } = await supabase
    .from(TOPICS_TABLE)
    .select('id, config_key')
    .eq('id', topicId)
    .maybeSingle();
  if (topicErr) throw topicErr;
  if (!topic || !isOneMarkUnitKey(topic.config_key)) return null;

  return {
    topic_id: topic.id,
    config_key: topic.config_key,
    exam_definition_id: mapping.exam_definition_id,
    position: mapping.sort_order ?? 100,
  };
}
