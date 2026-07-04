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
  const { data, error } = await supabase
    .from(table)
    .insert({ ...payload, is_active: true })
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

  getCronStatus() {
    return getCdcCronStatus(this.supabase);
  }
}
