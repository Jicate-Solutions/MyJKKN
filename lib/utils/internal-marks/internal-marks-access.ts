/**
 * Internal Marks Access Control
 *
 * Mirrors the BOS access pattern (lib/utils/bos/bos-access.ts) for the
 * Internal Marks (CIA) module. Resolves the user's institution scope
 * and guards write operations.
 *
 * Institution ID is passed directly to COE (no mapping table needed —
 * COE resolves via its myjkkn_institution_ids array).
 */

import { createClient } from '@/lib/supabase/server';

export interface InternalMarksAccessScope {
  /** True when user bypasses all institution filters */
  isSuperAdmin: boolean;
  /**
   * MyJKKN institution_id to enforce on every query.
   * null → no filter (super admin)
   * string → must match institution_id
   */
  institutionId: string | null;
  /** Raw profile role string */
  role: string | null;
}

/**
 * Resolves the Internal Marks access scope for the authenticated user.
 * Call this in every API route immediately after auth validation.
 *
 * Usage:
 *   const scope = await resolveInternalMarksAccess(user.id);
 *   // For super admin: scope.institutionId is null (use client-supplied value)
 *   // For others: scope.institutionId is locked to their institution
 */
export async function resolveInternalMarksAccess(
  userId: string
): Promise<InternalMarksAccessScope> {
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, is_super_admin, institution_id')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { isSuperAdmin: false, institutionId: null, role: null };
  }

  const isSuperAdmin =
    profile.is_super_admin === true || profile.role === 'super_admin';

  if (isSuperAdmin) {
    return { isSuperAdmin: true, institutionId: null, role: profile.role };
  }

  return {
    isSuperAdmin: false,
    institutionId: profile.institution_id ?? null,
    role: profile.role,
  };
}

/**
 * Resolves the effective institution ID for the request.
 * Super admins use the client-supplied value; others are locked to their own.
 */
export function resolveEffectiveInstitutionId(
  scope: InternalMarksAccessScope,
  clientInstitutionId: string | null
): string | null {
  if (scope.isSuperAdmin) {
    return clientInstitutionId;
  }
  return scope.institutionId;
}



// In-memory cache for COE institution mapping (avoids repeated API calls)
let coeInstitutionCache: Array<{ id: string; myjkkn_institution_ids: string[] }> | null = null;
let coeInstitutionCacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Resolves MyJKKN institution UUID → COE institution UUID.
 * Calls COE /api/v1/institutions and matches via myjkkn_institution_ids array.
 * Result is cached in-memory for 10 minutes to avoid repeated API calls.
 */
export async function resolveCoeInstitutionId(
  myjkknInstitutionId: string
): Promise<string | null> {
  // Use cached data if fresh
  if (coeInstitutionCache && Date.now() < coeInstitutionCacheExpiry) {
    const match = coeInstitutionCache.find((inst) =>
      inst.myjkkn_institution_ids?.includes(myjkknInstitutionId)
    );
    return match?.id ?? null;
  }

  // Fetch and cache
  const { CoeRestClient } = await import('@/lib/services/coe/coe-rest-client');
  const client = CoeRestClient.create();

  const institutions = await client.get<
    Array<{ id: string; myjkkn_institution_ids: string[] }>
  >('/api/v1/institutions');

  coeInstitutionCache = institutions;
  coeInstitutionCacheExpiry = Date.now() + CACHE_TTL_MS;

  const match = institutions.find((inst) =>
    inst.myjkkn_institution_ids?.includes(myjkknInstitutionId)
  );

  return match?.id ?? null;
}

/**
 * Guards a write operation: returns an error string if the caller is NOT
 * allowed to write to the given target institution, or null if allowed.
 */
export function guardInstitutionWrite(
  scope: InternalMarksAccessScope,
  targetInstitutionId: string | undefined | null
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!targetInstitutionId) return null;
  if (scope.institutionId && scope.institutionId !== targetInstitutionId) {
    return 'Forbidden: you can only manage marks for your own institution';
  }
  return null;
}
