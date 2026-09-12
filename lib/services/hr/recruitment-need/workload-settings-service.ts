/**
 * Per-institution workload settings (Director decision 2026-09-12).
 *
 * WHAT A "SETTING" IS HERE
 *   Three platform_policies rows per institution (scope_type='institution',
 *   scope_id=institutions.id):
 *     hr_recruitment.workload_norm_hours        expected weekly teaching hours
 *     hr_recruitment.threshold_amber_workload   % of expected at which a
 *                                               Senior Learner turns amber
 *     hr_recruitment.threshold_red_workload     % of expected at which they
 *                                               turn red
 *   The keys are the ones the Senior Learner calendar Workload tab reads
 *   (WORKLOAD_POLICY_KEYS in lib/services/academic/faculty-calendar-insights-
 *   service) — the tab compares per institution and does NOT fall back to the
 *   global seed, so an institution with no row shows "expected hours not set".
 *   Institutions differ (AICTE 16, dental/nursing clinical loads differ), which
 *   is why expected hours is a free number with no fixed list.
 *
 * WHO MAY TOUCH IT
 *   HR Admin and Super Admin only. HR Admin is commonly a SECONDARY role held
 *   through user_roles while profiles.role says something else (a COO who is
 *   also HR Admin), so access resolution reads both — the same trap
 *   app/api/hr/dashboard documents. A refusal carries a plain-English reason so
 *   the route can answer 403 with it; nothing here redirects.
 *
 * WHY WRITES GO THROUGH THE SERVICE-ROLE CLIENT
 *   platform_policies INSERT/UPDATE RLS admits is_super_admin() OR is_admin()
 *   (profiles.role in super_admin/administrator). An HR Admin holding the role
 *   through user_roles is refused by RLS. Rather than widen RLS (a migration —
 *   out of this change's ceiling), the API route verifies the role itself with
 *   resolveWorkloadSettingsAccess and then writes with the service-role client,
 *   the pattern app/api/hr/attendance/recompute already uses. Reads stay on the
 *   session client (SELECT is open to any signed-in user).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const WORKLOAD_SETTING_KEYS = {
  expectedHours: 'hr_recruitment.workload_norm_hours',
  amberPct: 'hr_recruitment.threshold_amber_workload',
  redPct: 'hr_recruitment.threshold_red_workload',
} as const;

const KEY_DESCRIPTIONS: Record<keyof typeof WORKLOAD_SETTING_KEYS, string> = {
  expectedHours: 'Expected weekly teaching hours for this institution (set on /hr/workload/settings)',
  amberPct: 'Workload % of expected at or below which a Senior Learner is green; above = amber (per institution)',
  redPct: 'Workload % of expected above which a Senior Learner is red (per institution)',
};

/** Roles (custom_roles.role_key / profiles.role) that may manage the settings besides super admin. */
export const WORKLOAD_SETTINGS_ROLE_KEYS: readonly string[] = ['hr_admin'];

export interface WorkloadSettingsInput {
  expected_weekly_hours: number;
  amber_pct: number;
  red_pct: number;
}

export interface InstitutionWorkloadSettings {
  institution_id: string;
  institution_name: string;
  expected_weekly_hours: number | null;
  amber_pct: number | null;
  red_pct: number | null;
  /** Latest updated_at across the institution's three rows. */
  updated_at: string | null;
}

export interface WorkloadPolicyRow {
  policy_key: string;
  scope_type: string;
  scope_id: string | null;
  value: unknown;
  is_active: boolean | null;
  updated_at: string | null;
}

export type WorkloadSettingsAccess = { allowed: true } | { allowed: false; reason: string };

export const WORKLOAD_SETTINGS_DENIED =
  "You don't have access to workload settings. Only HR Admin and Super Admin can view or change them — contact your HR Admin.";

// ─── Pure helpers ───────────────────────────────────────────────────────────

export function canManageWorkloadSettings(args: { isSuperAdmin: boolean; roleKeys: string[] }): boolean {
  if (args.isSuperAdmin) return true;
  return args.roleKeys.some((k) => WORKLOAD_SETTINGS_ROLE_KEYS.includes(k));
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function validateWorkloadSettings(
  input: unknown
): { ok: true; value: WorkloadSettingsInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Settings body required' };
  const o = input as Record<string, unknown>;
  const hours = toNumber(o.expected_weekly_hours);
  const amber = toNumber(o.amber_pct);
  const red = toNumber(o.red_pct);
  if (hours === null || amber === null || red === null) {
    return { ok: false, error: 'expected_weekly_hours, amber_pct and red_pct must all be numbers' };
  }
  if (hours <= 0) return { ok: false, error: 'Expected weekly hours must be greater than 0' };
  if (amber < 0) return { ok: false, error: 'Amber threshold cannot be negative' };
  if (red <= amber) {
    return { ok: false, error: 'Red threshold must be higher than amber (more hours than expected is worse)' };
  }
  return { ok: true, value: { expected_weekly_hours: hours, amber_pct: amber, red_pct: red } };
}

export function parseInstitutionWorkloadSettings(
  institutions: Array<{ id: string; name: string }>,
  rows: WorkloadPolicyRow[]
): InstitutionWorkloadSettings[] {
  const byInstitution = new Map<string, InstitutionWorkloadSettings>();
  for (const inst of institutions) {
    byInstitution.set(inst.id, {
      institution_id: inst.id,
      institution_name: inst.name,
      expected_weekly_hours: null,
      amber_pct: null,
      red_pct: null,
      updated_at: null,
    });
  }
  for (const r of rows) {
    if (r.scope_type !== 'institution' || !r.scope_id || r.is_active === false) continue;
    const target = byInstitution.get(r.scope_id);
    if (!target) continue;
    const n = toNumber(r.value);
    if (r.policy_key === WORKLOAD_SETTING_KEYS.expectedHours) target.expected_weekly_hours = n;
    else if (r.policy_key === WORKLOAD_SETTING_KEYS.amberPct) target.amber_pct = n;
    else if (r.policy_key === WORKLOAD_SETTING_KEYS.redPct) target.red_pct = n;
    else continue;
    if (r.updated_at && (!target.updated_at || r.updated_at > target.updated_at)) {
      target.updated_at = r.updated_at;
    }
  }
  return [...byInstitution.values()];
}

// ─── Access ─────────────────────────────────────────────────────────────────

export async function resolveWorkloadSettingsAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkloadSettingsAccess> {
  const [{ data: profile }, { data: userRoles }] = await Promise.all([
    supabase.from('profiles').select('role, is_super_admin').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('custom_roles!inner(role_key)').eq('user_id', userId),
  ]);
  const profileRole = (profile?.role as string | undefined) ?? '';
  const isSuperAdmin = profile?.is_super_admin === true || profileRole === 'super_admin';
  const roleKeys = (Array.isArray(userRoles) ? userRoles : [])
    .map((r: any) => r?.custom_roles?.role_key)
    .filter((k: unknown): k is string => typeof k === 'string');
  if (profileRole) roleKeys.push(profileRole);
  return canManageWorkloadSettings({ isSuperAdmin, roleKeys })
    ? { allowed: true }
    : { allowed: false, reason: WORKLOAD_SETTINGS_DENIED };
}

// ─── Service ────────────────────────────────────────────────────────────────

export class WorkloadSettingsService {
  /** Every institution with its own settings (nulls where none are set). Session client. */
  static async list(supabase: SupabaseClient): Promise<InstitutionWorkloadSettings[]> {
    const [inst, pol] = await Promise.all([
      supabase.from('institutions').select('id, name').order('name'),
      supabase
        .from('platform_policies')
        .select('policy_key, scope_type, scope_id, value, is_active, updated_at')
        .in('policy_key', Object.values(WORKLOAD_SETTING_KEYS))
        .eq('scope_type', 'institution'),
    ]);
    if (inst.error) throw new Error(`Failed to list institutions: ${inst.error.message}`);
    if (pol.error) throw new Error(`Failed to read workload settings: ${pol.error.message}`);
    return parseInstitutionWorkloadSettings(
      (inst.data ?? []) as Array<{ id: string; name: string }>,
      (pol.data ?? []) as WorkloadPolicyRow[]
    );
  }

  /**
   * Write the three institution rows. `admin` must be the service-role client
   * (see header); the caller has already verified the role. Update-then-insert
   * rather than upsert: the table's uniqueness is an expression index over
   * COALESCE(scope_id, sentinel), which PostgREST's on_conflict cannot name.
   */
  static async save(
    admin: SupabaseClient,
    institutionId: string,
    input: WorkloadSettingsInput,
    userId: string
  ): Promise<void> {
    const entries: Array<[keyof typeof WORKLOAD_SETTING_KEYS, number]> = [
      ['expectedHours', input.expected_weekly_hours],
      ['amberPct', input.amber_pct],
      ['redPct', input.red_pct],
    ];
    for (const [field, value] of entries) {
      const policyKey = WORKLOAD_SETTING_KEYS[field];
      const { data: updated, error: updateError } = await admin
        .from('platform_policies')
        .update({ value, is_active: true, updated_by: userId })
        .eq('policy_key', policyKey)
        .eq('scope_type', 'institution')
        .eq('scope_id', institutionId)
        .select('id');
      if (updateError) throw new Error(`Failed to save ${policyKey}: ${updateError.message}`);
      if (updated && updated.length > 0) continue;

      const { error: insertError } = await admin.from('platform_policies').insert({
        policy_key: policyKey,
        scope_type: 'institution',
        scope_id: institutionId,
        value,
        description: KEY_DESCRIPTIONS[field],
        data_type: 'number',
        ui_widget: 'number',
        ui_category: 'hr_recruitment',
        is_active: true,
        updated_by: userId,
      });
      if (insertError) throw new Error(`Failed to save ${policyKey}: ${insertError.message}`);
    }
  }
}
