/**
 * Institution Resolver — server-side only.
 *
 * Bridges two separate databases:
 *   • MyJKKN Supabase — holds display_name, counselling_code per institution UUID
 *   • COE REST API    — holds institution_code, myjkkn_institution_ids (1-to-many mapping)
 *
 * Key invariant: counselling_code (MyJKKN) === institution_code (COE)
 * This shared natural key is the safe cross-DB join column.
 *
 * CAS special case: COE has ONE institution (CAS) whose myjkkn_institution_ids
 * contains TWO MyJKKN UUIDs (Aided + Self). Resolution always uses the COE unit.
 */

import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';

// ── Public types ──────────────────────────────────────────────────────────────

export interface CoeInstitutionRaw {
  id: string;
  institution_code: string;
  counselling_code: string;
  myjkkn_institution_ids: string[];
  [key: string]: unknown;
}

/** Combined view of an institution as seen by BOS / OBE modules. */
export interface InstitutionContext {
  /** The caller's own MyJKKN institution UUID (from auth profile). */
  myjkkn_id: string;
  /** Full name from MyJKKN institutions table. */
  name: string;
  /** Short display name from MyJKKN institutions table. */
  display_name: string;
  /**
   * Shared natural key: counselling_code (MyJKKN) = institution_code (COE).
   * Use this value when calling COE proxy API routes (courses, schemes, etc.)
   */
  counselling_code: string;
  /** COE institution UUID (resolved via myjkkn_institution_ids). */
  coe_id: string;
  /** COE institution_code — identical to counselling_code. */
  institution_code: string;
  /** All MyJKKN UUIDs that belong to this COE institution (≥1; >1 for CAS). */
  myjkkn_institution_ids: string[];
}

// ── COE institution list cache ────────────────────────────────────────────────
// Mirrors the 10-minute cache in internal-marks-access.ts to avoid duplicating
// the API call budget when both BOS and Internal Marks are used in the same
// server process.

let coeCache: CoeInstitutionRaw[] | null = null;
let coeCacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getCoeInstitutions(): Promise<CoeInstitutionRaw[]> {
  if (coeCache && Date.now() < coeCacheExpiry) return coeCache;

  const client = CoeRestClient.create();
  const institutions = await client.get<CoeInstitutionRaw[]>('/api/v1/institutions');

  coeCache = institutions;
  coeCacheExpiry = Date.now() + CACHE_TTL_MS;
  return institutions;
}

// ── Resolvers ─────────────────────────────────────────────────────────────────

/**
 * Resolves a MyJKKN institution UUID to the full InstitutionContext by joining
 * the MyJKKN Supabase row with the matching COE institution.
 *
 * Returns null if:
 *   • The institution_id doesn't exist in MyJKKN
 *   • No COE institution's myjkkn_institution_ids contains the given id
 */
export async function resolveInstitutionContext(
  myjkknInstitutionId: string,
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>
): Promise<InstitutionContext | null> {
  const [{ data: inst }, coeInstitutions] = await Promise.all([
    supabase
      .from('institutions')
      .select('id, name, display_name, counselling_code')
      .eq('id', myjkknInstitutionId)
      .single(),
    getCoeInstitutions(),
  ]);

  if (!inst) return null;

  const coeInst = coeInstitutions.find((c) =>
    c.myjkkn_institution_ids?.includes(myjkknInstitutionId)
  );

  if (!coeInst) return null;

  return {
    myjkkn_id: inst.id,
    name: inst.name ?? '',
    display_name: inst.display_name ?? inst.name ?? '',
    counselling_code: inst.counselling_code ?? coeInst.counselling_code ?? '',
    coe_id: coeInst.id,
    institution_code: coeInst.institution_code ?? '',
    myjkkn_institution_ids: coeInst.myjkkn_institution_ids ?? [myjkknInstitutionId],
  };
}

/**
 * Resolves by counselling_code (shared key) instead of UUID.
 * Used by super-admin routes where no MyJKKN institution_id is available.
 */
export async function resolveInstitutionContextByCode(
  counsellingCode: string,
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>
): Promise<InstitutionContext | null> {
  const [{ data: inst }, coeInstitutions] = await Promise.all([
    supabase
      .from('institutions')
      .select('id, name, display_name, counselling_code')
      .eq('counselling_code', counsellingCode)
      .maybeSingle(),
    getCoeInstitutions(),
  ]);

  if (!inst) return null;

  const coeInst = coeInstitutions.find(
    (c) =>
      c.institution_code === counsellingCode ||
      c.counselling_code === counsellingCode
  );

  if (!coeInst) return null;

  return {
    myjkkn_id: inst.id,
    name: inst.name ?? '',
    display_name: inst.display_name ?? inst.name ?? '',
    counselling_code: counsellingCode,
    coe_id: coeInst.id,
    institution_code: coeInst.institution_code ?? '',
    myjkkn_institution_ids: coeInst.myjkkn_institution_ids ?? [inst.id],
  };
}

/**
 * Returns a flat list of all InstitutionContexts.
 * Used by super-admin institution pickers.
 */
export async function listAllInstitutionContexts(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>
): Promise<InstitutionContext[]> {
  const [{ data: myjkknInsts }, coeInstitutions] = await Promise.all([
    supabase
      .from('institutions')
      .select('id, name, display_name, counselling_code')
      .eq('entity_type', 'institution')
      .order('name'),
    getCoeInstitutions(),
  ]);

  if (!myjkknInsts) return [];

  const results: InstitutionContext[] = [];

  for (const inst of myjkknInsts) {
    const coeInst = coeInstitutions.find((c) =>
      c.myjkkn_institution_ids?.includes(inst.id)
    );
    if (!coeInst) continue;

    results.push({
      myjkkn_id: inst.id,
      name: inst.name ?? '',
      display_name: inst.display_name ?? inst.name ?? '',
      counselling_code: inst.counselling_code ?? coeInst.counselling_code ?? '',
      coe_id: coeInst.id,
      institution_code: coeInst.institution_code ?? '',
      myjkkn_institution_ids: coeInst.myjkkn_institution_ids ?? [inst.id],
    });
  }

  // Deduplicate by coe_id — CAS Aided+Self would otherwise produce two rows.
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.coe_id)) return false;
    seen.add(r.coe_id);
    return true;
  });
}
