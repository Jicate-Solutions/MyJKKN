// lib/api-helpers/admission-counselor-scope.ts
//
// Shared server-side helper for the leads + call_logs service-role API routes.
// These routes deliberately bypass RLS for performance (the admission_leads
// policies cascade 3 levels deep and exceed the 8s authenticated timeout —
// see lib/services/admission/lead-service.ts:113-117).
//
// Because RLS is bypassed, every service-role endpoint that returns
// counselor-visible data MUST manually re-implement the source-scoping rules
// from supabase/migrations/20260509130000_admission_leads_source_scoped_rls.sql
// or counselors will silently see all leads in their institution again.
//
// This helper centralises that logic so both the leads list route and the
// calls list route apply identical scoping.

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
  /** Source enum values the user is currently assigned to (active, in-window, not paused). */
  mySourceEnums: string[];
}

/**
 * Compute the leads visibility scope for a given user.
 *
 * Returns:
 *   - isStrictCounselor=false → caller should NOT apply per-source filtering
 *     (user is super_admin / admin / admission office / scope='all' / etc.)
 *   - isStrictCounselor=true  → caller MUST apply the OR-filter
 *       counselor_id.eq.<myAdmissionCounselorId>
 *       OR assigned_counselor_id.eq.<user_id>
 *       OR source.in.(<mySourceEnums>)
 *     If both myAdmissionCounselorId is null AND mySourceEnums is empty,
 *     the counselor has no accessible leads — caller should short-circuit
 *     to an empty response.
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
    return { isStrictCounselor: true, myAdmissionCounselorId: null, mySourceEnums: [] };
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
    return { isStrictCounselor: false, myAdmissionCounselorId: null, mySourceEnums: [] };
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

  // 3. Resolve assigned source enums via the SECURITY DEFINER helper. Using
  //    the RPC keeps the active/window/pause logic in one canonical place
  //    (the same predicate the RLS policies use).
  const { data: srcRows } = await supabase.rpc('_user_assigned_source_enums', {
    p_uid: userId,
  });

  const mySourceEnums = Array.isArray(srcRows)
    ? (srcRows as Array<{ _user_assigned_source_enums?: string } | string>).map((r) =>
        typeof r === 'string' ? r : (r as any)._user_assigned_source_enums ?? (r as any)
      ).filter((v): v is string => typeof v === 'string')
    : [];

  return { isStrictCounselor: true, myAdmissionCounselorId, mySourceEnums };
}

/**
 * Build the PostgREST `.or(...)` argument that scopes admission_leads to the
 * given counselor's visibility. Returns null when there's nothing to filter
 * to (caller should return empty results).
 */
export function buildLeadVisibilityOr(scope: CounselorScope, userId: string): string | null {
  const parts: string[] = [];
  if (scope.myAdmissionCounselorId) {
    parts.push(`counselor_id.eq.${scope.myAdmissionCounselorId}`);
  }
  parts.push(`assigned_counselor_id.eq.${userId}`);
  if (scope.mySourceEnums.length > 0) {
    parts.push(`source.in.(${scope.mySourceEnums.join(',')})`);
  }
  return parts.length > 0 ? parts.join(',') : null;
}
