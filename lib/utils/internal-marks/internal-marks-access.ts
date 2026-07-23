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
interface CoeInstitutionEntry {
  id: string;
  institution_code: string;
  myjkkn_institution_ids: string[];
}
let coeInstitutionCache: CoeInstitutionEntry[] | null = null;
let coeInstitutionCacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getCoeInstitutions(): Promise<CoeInstitutionEntry[]> {
  if (coeInstitutionCache && Date.now() < coeInstitutionCacheExpiry) {
    return coeInstitutionCache;
  }

  let institutions: CoeInstitutionEntry[];

  // Prefer the REST API (self-heals to the live source the moment the COE key is
  // restored). On ANY REST failure — including an expired/absent API key — fall
  // back to reading the same institutions bridge DIRECTLY from the COE DB, so
  // institution resolution keeps working while the REST key is down. Without this
  // fallback, every COE-backed route (incl. the student My-Marks views, which
  // otherwise have a DB marks fallback) throws here before it can degrade.
  try {
    const { CoeRestClient } = await import('@/lib/services/coe/coe-rest-client');
    const client = CoeRestClient.create();
    institutions = await client.get<CoeInstitutionEntry[]>('/api/v1/institutions');
  } catch (restErr) {
    const { isCoeDbConfigured, getAllCoeInstitutions } = await import(
      '@/lib/services/coe/coe-db-client'
    );
    if (!isCoeDbConfigured()) throw restErr;
    console.warn(
      '[internal-marks-access] COE REST /institutions unavailable — falling back to COE DB:',
      restErr instanceof Error ? restErr.message : restErr,
    );
    institutions = await getAllCoeInstitutions();
  }

  coeInstitutionCache = institutions;
  coeInstitutionCacheExpiry = Date.now() + CACHE_TTL_MS;
  return institutions;
}

/**
 * Resolves MyJKKN institution UUID → COE institution UUID.
 * Calls COE /api/v1/institutions and matches via myjkkn_institution_ids array.
 * Result is cached in-memory for 10 minutes to avoid repeated API calls.
 */
export async function resolveCoeInstitutionId(
  myjkknInstitutionId: string
): Promise<string | null> {
  const institutions = await getCoeInstitutions();
  const match = institutions.find((inst) =>
    inst.myjkkn_institution_ids?.includes(myjkknInstitutionId)
  );
  return match?.id ?? null;
}

/**
 * Resolves MyJKKN institution UUID → COE institution_code (natural key).
 * Use this when calling COE endpoints that accept institution_code rather than a UUID
 * (e.g. /api/public/boards?institution_code=...).
 */
export async function resolveCoeInstitutionCode(
  myjkknInstitutionId: string
): Promise<string | null> {
  const institutions = await getCoeInstitutions();
  const match = institutions.find((inst) =>
    inst.myjkkn_institution_ids?.includes(myjkknInstitutionId)
  );
  return match?.institution_code ?? null;
}

/**
 * Reverse of {@link resolveCoeInstitutionCode}: resolves a COE institution UUID
 * (e.g. the `institutions_id` carried on a COE course record) → its natural key
 * `institution_code` plus the MyJKKN UUIDs it bridges to.
 *
 * Use when the caller only holds a COE id and needs (a) the code for further
 * COE calls and (b) the MyJKKN ids to authorize the request against the user's
 * MyJKKN-space scope. Returns null when the COE id is unknown.
 */
export async function resolveCoeInstitutionById(
  coeInstitutionId: string
): Promise<{ institution_code: string; myjkkn_institution_ids: string[] } | null> {
  const institutions = await getCoeInstitutions();
  const match = institutions.find((inst) => inst.id === coeInstitutionId);
  if (!match) return null;
  return {
    institution_code: match.institution_code,
    myjkkn_institution_ids: match.myjkkn_institution_ids ?? [],
  };
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
