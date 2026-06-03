// lib/api-helpers/admission-lead-visibility.ts
//
// SINGLE SOURCE OF TRUTH for admission-leads visibility, shared by the
// service-role LIST (app/api/admission/leads/list) and [id] DETAIL routes so the
// two can NEVER diverge — the BUG-003956 list-vs-detail mismatch class, where a
// lead appears in the list but 404s on its detail page.
//
// The caller's scope is resolved in ONE round-trip via fn_admission_lead_scope
// (SECURITY DEFINER), which delegates to the SAME SQL helpers the
// adm_leads_select RLS policy uses (_user_in_admission_lead_allowlist /
// _user_is_strict_counselor / user_has_permission) — so the service-role API and
// authenticated RLS enforce identical rules without the old hand-maintained TS
// mirrors drifting from the SQL.
//
// Visibility model (mirrors 20260510210000 + 20260510220000 + 20260522110000):
//   - super / global (institution_scope='all' OR module admission='all_institutions')
//       → institution-wide (LIST: no clamp; DETAIL: any row).
//   - strict counselor (one of the 4 counselor role_keys, NO admin/exec override)
//       → ONLY leads where counselor_id = my admission_counselors.id
//         OR assigned_counselor_id = my auth uid.
//       Evaluated BEFORE the global check, because counselor roles are themselves
//       configured institution_scope='all' and must NOT inherit cross-institution
//       visibility (the load-bearing 5b comment / 2026-05-22 revert).
//       LIST additionally excludes source='referral'; DETAIL does NOT (an owned
//       referral lead must open — BUG-003956).
//   - everyone else (non-strict, non-global) → clamped to their own institution.

import type { SupabaseClient } from '@supabase/supabase-js';
import { withRetry } from '@/lib/retry';

// Sentinel UUID that matches no row — used to fail closed when a non-strict,
// non-global user has no institution to scope to. NEVER widen visibility on a
// missing institution.
const NO_MATCH_UUID = '00000000-0000-0000-0000-000000000000';

// Retry only on undici / Node fetch transient failures (cold-start flakes on
// Windows + Turbopack). Postgres / RLS errors must surface immediately, not
// sleep through the backoff (the lib/retry default would otherwise retry them).
const TRANSIENT_RE = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR/i;
function isTransient(err: unknown): boolean {
  const msg =
    (err as any)?.message ??
    (err as any)?.details ??
    (typeof err === 'string' ? err : '');
  return TRANSIENT_RE.test(String(msg));
}

export interface LeadAccess {
  userId: string;
  profileExists: boolean;
  isSuper: boolean;
  hasViewPermission: boolean;
  inAllowlist: boolean;
  isStrictCounselor: boolean;
  /** Effective institution-wide flag: super-admin OR a role with institution_scope='all' / module admission='all_institutions'. */
  isGlobal: boolean;
  myCounselorId: string | null;
  institutionId: string | null;
}

/**
 * Resolve the caller's lead-access scope in a single round-trip. Retries only on
 * transient fetch failures, not on Postgres errors. Throws on persistent failure
 * (caller should surface a 503).
 */
export async function resolveLeadAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<LeadAccess> {
  const row = await withRetry(
    async () => {
      const r = await supabase
        .rpc('fn_admission_lead_scope', { p_user_id: userId })
        .single();
      if (r.error) throw r.error;
      return r.data as Record<string, unknown> | null;
    },
    3,
    200,
    isTransient
  );

  const isSuper = !!row?.is_super;
  return {
    userId,
    profileExists: !!row?.profile_exists,
    isSuper,
    hasViewPermission: !!row?.has_view_permission,
    inAllowlist: !!row?.in_allowlist,
    isStrictCounselor: !!row?.is_strict_counselor,
    isGlobal: isSuper || !!row?.has_global_role,
    myCounselorId: (row?.my_counselor_id as string | null) ?? null,
    institutionId: (row?.institution_id as string | null) ?? null,
  };
}

/**
 * 403 denial message if the caller may NOT view admission leads, else null.
 * Mirrors the gate the LIST/DETAIL routes enforced inline: needs
 * admission.leads.view AND the role allowlist (2026-05-11 lockdown); super-admin
 * bypasses both.
 */
export function leadViewDenialReason(access: LeadAccess): string | null {
  if (access.isSuper) return null;
  if (!access.hasViewPermission) {
    return 'Forbidden: admission.leads.view permission required';
  }
  if (!access.inAllowlist) {
    return 'Forbidden: role is not permitted to view admission leads';
  }
  return null;
}

/**
 * Apply the caller's visibility scope to a PostgREST query builder (LIST).
 * Synchronous so the list's buildQuery() factory can re-issue it for the 416
 * page-clamp. `excludeReferral` is true for the list and false for the detail
 * per-row check (canSeeLead) — see the module header.
 */
export function applyLeadVisibility(
  query: any,
  access: LeadAccess,
  opts: { explicitInstitutionId?: string; excludeReferral: boolean }
): any {
  // Explicit College-dropdown selection is always honored (narrows further).
  if (opts.explicitInstitutionId) {
    query = query.eq('institution_id', opts.explicitInstitutionId);
  }

  // Strict counselor FIRST — counselor roles are themselves institution_scope='all',
  // so they must NOT fall through to the global (no-clamp) branch.
  if (access.isStrictCounselor) {
    const parts: string[] = [];
    if (access.myCounselorId) {
      parts.push(`counselor_id.eq.${access.myCounselorId}`);
    }
    parts.push(`assigned_counselor_id.eq.${access.userId}`);
    query = query.or(parts.join(','));
    if (opts.excludeReferral) {
      query = query.neq('source', 'referral');
    }
  } else if (!access.isGlobal) {
    // Non-strict, non-global → clamp to own institution. ADDITIVE: applied even
    // when an explicit institution_id was passed, so a foreign explicit id yields
    // zero rows instead of leaking (closes the latent list/detail divergence).
    // Fail closed when the user has no institution.
    query = query.eq('institution_id', access.institutionId ?? NO_MATCH_UUID);
  }
  // super / global → institution-wide (only the explicit filter, if any).

  return query;
}

/**
 * Per-row visibility check for the DETAIL route. Mirrors applyLeadVisibility on a
 * single fetched row. Strict counselor checked BEFORE global (same reason). The
 * DETAIL route does NOT exclude owned referral leads (BUG-003956).
 */
export function canSeeLead(
  access: LeadAccess,
  lead: {
    institution_id?: string | null;
    counselor_id?: string | null;
    assigned_counselor_id?: string | null;
  }
): boolean {
  if (access.isStrictCounselor) {
    const ownsByCounselor =
      !!access.myCounselorId && lead.counselor_id === access.myCounselorId;
    const ownsByAssignment = lead.assigned_counselor_id === access.userId;
    return ownsByCounselor || ownsByAssignment;
  }
  if (!access.isGlobal) {
    return !!access.institutionId && lead.institution_id === access.institutionId;
  }
  return true; // super / global → institution-wide
}
