// lib/whatsapp/byow-authz.ts
//
// Department-scope gate for the BYOW Personal WhatsApp API routes.
//
// Why this exists
// ---------------
// `wa_personal_connections` HAS RLS (own-dept OR super_admin OR `admission`
// custom role — see supabase/setup/03_policies.sql). But every /api/whatsapp-
// personal/* route reaches the table through WhatsAppPersonalConnectionService,
// which uses the SERVICE ROLE key and therefore BYPASSES that RLS. So the routes
// only checked `auth.getUser()` — any authenticated user (a student included)
// could read/disconnect/send for ANY department by passing its department_id.
// Proven 2026-07-14: test.student drove status+disconnect for a foreign dept.
//
// Fix: duplicate the RLS rule in the route layer (the documented pattern for
// SECURITY DEFINER / service-role paths — feedback_definer_rpc_bypasses_rls_
// duplicate_role_gate). This helper is the single source of that rule.
//
// The lookup keys strictly off the authenticated `userId` (auth.uid(), which is
// forgery-proof) and uses the service-role client so the gate itself can never
// be defeated by RLS on profiles/user_roles returning a false negative.

import { createClient } from '@supabase/supabase-js';

export interface ByowAccessResult {
  ok: boolean;
  /** Machine-stable reason, present only when ok === false. */
  reason?: 'unauthenticated' | 'department_required' | 'no_profile' | 'forbidden';
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Returns whether `userId` may operate BYOW for `departmentId`.
 *
 * Mirrors the wa_personal_connections RLS policy:
 *   - caller's own department, OR
 *   - super_admin (profiles.is_super_admin OR role = 'super_admin'), OR
 *   - holder of the `admission` custom role (scope 'all' — works cross-dept).
 */
export async function checkByowDeptAccess(
  userId: string | undefined | null,
  departmentId: string | undefined | null
): Promise<ByowAccessResult> {
  if (!userId) return { ok: false, reason: 'unauthenticated' };
  if (!departmentId) return { ok: false, reason: 'department_required' };

  const db = serviceClient();

  const { data: profile } = await db
    .from('profiles')
    .select('department_id, role, is_super_admin')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return { ok: false, reason: 'no_profile' };

  // Super admin — unrestricted.
  if (profile.is_super_admin === true || profile.role === 'super_admin') {
    return { ok: true };
  }

  // Own department.
  if (profile.department_id && profile.department_id === departmentId) {
    return { ok: true };
  }

  // `admission` custom role — cross-department by design (institution_scope 'all').
  const { data: roles } = await db
    .from('user_roles')
    .select('custom_roles!inner(role_key)')
    .eq('user_id', userId);

  const hasAdmission = (roles ?? []).some((r) => {
    const cr = (r as { custom_roles?: unknown }).custom_roles;
    const key = Array.isArray(cr)
      ? (cr[0] as { role_key?: string } | undefined)?.role_key
      : (cr as { role_key?: string } | null)?.role_key;
    return key === 'admission';
  });

  return hasAdmission ? { ok: true } : { ok: false, reason: 'forbidden' };
}

/** HTTP status for a failed access result: 401 when unauthenticated, else 403. */
export function byowAccessHttpStatus(result: ByowAccessResult): number {
  return result.reason === 'unauthenticated' ? 401 : 403;
}

// ---------------------------------------------------------------------------
// Institution-scope gate (added 2026-09-13 with the campus-bridge repoint)
// ---------------------------------------------------------------------------

export interface ByowInstitutionAccessResult extends ByowAccessResult {
  /** The caller's own institution, for stamping on the outbox row. */
  institutionId?: string | null;
}

/**
 * Gate for BYOW routes that no longer name a department.
 *
 * The campus bridge is ONE shared JKKN number, so a send no longer resolves a
 * per-department connection and callers may pass `department_id: 'any'` (the
 * admission lead page does exactly that). The department gate above cannot run
 * without a department, and dropping the check outright would reopen the hole
 * PR #2064 closed — so this grants EXACTLY the cross-department tier that
 * `checkByowDeptAccess` already grants unconditionally:
 *
 *   - super_admin (profiles.is_super_admin OR role = 'super_admin'), OR
 *   - holder of the `admission` custom role (institution_scope 'all').
 *
 * A department-scoped user who names no department is refused; naming their own
 * department still passes through `checkByowDeptAccess` as before. This is
 * strictly narrower than the old `'any'` path, never wider.
 */
export async function checkByowInstitutionAccess(
  userId: string | undefined | null
): Promise<ByowInstitutionAccessResult> {
  if (!userId) return { ok: false, reason: 'unauthenticated' };

  const db = serviceClient();

  const { data: profile } = await db
    .from('profiles')
    .select('institution_id, role, is_super_admin')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return { ok: false, reason: 'no_profile' };

  const institutionId = (profile.institution_id as string | null) ?? null;

  if (profile.is_super_admin === true || profile.role === 'super_admin') {
    return { ok: true, institutionId };
  }

  const { data: roles } = await db
    .from('user_roles')
    .select('custom_roles!inner(role_key)')
    .eq('user_id', userId);

  const hasAdmission = (roles ?? []).some((r) => {
    const cr = (r as { custom_roles?: unknown }).custom_roles;
    const key = Array.isArray(cr)
      ? (cr[0] as { role_key?: string } | undefined)?.role_key
      : (cr as { role_key?: string } | null)?.role_key;
    return key === 'admission';
  });

  return hasAdmission
    ? { ok: true, institutionId }
    : { ok: false, reason: 'forbidden', institutionId };
}

/**
 * The caller's own institution. NOT a gate — call only after a gate has passed.
 * Used to stamp `wa_bridge_outbox.institution_id` on sends that passed the
 * department gate (which does not itself resolve an institution).
 */
export async function getByowSenderInstitution(
  userId: string | undefined | null
): Promise<string | null> {
  if (!userId) return null;
  const db = serviceClient();
  const { data } = await db
    .from('profiles')
    .select('institution_id')
    .eq('id', userId)
    .maybeSingle();
  return (data?.institution_id as string | null) ?? null;
}
