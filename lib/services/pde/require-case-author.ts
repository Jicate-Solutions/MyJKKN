// lib/services/pde/require-case-author.ts
// ============================================================================
// Server-side gate for clinical-image write paths.
//
// Authentication alone is not the right bar here: every signed-in user of the
// platform — including learners — would otherwise be able to push bytes into
// the shared clinical-image store. Clinical imagery is teaching material
// authored by teaching staff, so these routes check the same permission that
// gates the case-authoring pages ('pde.faculty.view'), with the usual admin
// bypass, following the canonical rpc('user_has_permission') pattern used
// elsewhere in app/api.
//
// Decision: Director, 2026-07-21 ("only teaching staff").
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

const CASE_AUTHOR_PERMISSION = 'pde.faculty.view';

/**
 * Flat shape rather than a discriminated union: this repo compiles with
 * `strictNullChecks: false`, under which TypeScript does not narrow a
 * `{ok:true} | {ok:false}` union at the call site. Every field is therefore
 * always present — callers check `ok` and return early on failure.
 */
export interface CaseAuthorGate {
  ok: boolean;
  /** HTTP status to return when `ok` is false; 200 when allowed. */
  status: number;
  /** Message to return when `ok` is false; empty when allowed. */
  error: string;
  /** Empty string when denied. */
  userId: string;
  institutionId: string | null;
}

/**
 * Resolve the caller and confirm they may write clinical images.
 *
 * Returns the caller's institution_id alongside, because every write path here
 * needs it for tenant scoping and re-querying it separately would be a wasted
 * round-trip.
 */
export async function requireCaseAuthor(supabase: SupabaseClient): Promise<CaseAuthorGate> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Unauthorized', userId: '', institutionId: null };

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('institution_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  const institutionId: string | null = profile?.institution_id ?? null;

  const isAdmin =
    profile?.is_super_admin === true ||
    ['super_admin', 'platform_admin', 'admin', 'administrator'].includes(profile?.role ?? '');

  if (isAdmin) return { ok: true, status: 200, error: '', userId: user.id, institutionId };

  // Role Management is the single source of truth — a role granted the key
  // through the UI passes here without any code change.
  const { data: perm } = await (supabase as any).rpc('user_has_permission', {
    permission_name: CASE_AUTHOR_PERMISSION,
  });

  if (!perm) {
    return {
      ok: false,
      status: 403,
      error:
        'You do not have access to add clinical images. This is limited to Senior Learners — ask an administrator if you need it.',
      userId: '',
      institutionId: null,
    };
  }

  return { ok: true, status: 200, error: '', userId: user.id, institutionId };
}
