export const dynamic = 'force-dynamic';

// app/api/admission/leads/[id]/route.ts
// Server-side single-lead detail endpoint — uses the service role to bypass
// RLS overhead, mirroring app/api/admission/leads/list/route.ts.
//
// Why this exists (BUG-003956): the leads LIST is served by the service-role
// list route, which re-implements the strict-counselor visibility rules in
// code (getCounselorScope / buildLeadVisibilityOr). The DETAIL fetch used to
// be a direct browser query under RLS. The RLS strict-counselor policy excludes
// source='referral' even when the counselor is assigned, and resolves
// assignment differently than the list helper — so a lead that appeared in the
// list 404'd on its detail page.
//
// This route mirrors the list route's auth + permission + allowlist + scope
// gate, but DELIBERATELY omits the list's blanket `source <> 'referral'`
// exclusion: the detail page must open an assigned referral lead the operator
// owns. Ownership is enforced per-row via getCounselorScope, so dropping the
// referral exclusion does not widen visibility beyond the operator's own leads.

import { connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';
import { jsonNoStore } from '@/lib/api-helpers/no-store-response';
import {
  getCounselorScope,
  isUserInLeadViewAllowlist,
} from '@/lib/api-helpers/admission-counselor-scope';

// Retry only on undici / Node fetch transient failures (cold-start flakes on
// Windows + Turbopack). Postgres errors should surface immediately without retry.
function isTransientFetchError(err: unknown): boolean {
  const msg =
    (err as any)?.message ??
    (err as any)?.details ??
    (typeof err === 'string' ? err : '');
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR/i.test(String(msg));
}

async function retryOnFetchFailure<T>(fn: () => Promise<T>): Promise<T> {
  const attempts = 3;
  let delay = 200;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (isLastAttempt || !isTransientFetchError(err)) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.floor(delay * 1.5);
    }
  }
  // Unreachable, satisfies TS
  throw new Error('retryOnFetchFailure: exhausted attempts');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  const { id } = await params;
  if (!id) {
    return jsonNoStore({ error: 'Lead id is required' }, { status: 400 });
  }

  // 1. Authenticate the user (wrapped so undici cold-start flakes auto-retry)
  let user: any = null;
  try {
    const result = await retryOnFetchFailure(() => getAuthUser());
    if (result.error || !result.user) {
      return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }
    user = result.user;
  } catch (err) {
    console.error('[admission/leads/:id] Auth fetch failed:', err);
    return jsonNoStore(
      { error: 'Authentication temporarily unavailable. Please retry.' },
      { status: 503 }
    );
  }

  // 2. Permission gate — mirrors the list route.
  const supabase = createServiceRoleClient();

  const { data: profile } = await retryOnFetchFailure(() =>
    supabase
      .from('profiles')
      .select('id, role, institution_id, is_super_admin')
      .eq('id', user.id)
      .single()
  );

  if (!profile) {
    return jsonNoStore({ error: 'Profile not found' }, { status: 403 });
  }

  const isSuperAdmin = !!profile.is_super_admin || profile.role === 'super_admin';

  let canViewLeads = isSuperAdmin;
  if (!canViewLeads) {
    const { data: permResult } = await retryOnFetchFailure(() =>
      supabase.rpc('user_has_permission', {
        user_id: user.id,
        permission_key: 'admission.leads.view',
      })
    );
    canViewLeads = !!permResult;
  }

  if (!canViewLeads) {
    return jsonNoStore(
      { error: 'Forbidden: admission.leads.view permission required' },
      { status: 403 }
    );
  }

  // Defense-in-depth role allowlist (mirrors list route). super_admin bypasses.
  if (!isSuperAdmin) {
    const inAllowlist = await retryOnFetchFailure(() =>
      isUserInLeadViewAllowlist(supabase, user.id)
    );
    if (!inAllowlist) {
      return jsonNoStore(
        { error: 'Forbidden: role is not permitted to view admission leads' },
        { status: 403 }
      );
    }
  }

  // Cross-institution access flag — same computation as the list route.
  let isAdmissionGlobalUser = isSuperAdmin;
  if (!isAdmissionGlobalUser) {
    const { data: scopedRoles } = await retryOnFetchFailure(() =>
      supabase
        .from('user_roles')
        .select('custom_roles!inner(institution_scope, module_scopes)')
        .eq('user_id', user.id)
    );
    isAdmissionGlobalUser = (scopedRoles || []).some((ur: any) => {
      const cr = ur.custom_roles;
      if (!cr) return false;
      if (cr.institution_scope === 'all') return true;
      const moduleScope = (cr.module_scopes ?? {})['admission'];
      return moduleScope === 'all_institutions';
    });
  }

  try {
    // 3. Fetch the row by id with the service role (bypasses RLS). The select
    //    mirrors LeadService.getLead's embeds so normalizeLead gets the shape
    //    the detail page expects.
    const { data: lead, error } = await retryOnFetchFailure(() =>
      supabase
        .from('admission_leads')
        .select(`
          *,
          counselor:admission_counselors(id, name, email),
          program:programs!program_id(id, program_name, program_id),
          admission_year:admission_years(id, admission_year_name, program_start_year, program_end_year)
        `)
        .eq('id', id)
        .maybeSingle()
    );

    if (error) throw error;
    if (!lead) {
      return jsonNoStore({ error: 'Lead not found' }, { status: 404 });
    }

    // 4. Per-row ownership / scope check — same model as the list route's
    //    visibility filter (institution scoping + counselor OR), but WITHOUT
    //    the blanket `source <> 'referral'` exclusion that caused BUG-003956.
    //    Owned referral leads are intentionally allowed here.
    const scope = await getCounselorScope(supabase, user.id);

    if (scope.isStrictCounselor) {
      // Strict counselor: only their directly-owned leads, regardless of
      // institution. Ownership = counselor_id matches their admission_counselors.id
      // OR assigned_counselor_id matches their user id.
      const ownsByCounselorId =
        !!scope.myAdmissionCounselorId &&
        (lead as any).counselor_id === scope.myAdmissionCounselorId;
      const ownsByAssignment = (lead as any).assigned_counselor_id === user.id;
      if (!ownsByCounselorId && !ownsByAssignment) {
        return jsonNoStore({ error: 'Lead not found' }, { status: 404 });
      }
    } else if (!isAdmissionGlobalUser) {
      // Non-strict, non-global users are clamped to their own institution,
      // mirroring the list route's implicit institution scoping.
      if (
        !profile.institution_id ||
        (lead as any).institution_id !== profile.institution_id
      ) {
        return jsonNoStore({ error: 'Lead not found' }, { status: 404 });
      }
    }
    // isAdmissionGlobalUser (incl. super_admin): institution-wide visibility.

    return jsonNoStore({ data: lead });
  } catch (err) {
    console.error('[admission/leads/:id] API route error:', err);
    // Postgrest errors are plain objects (not Error instances).
    const message =
      (err as any)?.message ||
      (err as any)?.details ||
      (err as any)?.hint ||
      (err as any)?.error_description ||
      (typeof err === 'string' ? err : null) ||
      'Internal server error';
    const status = isTransientFetchError(err) ? 503 : 500;
    return jsonNoStore({ error: message }, { status });
  }
}
