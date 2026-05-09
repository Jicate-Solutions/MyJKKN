// lib/services/admin/internship-policy-service.ts
// Admin service for managing internship module policy configuration.
// Mirrors the pattern of counselor-routing-config-service.ts (Spec #537).
//
// Operates on:
//   - platform_policies rows with key prefix "internship.policy.*"
//   - internship_college_notification_overrides
//   - All 8 internship config tables (for row-count dashboard)
//
// TODO: Replace InternshipPolicyRow / InternshipCollegeNotificationOverride types
//       with generated DB types after Agent A migration + types regen.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipPolicyRow,
  InternshipCollegeNotificationOverride,
  InternshipConfigTableInfo,
  ServiceResult,
  ServiceListResult,
} from '@/lib/services/internships/types';

const POLICY_PREFIX = 'internship.policy.' as const;
const PLATFORM_POLICIES_TABLE = 'platform_policies' as const;
const OVERRIDES_TABLE = 'internship_college_notification_overrides' as const;

// The 8 internship config tables — used for the admin dashboard row-count view.
const INTERNSHIP_CONFIG_TABLES = [
  'internship_posting_cycles',
  'internship_external_sites',
  'internship_site_contacts',
  'internship_preceptors',
  'internship_vehicles',
  'internship_incidents',
  'internship_evaluations',
  'internship_certificates',
] as const;

// ---------------------------------------------------------------------------
// Policy keys
// ---------------------------------------------------------------------------

/**
 * Returns all platform_policies rows whose key starts with "internship.policy.*".
 */
export async function listPolicyKeys(
  supabase: SupabaseClient
): Promise<ServiceListResult<InternshipPolicyRow>> {
  const { data, error } = await supabase
    .from(PLATFORM_POLICIES_TABLE)
    .select('key, value, description, college_id, updated_at, updated_by')
    .like('key', `${POLICY_PREFIX}%`)
    .order('key', { ascending: true });

  return {
    data: (data as InternshipPolicyRow[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

/**
 * Upsert a single policy value with an audit reason.
 * Uses platform_policies upsert on (key, college_id).
 */
export async function updatePolicyValue(
  supabase: SupabaseClient,
  key: string,
  value: string,
  changeReason: string,
  updatedBy: string
): Promise<ServiceResult<InternshipPolicyRow>> {
  // Enforce the prefix so callers cannot accidentally mutate other policy domains.
  const safeKey = key.startsWith(POLICY_PREFIX) ? key : `${POLICY_PREFIX}${key}`;

  const { data, error } = await supabase
    .from(PLATFORM_POLICIES_TABLE)
    .upsert(
      {
        key: safeKey,
        value,
        change_reason: changeReason,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
    .select('key, value, description, college_id, updated_at, updated_by')
    .single();

  return {
    data: (data as InternshipPolicyRow) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

// ---------------------------------------------------------------------------
// Config table inventory
// ---------------------------------------------------------------------------

/**
 * Returns row counts for all 8 internship config tables.
 * Used by the admin dashboard overview panel.
 */
export async function listConfigTables(
  supabase: SupabaseClient
): Promise<ServiceListResult<InternshipConfigTableInfo>> {
  const results: InternshipConfigTableInfo[] = [];
  const errors: string[] = [];

  // Run counts in parallel — each table is a separate Supabase head query.
  const counts = await Promise.all(
    INTERNSHIP_CONFIG_TABLES.map(async (tableName) => {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        errors.push(`${tableName}: ${error.message}`);
        return { table_name: tableName, row_count: 0 };
      }
      return { table_name: tableName, row_count: count ?? 0 };
    })
  );

  results.push(...counts);

  return {
    data: results,
    error: errors.length > 0 ? new Error(errors.join('; ')) : null,
  };
}

// ---------------------------------------------------------------------------
// College notification overrides
// ---------------------------------------------------------------------------

/**
 * Returns all college-level notification overrides.
 */
export async function listCollegeOverrides(
  supabase: SupabaseClient,
  collegeId?: string
): Promise<ServiceListResult<InternshipCollegeNotificationOverride>> {
  let query = supabase
    .from(OVERRIDES_TABLE)
    .select('*')
    .order('college_id', { ascending: true })
    .order('key', { ascending: true });

  if (collegeId) query = query.eq('college_id', collegeId);

  const { data, error } = await query;
  return {
    data: (data as InternshipCollegeNotificationOverride[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

/**
 * Upsert a college-level notification override.
 * Conflicts on (college_id, key).
 */
export async function upsertCollegeOverride(
  supabase: SupabaseClient,
  collegeId: string,
  key: string,
  value: string,
  updatedBy: string
): Promise<ServiceResult<InternshipCollegeNotificationOverride>> {
  const { data, error } = await supabase
    .from(OVERRIDES_TABLE)
    .upsert(
      {
        college_id: collegeId,
        key,
        value,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'college_id,key' }
    )
    .select()
    .single();

  return {
    data: (data as InternshipCollegeNotificationOverride) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

/**
 * Delete a college-level override (reverts to global policy value).
 */
export async function deleteCollegeOverride(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from(OVERRIDES_TABLE)
    .delete()
    .eq('id', id);

  return {
    data: null,
    error: error ? new Error(error.message) : null,
  };
}
