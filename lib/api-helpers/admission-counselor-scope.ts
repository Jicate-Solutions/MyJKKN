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

const COUNSELOR_ROLE_KEYS = [
  'admission_counselor',
  'expo_counselor',
  'learner_counselor',
  'staff_counselor',
] as const;

const NON_COUNSELOR_OVERRIDE_ROLE_KEYS = [
  'admission',
  'administrator',
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
  // 1. Detect strict-counselor — same logic as _user_is_strict_counselor()
  //    SQL helper, replicated client-side to avoid an extra round trip.
  const { data: roleRows, error: roleErr } = await supabase
    .from('user_roles')
    .select('custom_roles!inner(role_key)')
    .eq('user_id', userId);

  if (roleErr) {
    // Fail-closed: treat as strict counselor with empty scope so the
    // user sees nothing, rather than fail-open to "see everything".
    return { isStrictCounselor: true, myAdmissionCounselorId: null };
  }

  const roleKeys = (roleRows ?? [])
    .map((r: any) => r.custom_roles?.role_key)
    .filter((k: any): k is string => typeof k === 'string');

  const hasCounselorRole = roleKeys.some((k) =>
    (COUNSELOR_ROLE_KEYS as readonly string[]).includes(k)
  );
  const hasOverrideRole = roleKeys.some((k) =>
    (NON_COUNSELOR_OVERRIDE_ROLE_KEYS as readonly string[]).includes(k)
  );

  const isStrictCounselor = hasCounselorRole && !hasOverrideRole;
  if (!isStrictCounselor) {
    return { isStrictCounselor: false, myAdmissionCounselorId: null };
  }

  // 2. Resolve admission_counselors.id — admission_leads.counselor_id points
  //    here, NOT to profiles.id. Without this, direct-assignment via the
  //    legacy counselor_id column would be invisible to its owner.
  const { data: acRow } = await supabase
    .from('admission_counselors')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  const myAdmissionCounselorId = (acRow as { id?: string } | null)?.id ?? null;

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
