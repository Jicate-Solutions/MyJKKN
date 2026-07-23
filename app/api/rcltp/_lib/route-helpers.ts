/**
 * MyJKKN RCLTP v2 "Adaptive Reading" — Phase 3 server-route helpers
 * ============================================================================
 * The auth/ownership bridge shared by EVERY rcltp Phase-3 write route. The
 * consistency is the point — keep this the single place that decides:
 *   (1) which client does the privileged write (service-role, bypasses RLS),
 *   (2) how a STUDENT actor's learner_id is derived (NEVER from the body),
 *   (3) how a STAFF actor's institution access is asserted, and
 *   (4) the honest "awaiting MyJKKN content" response shape for gated bodies.
 *
 * WHY service-role here: students have NO write policy on any rcltp_ table
 * (migration §6). These routes are the ONLY student-affecting write path. The
 * service-role client bypasses RLS, so every route MUST re-scope the write
 * manually by institution_id AND verified ownership — that manual re-scoping
 * is what these helpers standardize, so no individual route can forget it.
 *
 * NOTE: `_lib` is a Next.js "private folder" (underscore prefix) — it is NOT
 * routed, only imported. createServiceRoleClient is synchronous (lib/supabase/server.ts).
 * ============================================================================
 */

import { NextResponse } from 'next/server';
import type { AuthContext } from '@/lib/auth/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { corsHeaders } from '@/lib/api-keys/cors';

/** Privileged client for the write itself. Bypasses RLS — callers re-scope manually. */
export function rcltpAdminClient() {
  return createServiceRoleClient();
}

/** Tolerant JSON body parse — empty/no body yields {} (routes like start/submit
 *  take no body; we must not 400 on an absent body). */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return ((await request.json()) ?? {}) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Resolve the AUTHENTICATED student's learner_id via the same RPC the RLS
 * policies trust (`get_my_learner_id()`), evaluated under the caller's own
 * session client. This is the security crux for student-actor routes: the
 * learner_id is taken from the session, NEVER from a request body, so a
 * student cannot act on another learner by supplying a foreign id.
 * Returns null when the account has no linked learner profile.
 */
export async function resolveLearnerId(auth: AuthContext): Promise<string | null> {
  const { data, error } = await auth.supabase.rpc('get_my_learner_id');
  if (error) return null;
  return (data as string | null) ?? null;
}

/** Does the actor have platform-wide reach (super admin / admin)? Allows the
 *  legitimate cross-tenant operator through institution scoping. */
export async function isPlatformAdmin(auth: AuthContext): Promise<boolean> {
  try {
    const [{ data: sa }, { data: ad }] = await Promise.all([
      auth.supabase.rpc('is_super_admin'),
      auth.supabase.rpc('is_admin'),
    ]);
    return Boolean(sa) || Boolean(ad);
  } catch {
    return false;
  }
}

/**
 * STAFF-actor permission guard, evaluated under the CALLER'S session client (so
 * the multi-role OR-merge + super-admin bypass in user_has_permission apply to
 * the real actor, never a service-role bypass). Use this to gate a service-role
 * write route on a specific RCLTP capability (e.g. rcltp.review) BEFORE the
 * privileged client touches data. Fails closed on any RPC error.
 */
export async function actorHasPermission(
  auth: AuthContext,
  permissionKey: string
): Promise<boolean> {
  try {
    const { data, error } = await auth.supabase.rpc('user_has_permission', {
      permission_name: permissionKey,
    });
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * STAFF-actor institution guard. A teacher may only act within their own
 * institution; a super_admin/admin may act across tenants. The service-role
 * write bypasses RLS, so this manual check is the multi-tenant boundary.
 */
export async function actorMayActOnInstitution(
  auth: AuthContext,
  targetInstitutionId: string | null | undefined
): Promise<boolean> {
  if (!targetInstitutionId) return false;
  if (auth.user.institution_id && auth.user.institution_id === targetInstitutionId) return true;
  return isPlatformAdmin(auth);
}

/**
 * Resolve a learner's AUTHORITATIVE institution from learners_profiles. Staff
 * reward routes (award/streak) derive the institution from the LEARNER record —
 * never from the request body — so a teacher cannot tag a foreign learner with
 * their own institution. Returns null when the learner is unknown or has no
 * institution (callers fail closed).
 */
export async function resolveLearnerInstitution(
  admin: ReturnType<typeof createServiceRoleClient>,
  learnerId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from('learners_profiles')
    .select('institution_id')
    .eq('id', learnerId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.institution_id as string | null) ?? null;
}

/**
 * Honest gate for MyJKKN-content-dependent bodies (group B). The route + auth +
 * plumbing are LIVE; the content-dependent logic (scoring formula, band
 * cutoffs, the question-gen prompt, VBB wordlist) is intentionally deferred so
 * nothing fabricates pedagogy. 501 = "endpoint exists, logic not implemented yet"
 * — distinct from a 500 error and from a 200 success, so monitoring reads it true.
 */
export function pendingValidationResponse(what: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      success: false,
      gated: true,
      awaiting: 'validation_content',
      what,
      message:
        `RCLTP: "${what}" is awaiting MyJKKN content/spec. The route, auth gating, ` +
        `and service-role wiring are live; the content-dependent logic is intentionally ` +
        `deferred (no fabricated scoring/cutoffs/prompt).`,
      ...extra,
    },
    { status: 501, headers: corsHeaders }
  );
}
