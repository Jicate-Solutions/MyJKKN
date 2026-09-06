/**
 * lib/services/admin/cdc-admin-service.ts
 * Admin service for CDC /cdc/admin/* pages (Sprint 7a).
 *
 * Pattern: mirrors internship-policy-service.ts — functional API (explicit
 * SupabaseClient) for server/API use, plus a class shim for client components.
 *
 * Operates on:
 *   - platform_policies rows with key prefix "cdc."
 *   - cdc_drive_types, cdc_offer_types, cdc_training_types,
 *     cdc_workshop_types, cdc_industry_sectors, cdc_recruiters (master tables)
 *   - cron.job + cron.job_run_details (read-only cron status)
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcPolicyRow,
  CdcMasterTable,
  CdcCronJobStatus,
} from '@/types/admin/cdc';

const CDC_POLICY_PREFIX = 'cdc.' as const;
const PLATFORM_POLICIES_TABLE = 'platform_policies' as const;

// Allowed master tables — validated server-side in the API route.
export const ALLOWED_MASTER_TABLES: CdcMasterTable[] = [
  'cdc_drive_types',
  'cdc_offer_types',
  'cdc_training_types',
  'cdc_workshop_types',
  'cdc_industry_sectors',
  'cdc_recruiters',
  'cdc_mentor_categories',
  'cdc_mentorship_categories',
  'cdc_internship_types',
  'cdc_expertise_areas',
  'cdc_exam_syllabus_topics', // 2026-07-04 govt-job-readiness (PR-4 / Option B)
];

// Master tables whose schema has a NOT NULL, UNIQUE `config_key` with no default
// or generating trigger. The generic add/edit form (master-table-page.tsx) only
// collects display_name/description, so on INSERT we must derive config_key from
// the display name — otherwise every "Add" fails with a not-null violation.
// cdc_recruiters is intentionally ABSENT: it has no config_key column (bespoke
// company schema handled by its own admin page), so we must not inject one.
const CONFIG_KEY_TABLES: ReadonlySet<string> = new Set([
  'cdc_drive_types',
  'cdc_offer_types',
  'cdc_training_types',
  'cdc_workshop_types',
  'cdc_industry_sectors',
  'cdc_internship_types',
  'cdc_mentor_categories',
  'cdc_mentorship_categories',
  'cdc_expertise_areas',
]);

/** Derive a snake_case config_key slug from a display name (e.g. "On-Campus
 *  Drive" -> "on_campus_drive"). Uniqueness is enforced by the table's UNIQUE
 *  constraint; a collision surfaces as a clear error to the caller. */
function slugifyConfigKey(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_') // non-alphanumeric runs -> underscore
    .replace(/^_+|_+$/g, '') // trim leading/trailing underscores
    .slice(0, 60);
  return slug || 'item';
}

// CDC cron job names as seeded in Sprint 1.
export const CDC_CRON_JOBS = [
  'cdc-coordinator-escalation',
  'cdc-placement-snapshot',
] as const;

// =====================================================================================
// Policies
// =====================================================================================

/** List all cdc.* platform_policies rows at global scope. */
export async function listCdcPolicies(
  supabase: SupabaseClient
): Promise<{ data: CdcPolicyRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from(PLATFORM_POLICIES_TABLE)
    .select('policy_key, value, description, data_type, classification, updated_at, updated_by')
    .like('policy_key', `${CDC_POLICY_PREFIX}%`)
    .eq('scope_type', 'global')
    .order('policy_key', { ascending: true });

  if (error) return { data: [], error: new Error(error.message) };

  const rows: CdcPolicyRow[] = (data ?? []).map((raw: any) => ({
    policy_key: raw.policy_key,
    value: raw.value,
    description: raw.description ?? null,
    data_type: raw.data_type ?? 'string',
    classification: raw.classification ?? 'operational',
    updated_at: raw.updated_at ?? null,
    updated_by: raw.updated_by ?? null,
  }));

  return { data: rows, error: null };
}

/** Update a single cdc.* policy value. Enforces prefix + type coercion. */
export async function updateCdcPolicy(
  supabase: SupabaseClient,
  key: string,
  value: unknown,
  updatedBy: string
): Promise<{ error: Error | null }> {
  if (!key.startsWith(CDC_POLICY_PREFIX)) {
    return { error: new Error('Policy key must start with "cdc."') };
  }

  const { error } = await supabase
    .from(PLATFORM_POLICIES_TABLE)
    .update({ value, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('policy_key', key)
    .eq('scope_type', 'global');

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

// =====================================================================================
// Master tables
// =====================================================================================

/** Generic list for a master table — returns all rows ordered by sort_order. */
export async function listMasterRows(
  supabase: SupabaseClient,
  table: CdcMasterTable,
  page = 1,
  pageSize = 50
): Promise<{ data: any[]; count: number; error: Error | null }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact' })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('display_name', { ascending: true })
    .range(from, to);

  if (error) return { data: [], count: 0, error: new Error(error.message) };
  return { data: data ?? [], count: count ?? 0, error: null };
}

/** Soft-delete (set is_active=false) or restore (is_active=true). */
export async function toggleMasterRowActive(
  supabase: SupabaseClient,
  table: CdcMasterTable,
  id: string,
  isActive: boolean
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(table)
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/** Insert a new master row. Fields vary by table; caller provides payload. */
export async function insertMasterRow(
  supabase: SupabaseClient,
  table: CdcMasterTable,
  payload: Record<string, unknown>
): Promise<{ data: any; error: Error | null }> {
  const insertPayload: Record<string, unknown> = { ...payload, is_active: true };

  // Derive config_key for typed master tables when the caller didn't supply one.
  // These columns are NOT NULL + UNIQUE with no default/trigger, and the generic
  // form never collects config_key — so without this, every "Add" fails.
  if (
    CONFIG_KEY_TABLES.has(table) &&
    !insertPayload.config_key &&
    typeof insertPayload.display_name === 'string' &&
    insertPayload.display_name.trim()
  ) {
    insertPayload.config_key = slugifyConfigKey(insertPayload.display_name as string);
  }

  const { data, error } = await supabase
    .from(table)
    .insert(insertPayload)
    .select()
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}

/** Update a master row by id. */
export async function updateMasterRow(
  supabase: SupabaseClient,
  table: CdcMasterTable,
  id: string,
  payload: Record<string, unknown>
): Promise<{ data: any; error: Error | null }> {
  const { data, error } = await supabase
    .from(table)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}

// =====================================================================================
// Exam ↔ topic map (govt-job-readiness junction)
// =====================================================================================
// UNIFIED-JUNCTION SWITCH (2026-07-06): these helpers now read/write the unified
// exam_topic_map (keyed on exam_definition_id) instead of the legacy
// cdc_exam_topic_map (keyed on cdc_training_types.id). The junction still cannot
// be expressed as a flat master (it is a pair of FKs, no display_name/config_key),
// so it does not fit MasterTablePage; these back the dedicated matrix editor at
// /cdc/admin/exam-topic-map (deep-review #3).
//
// The public contract is UNCHANGED: callers pass a cdc_training_types id
// (`examTrainingTypeId`) and receive rows shaped { exam_training_type_id,
// topic_id }. The translation to/from the unified junction rides on
// exam_definitions.cdc_training_type_id — a proven 1:1 link for the 7 college
// govt-exam definitions (parity: exam_topic_map's 68 college rows map to exactly
// the 68 legacy (tt,topic) pairs). School exam_definitions have a null
// cdc_training_type_id and no legacy analogue, so they never surface here.

// Unified topic↔exam junction + its exam-definition parent (the translation key).
export const EXAM_TOPIC_MAP_TABLE = 'exam_topic_map' as const;
export const EXAM_DEFINITIONS_TABLE = 'exam_definitions' as const;

// Kept for reference / any migration tooling — the legacy junction this replaces.
export const LEGACY_EXAM_TOPIC_MAP_TABLE = 'cdc_exam_topic_map' as const;

export interface ExamTopicMapRow {
  // The cdc_training_types id (translated from exam_definition_id) — the SAME
  // shape the legacy junction returned, so downstream consumers are unchanged.
  exam_training_type_id: string;
  topic_id: string;
}

/**
 * Resolve the unified exam_definitions id for a given cdc_training_types id.
 * Returns null when no exam_definition is linked to that training type (e.g. a
 * newly-added govt-exam type that has not yet been given an exam_definition row).
 */
async function resolveExamDefinitionId(
  supabase: SupabaseClient,
  examTrainingTypeId: string
): Promise<{ id: string | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(EXAM_DEFINITIONS_TABLE)
    .select('id')
    .eq('cdc_training_type_id', examTrainingTypeId)
    .maybeSingle();
  if (error) return { id: null, error: new Error(error.message) };
  return { id: (data as { id: string } | null)?.id ?? null, error: null };
}

/** All topic↔exam mappings, paginated past PostgREST's 1000-row default cap. */
export async function listExamTopicMap(
  supabase: SupabaseClient
): Promise<{ data: ExamTopicMapRow[]; error: Error | null }> {
  const PAGE = 1000;
  const all: ExamTopicMapRow[] = [];
  for (let from = 0; ; from += PAGE) {
    // Read the unified junction and JOIN exam_definitions
    // (ed.id = exam_topic_map.exam_definition_id), translating each mapping back
    // to its cdc_training_types id via ed.cdc_training_type_id. The !inner join
    // + not-null filter restrict to college govt-exam mappings (the only ones
    // the legacy junction held).
    const { data, error } = await supabase
      .from(EXAM_TOPIC_MAP_TABLE)
      .select('topic_id, exam_definition_id, exam_definitions!inner(cdc_training_type_id)')
      .not('exam_definitions.cdc_training_type_id', 'is', null)
      .order('exam_definition_id', { ascending: true })
      .order('topic_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { data: [], error: new Error(error.message) };
    const rows = (data ?? []) as unknown as Array<{
      topic_id: string;
      exam_definition_id: string;
      exam_definitions:
        | { cdc_training_type_id: string | null }
        | { cdc_training_type_id: string | null }[]
        | null;
    }>;
    for (const r of rows) {
      const ed = Array.isArray(r.exam_definitions) ? r.exam_definitions[0] : r.exam_definitions;
      const ttId = ed?.cdc_training_type_id;
      // Keep the output shape EXACT — only emit rows that translate to a
      // training-type id (guaranteed non-null by the !inner + filter above).
      if (ttId) all.push({ exam_training_type_id: ttId, topic_id: r.topic_id });
    }
    if (rows.length < PAGE) break;
  }
  return { data: all, error: null };
}

/**
 * Add one mapping. Idempotent — a duplicate (exam, topic) pair is a no-op.
 * The caller-supplied cdc_training_types id is translated to its
 * exam_definition_id before writing to the unified junction. If no
 * exam_definition is linked to that training type, returns a clear error rather
 * than silently succeeding (rule: no silent failure).
 */
export async function addExamTopicMapping(
  supabase: SupabaseClient,
  examTrainingTypeId: string,
  topicId: string,
  userId?: string
): Promise<{ error: Error | null }> {
  const { id: examDefinitionId, error: resolveErr } = await resolveExamDefinitionId(
    supabase,
    examTrainingTypeId
  );
  if (resolveErr) return { error: resolveErr };
  if (!examDefinitionId) {
    return {
      error: new Error(
        'No exam definition is linked to this training type — create its exam definition before mapping topics.'
      ),
    };
  }

  const { error } = await supabase
    .from(EXAM_TOPIC_MAP_TABLE)
    .upsert(
      {
        exam_definition_id: examDefinitionId,
        topic_id: topicId,
        created_by: userId ?? null,
        updated_by: userId ?? null,
      },
      { onConflict: 'exam_definition_id,topic_id', ignoreDuplicates: true }
    );

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Remove one mapping by its (exam, topic) pair. Missing pair → no-op.
 * The caller-supplied cdc_training_types id is translated to its
 * exam_definition_id first; an unlinked training type resolves to no rows (no-op).
 */
export async function removeExamTopicMapping(
  supabase: SupabaseClient,
  examTrainingTypeId: string,
  topicId: string
): Promise<{ error: Error | null }> {
  const { id: examDefinitionId, error: resolveErr } = await resolveExamDefinitionId(
    supabase,
    examTrainingTypeId
  );
  if (resolveErr) return { error: resolveErr };
  if (!examDefinitionId) return { error: null }; // nothing to delete — no-op

  const { error } = await supabase
    .from(EXAM_TOPIC_MAP_TABLE)
    .delete()
    .eq('exam_definition_id', examDefinitionId)
    .eq('topic_id', topicId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

// =====================================================================================
// Cron status
// =====================================================================================

/**
 * Read last-run + next-run for CDC cron jobs.
 * Queries cron.job and cron.job_run_details via a raw RPC (service-role only).
 * Falls back to empty array on error (non-critical; cron schema may not be exposed).
 */
export async function getCdcCronStatus(
  supabase: SupabaseClient
): Promise<{ data: CdcCronJobStatus[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('fn_cdc_cron_status');

  if (error) {
    // Graceful degradation — cron schema often inaccessible from anon/user roles.
    return { data: [], error: new Error(error.message) };
  }

  return { data: (data as CdcCronJobStatus[]) ?? [], error: null };
}

// =====================================================================================
// Class shim (for client components that can't await at module level)
// =====================================================================================

export class CdcAdminService {
  private supabase: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase ?? createClientSupabaseClient();
  }

  listPolicies() {
    return listCdcPolicies(this.supabase);
  }

  updatePolicy(key: string, value: unknown, updatedBy: string) {
    return updateCdcPolicy(this.supabase, key, value, updatedBy);
  }

  listMasterRows(table: CdcMasterTable, page?: number, pageSize?: number) {
    return listMasterRows(this.supabase, table, page, pageSize);
  }

  toggleMasterRowActive(table: CdcMasterTable, id: string, isActive: boolean) {
    return toggleMasterRowActive(this.supabase, table, id, isActive);
  }

  insertMasterRow(table: CdcMasterTable, payload: Record<string, unknown>) {
    return insertMasterRow(this.supabase, table, payload);
  }

  updateMasterRow(table: CdcMasterTable, id: string, payload: Record<string, unknown>) {
    return updateMasterRow(this.supabase, table, id, payload);
  }

  listExamTopicMap() {
    return listExamTopicMap(this.supabase);
  }

  addExamTopicMapping(examTrainingTypeId: string, topicId: string, userId?: string) {
    return addExamTopicMapping(this.supabase, examTrainingTypeId, topicId, userId);
  }

  removeExamTopicMapping(examTrainingTypeId: string, topicId: string) {
    return removeExamTopicMapping(this.supabase, examTrainingTypeId, topicId);
  }

  getCronStatus() {
    return getCdcCronStatus(this.supabase);
  }
}
