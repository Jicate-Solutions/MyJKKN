// lib/api-helpers/admission-counselor-scope.ts
//
// Shared server-side helper for the leads + call_logs service-role API routes.
// These routes deliberately bypass RLS for performance (the admission_leads
// policies cascade 3 levels deep and exceed the 8s authenticated timeout —
// see lib/services/admission/lead-service.ts:113-117).
//
// Because RLS is bypassed, every service-role endpoint that returns
// counselor-visible data MUST manually re-implement the visibility rules
// from supabase/migrations/20260510210000_admission_leads_strict_counselor_visibility.sql
// or counselors will silently see all leads in their institution again.
//
// Strict counselor visibility model (since 2026-05-10):
//   counselor_id = my admission_counselors.id  OR  assigned_counselor_id = my user.id
// Source-mapping is NOT a visibility grant — it's routing config only.
// (Earlier model included a "source IN my mapped sources" branch; that was
// dropped after the user reported counselors seeing too-many-leads.)

import type { SupabaseClient } from '@supabase/supabase-js';
import { withRetry } from '@/lib/retry';

const COUNSELOR_ROLE_KEYS = [
  'admission_counselor',
  'expo_counselor',
  'learner_counselor',
  'staff_counselor',
] as const;

// Override roles — if a user holds ANY of these AND also a counselor role,
// they are NOT strict (they keep broad visibility). Mirrors the override
// set in _user_is_strict_counselor SQL helper.
// Final rule (2026-05-11): admission_staff and tier-1 execs see all leads
// even when they also hold a secondary counselor role.
// Reverted 2026-05-22 (later that day): the BUG-003938 expansion (hod, principal,
// dean, etc.) demoted every HOD-counselor at JKKN out of strict-counselor mode,
// silently leaking the entire 18,721-row leads dataset (e.g., Karthika J,
// staff_counselor+hod, was seeing 18,722 instead of her 169 assigned leads).
// User requirement: counselors who ALSO hold a senior-leadership role must
// stay scoped to their assigned leads. Senior-leadership users WITHOUT a
// counselor role are unaffected (they don't pass the hasAnyCounselorRole gate).
// SQL mirror: supabase/migrations/20260522110000_revert_strict_counselor_overrides_to_canonical.sql
const NON_COUNSELOR_OVERRIDE_ROLE_KEYS = [
  'admission',
  'admission_staff',
  'administrator',
  'super_admin',
  'ceo',
  'coo',
  'cbo',
  'registrar',
] as const;

// Canonical allowlist for the admission leads list — mirrors the SECURITY
// DEFINER helper `_user_in_admission_lead_allowlist(uuid)` in
// supabase/migrations/20260513140000_admission_leads_visibility_lockdown.sql.
// Drift = leak: if the SQL helper accepts a role this list rejects (or vice
// versa), the API and RLS no longer enforce the same rule.
// super_admin / is_admin bypass higher up; they don't need to be here.
const LEAD_VIEW_ALLOWLIST_ROLE_KEYS = [
  'admission',
  'admission_staff',
  'administrator',
  'ceo',
  'coo',
  'cbo',
  'registrar',
  'admission_counselor',
  'expo_counselor',
  'learner_counselor',
  'staff_counselor',
  'seo',
] as const;

export interface CounselorScope {
  /** True iff user holds one of the 4 counselor role_keys AND no broader admission/admin role. */
  isStrictCounselor: boolean;
  /** admission_counselors.id for this user — needed to filter admission_leads.counselor_id. */
  myAdmissionCounselorId: string | null;
}

/**
 * Compute the leads visibility scope for a given user.
 *
 * Returns:
 *   - isStrictCounselor=false → caller should NOT apply per-counselor filtering
 *     (user is super_admin / admin / admission office / scope='all' / etc.)
 *   - isStrictCounselor=true  → caller MUST apply the OR-filter
 *       counselor_id.eq.<myAdmissionCounselorId>
 *       OR assigned_counselor_id.eq.<user_id>
 *     If myAdmissionCounselorId is null AND the user has no leads with
 *     assigned_counselor_id = their user.id, the counselor has nothing
 *     visible — caller short-circuits to an empty response.
 */
export async function getCounselorScope(
  supabase: SupabaseClient,
  userId: string
): Promise<CounselorScope> {
  // 1. Detect strict-counselor — mirrors _user_is_strict_counselor()
  //    SQL helper. Final rule (2026-05-11):
  //      strict = has counselor role AND has NO admission/admin/exec override
  //    is_primary is NOT consulted. Override roles preserve broad visibility
  //    for multi-role admission_staff / tier-1 exec users.
  //
  // withRetry: a transient ECONNRESET on this Supabase socket used to fail
  // closed to `{isStrictCounselor: true, myAdmissionCounselorId: null}`,
  // dropping the counselor_id branch from the visibility OR and silently
  // making half the user's assigned leads invisible. 3 retries × ~1s
  // backoff covers nearly every stale-keep-alive blip — see project memory
  // feedback_supabase_econnreset_use_withretry.
  let roleRows: any = null;
  let roleErr: any = null;
  try {
    const res = await withRetry(async () => {
      const r = await supabase
        .from('user_roles')
        .select('custom_roles!inner(role_key)')
        .eq('user_id', userId);
      if (r.error) throw r.error;
      return r.data;
    });
    roleRows = res;
  } catch (err) {
    roleErr = err;
  }

  if (roleErr) {
    // After 3 retries it's a real persistent failure, not a transient blip.
    // Fail-closed: treat as strict counselor with empty scope so the user
    // sees nothing, rather than fail-open to "see everything".
    return { isStrictCounselor: true, myAdmissionCounselorId: null };
  }

  type RoleRow = { custom_roles?: { role_key?: string } | null };
  const rows = (roleRows ?? []) as RoleRow[];

  const hasAnyCounselorRole = rows.some((r) => {
    const k = r.custom_roles?.role_key;
    return typeof k === 'string'
      && (COUNSELOR_ROLE_KEYS as readonly string[]).includes(k);
  });
  const hasOverrideRole = rows.some((r) => {
    const k = r.custom_roles?.role_key;
    return typeof k === 'string'
      && (NON_COUNSELOR_OVERRIDE_ROLE_KEYS as readonly string[]).includes(k);
  });

  const isStrictCounselor = hasAnyCounselorRole && !hasOverrideRole;
  if (!isStrictCounselor) {
    return { isStrictCounselor: false, myAdmissionCounselorId: null };
  }

  // 2. Resolve admission_counselors.id — admission_leads.counselor_id points
  //    here, NOT to profiles.id. Without this, direct-assignment via the
  //    legacy counselor_id column would be invisible to its owner.
  //
  // Same retry treatment as the role query above. The previous code had no
  // error check at all — a transient null silently degraded visibility for
  // leads matched via counselor_id (admission_counselors.id).
  let myAdmissionCounselorId: string | null = null;
  try {
    const acRow = await withRetry(async () => {
      const r = await supabase
        .from('admission_counselors')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (r.error) throw r.error;
      return r.data;
    });
    myAdmissionCounselorId = (acRow as { id?: string } | null)?.id ?? null;
  } catch {
    // Persistent failure on the admission_counselors lookup. Leave
    // myAdmissionCounselorId as null — the user still gets the
    // assigned_counselor_id branch via buildLeadVisibilityOr.
    myAdmissionCounselorId = null;
  }

  return { isStrictCounselor: true, myAdmissionCounselorId };
}

/**
 * Build the PostgREST `.or(...)` argument that scopes admission_leads to the
 * given counselor's visibility. Returns null when there's nothing to filter
 * to (caller should return empty results).
 *
 * Strict model: counselor_id (admission_counselors.id) OR assigned_counselor_id
 * (auth.uid()). Source-mapping is NOT included — that's routing config, not
 * visibility (changed 2026-05-10 per user requirement).
 */
export function buildLeadVisibilityOr(scope: CounselorScope, userId: string): string | null {
  const parts: string[] = [];
  if (scope.myAdmissionCounselorId) {
    parts.push(`counselor_id.eq.${scope.myAdmissionCounselorId}`);
  }
  parts.push(`assigned_counselor_id.eq.${userId}`);
  return parts.length > 0 ? parts.join(',') : null;
}

/**
 * Defense-in-depth check that mirrors the SQL helper
 * `_user_in_admission_lead_allowlist(uuid)`. Returns TRUE iff the user
 * holds one of the canonical lead-view role_keys.
 *
 * The list API (which runs as service role and bypasses RLS) MUST call this
 * after the user_has_permission('admission.leads.view') check. Without it,
 * any role with admission.leads.view in custom_roles.permissions JSONB —
 * accidentally granted via Role Management UI — re-leaks the entire leads
 * list to that role's users (faculty/hod/principal/student/etc.). 2026-05-11.
 *
 * Returns true for super_admin / is_admin paths via the caller's
 * isSuperAdmin short-circuit; this helper does NOT check those flags.
 */
export async function isUserInLeadViewAllowlist(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  // Same withRetry pattern as getCounselorScope above — without it, a
  // transient ECONNRESET on the user_roles query produces a 403 from the
  // list API, which the user perceives as "leads suddenly disappeared."
  let rows: Array<{ custom_roles?: { role_key?: string } | null }> = [];
  try {
    const data = await withRetry(async () => {
      const r = await supabase
        .from('user_roles')
        .select('custom_roles!inner(role_key)')
        .eq('user_id', userId);
      if (r.error) throw r.error;
      return r.data;
    });
    rows = (data ?? []) as Array<{
      custom_roles?: { role_key?: string } | null;
    }>;
  } catch {
    // Persistent failure after retries — fail-closed (deny). Better than
    // leaking the entire list on a flaky read.
    return false;
  }

  const allowlist: readonly string[] = LEAD_VIEW_ALLOWLIST_ROLE_KEYS;
  return rows.some((r) => {
    const k = r.custom_roles?.role_key;
    return typeof k === 'string' && allowlist.includes(k);
  });
}
