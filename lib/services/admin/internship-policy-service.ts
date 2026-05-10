// lib/services/admin/internship-policy-service.ts
// Admin service for managing internship module policy configuration.
// Mirrors the pattern of counselor-routing-config-service.ts (Spec #537).
//
// Operates on:
//   - platform_policies rows with key prefix "internship.policy.*"
//   - internship_college_notification_overrides
//   - All 8 internship config tables (for row-count dashboard)
//
// EXPORT SHAPE — TWO APIS BY DESIGN:
//   1. Functional API (server-side) — used by API routes and server components.
//      Each function takes an explicit SupabaseClient. Trivially testable.
//   2. Class shim (`InternshipPolicyService`) + key constant (`INTERNSHIP_POLICY_KEYS`)
//      + `PolicyRow` type — used by the admin UI (Agent C). Created on top of
//      the functional API so both worlds compose without duplicating logic.
//
// TODO: Replace InternshipPolicyRow / InternshipCollegeNotificationOverride types
//       with generated DB types after Agent A migration + types regen.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipPolicyRow,
  InternshipCollegeNotificationOverride,
  InternshipConfigTableInfo,
  ServiceResult,
  ServiceListResult,
} from '@/lib/services/internships/types';
import type {
  CascadePreviewData,
  ProposedChange,
} from '@/components/shared/cascade-preview/types';

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

// ===========================================================================
// Backward-compat shim for the admin UI (Agent C)
// ---------------------------------------------------------------------------
// Agent C's pages and PolicyField component expect a class-based API plus a
// constant key map. The shim below delegates to the functional API above so we
// keep one source of truth for the actual database calls.
//
// Key mapping below resolves UPPER_SNAKE constants -> the actual seeded
// `internship.policy.*` keys in platform_policies. Where the seeded key has
// a different historical name, we point at it explicitly. Where no seed exists
// yet, we use the lowercase equivalent so the row will appear empty until the
// key is seeded — UI handles missing rows gracefully.
// ===========================================================================

/** Re-export of `InternshipPolicyRow` under the short name the admin UI uses. */
export type PolicyRow = InternshipPolicyRow;

/**
 * UPPER_SNAKE constant → actual `internship.policy.*` key seeded in
 * platform_policies. Used by all 6 category pages + page.tsx landing.
 */
export const INTERNSHIP_POLICY_KEYS = {
  // Eligibility / Fees
  FEE_COMPLIANCE_THRESHOLD: 'internship.policy.fee_compliance_threshold_pct',
  REGISTRATION_CUTOFF_DAYS: 'internship.policy.registration_cutoff_days',
  LOGBOOK_LATE_PENALTY_PCT: 'internship.policy.logbook_late_penalty_pct',
  // Attendance / GPS
  ATTENDANCE_FLAG_BELOW_PCT: 'internship.policy.attendance_warn_below_pct',
  GPS_STRICT_MODE: 'internship.policy.gps_geofence_strict_block',
  // Evaluation / Approvals
  APPROVAL_ESCALATE_AFTER_HOURS: 'internship.policy.approval_escalate_after_hours',
  LOGBOOK_SUBMIT_WITHIN_HOURS: 'internship.policy.logbook_submit_within_hours',
  LOGBOOK_EDIT_WINDOW_HOURS: 'internship.policy.logbook_late_edit_window_hours',
  // Cycle
  ROSTER_REMINDER_D_MINUS: 'internship.policy.roster_reminder_d_minus',
  VEHICLE_LEAD_TIME_DAYS: 'internship.policy.vehicle_lead_time_days',
  // Notifications
  NOTIFY_ROSTER_REMINDER_D_MINUS: 'internship.policy.notify_roster_reminder_d_minus',
  NOTIFY_FACULTY_SCHEDULE_D_MINUS: 'internship.policy.notify_faculty_schedule_d_minus',
  NOTIFY_LOGBOOK_REMINDER_AFTER_HOURS: 'internship.policy.notify_logbook_reminder_after_hours',
  NOTIFY_EVALUATION_REMINDER_AFTER_HOURS: 'internship.policy.notify_evaluation_reminder_after_hours',
  // Incidents
  INCIDENT_MINOR_NOTIFY_WITHIN_HOURS: 'internship.policy.incident_escalation_tier1_hours',
  INCIDENT_MAJOR_NOTIFY_WITHIN_HOURS: 'internship.policy.incident_escalation_tier2_hours',
  INCIDENT_CRITICAL_NOTIFY_WITHIN_HOURS: 'internship.policy.incident_escalation_critical_hours',
} as const;

export type InternshipPolicyKey =
  (typeof INTERNSHIP_POLICY_KEYS)[keyof typeof INTERNSHIP_POLICY_KEYS];

/**
 * Class shim — wraps the functional API so the admin UI's class-based call
 * sites compile. Each method creates a browser-side Supabase client on demand,
 * which matches the pattern used by other admin services
 * (counselor-routing-config-service, landing-page-policies-service, etc.).
 */
export class InternshipPolicyService {
  /**
   * Fetch many policy rows by key in a single round-trip.
   * Returns a map keyed by policy key. Missing keys are simply absent from
   * the returned object — callers should treat absence as "not yet seeded".
   */
  static async getMany(keys: string[]): Promise<Record<string, PolicyRow>> {
    if (!keys.length) return {};

    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from(PLATFORM_POLICIES_TABLE)
      .select('key, value, description, college_id, updated_at, updated_by')
      .in('key', keys);

    if (error) {
      console.error('[InternshipPolicyService.getMany]', error.message);
      return {};
    }

    const out: Record<string, PolicyRow> = {};
    for (const row of (data ?? []) as PolicyRow[]) {
      out[row.key] = row;
    }
    return out;
  }

  /**
   * Compute a cascade preview for a set of proposed policy changes.
   * Calls fn_internship_cascade_preview RPC. On failure returns an empty
   * preview with an error message so the UI can render the panel without
   * crashing.
   */
  static async computeCascadePreview(
    changes: ProposedChange[]
  ): Promise<CascadePreviewData> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_internship_cascade_preview', {
      p_changes: changes.map((c) => ({
        key: c.key,
        new_value: String(c.proposedValue),
      })),
    });

    if (error) {
      return {
        consequences: [],
        computedAt: new Date().toISOString(),
        isLoading: false,
        error: error.message,
      };
    }

    // The RPC returns a JSONB array of consequence rows. We tolerate both
    // {consequences: [...]} and [...] shapes for forward-compat.
    const rows = Array.isArray(data) ? data : data?.consequences ?? [];

    return {
      consequences: rows,
      computedAt: new Date().toISOString(),
      isLoading: false,
    };
  }

  /**
   * Upsert a single policy value. Returns a UI-friendly { ok, error } envelope
   * so call sites can `if (!res.ok) toast.error(res.error)` without unwrapping
   * the Error object.
   */
  static async upsert(
    key: string,
    value: unknown
  ): Promise<{ ok: boolean; error?: string }> {
    const supabase = createClientSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const result = await updatePolicyValue(
      supabase,
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
      'Updated via /admin/internship-policy',
      user?.id ?? 'system'
    );

    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  }
}
