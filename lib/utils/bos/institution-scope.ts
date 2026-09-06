// ─────────────────────────────────────────────────────────────────────────────
// lib/utils/bos/institution-scope.ts
//
// Server-side equivalent of `useBosInstitutionScope`. Use inside any
// /api/bos/* route that filters data by institution to get the full CAS
// sibling pair + counselling_code in one call, instead of writing the
// expansion logic over and over.
//
// Behaviour mirrors the client hook exactly:
//   • Returns the COE-authoritative sibling pair when available
//   • Falls back to a Supabase counselling_code join if COE is unreachable
//   • Returns just [institutionsId] for non-CAS institutions
//   • Surfaces the counselling_code for callers that need to call the COE API
//
// Usage in an API route:
//
//   const supabase = await createClient();
//   const scope = await resolveBosInstitutionScope(supabase, body.institutions_id);
//   if (scope.ids.length === 0) return NextResponse.json({ data: [] });
//
//   const { data } = await supabase
//     .from('bos_whatever')
//     .select('*')
//     .in('institutions_id', scope.ids);
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveInstitutionContext } from '@/lib/utils/institutions/institution-resolver';

export interface BosInstitutionScopeServer {
  /** Full CAS sibling pair, or [single id] for non-CAS, or [] if input was empty. */
  ids: string[];
  /** Comma-separated `ids` for URL construction. Null when empty. */
  csv: string | null;
  /** COE-side institution_code (= counselling_code). Needed for COE proxy calls. */
  counsellingCode: string | null;
  /** Length-2 ids = CAS pair. */
  isCAS: boolean;
}

/**
 * Resolves a MyJKKN institutions UUID to its full BoS scope.
 *
 * Primary path: COE API via `resolveInstitutionContext` (authoritative).
 * Fallback path: Supabase counselling_code self-join.
 * Final fallback: `[institutionsId]` (treat as non-CAS).
 *
 * IMPORTANT: this function uses the *passed-in* Supabase client. Pass a
 * user-context client for normal flows (RLS applies to the institutions join
 * fallback). Pass a service-role client only when you have a documented need
 * to bypass institutions RLS (e.g. when user_institution_access fragments a
 * CAS pair and BoS spec requires both siblings to be treated as one).
 */
/**
 * Resolves a single MyJKKN institutions UUID to its `counselling_code` — the
 * CAS-collapsed key shared by both Aided + SF siblings. Use this on read paths
 * that filter a `bos_*` table by the denormalized `counselling_code` column
 * (added 2026-06-18): one local lookup, no COE dependency, and it spans the CAS
 * pair because both siblings carry the same code.
 *
 *   const code = await counsellingCodeFor(supabase, institutionsId);
 *   if (code) query = query.eq('counselling_code', code);
 *
 * Returns null when the id is empty or not found (caller decides: empty result
 * vs. fall back to an institutions_id filter).
 */
export async function counsellingCodeFor(
  supabase: SupabaseClient,
  institutionsId: string | null | undefined
): Promise<string | null> {
  if (!institutionsId) return null;
  const { data } = await supabase
    .from('institutions')
    .select('counselling_code')
    .eq('id', institutionsId)
    .maybeSingle();
  return (data?.counselling_code as string | undefined) ?? null;
}

/**
 * Resolves a regulation id to ALL CAS-sibling regulations of the same code.
 *
 * A CAS college has TWO `regulations` rows for one code (e.g. "R-2024") — one
 * per Aided/SF institution. PO/PSO and programme data may be entered under
 * EITHER sibling, so any lookup keyed by a single regulation_id must expand to
 * both to avoid missing data entered under the other sibling.
 *
 *   const regIds = await resolveCasRegulationIds(supabase, regulationId);
 *   query = query.in('regulation_id', regIds);
 *
 * Returns [regulationId] when the regulation is non-CAS or can't be resolved.
 */
export async function resolveCasRegulationIds(
  supabase: SupabaseClient,
  regulationId: string | null | undefined
): Promise<string[]> {
  if (!regulationId) return [];
  const { data: reg } = await supabase
    .from('regulations')
    .select('regulation_code, institution_id')
    .eq('id', regulationId)
    .maybeSingle();
  const code = (reg as { regulation_code?: string } | null)?.regulation_code;
  const instId = (reg as { institution_id?: string } | null)?.institution_id;
  if (!code || !instId) return [regulationId];

  const scope = await resolveBosInstitutionScope(supabase, instId);
  if (scope.ids.length <= 1) return [regulationId];

  const { data: sibRegs } = await supabase
    .from('regulations')
    .select('id')
    .eq('regulation_code', code)
    .in('institution_id', scope.ids);

  const ids = (sibRegs ?? []).map((r: { id: string }) => r.id);
  return ids.length > 0 ? [...new Set([regulationId, ...ids])] : [regulationId];
}

export async function resolveBosInstitutionScope(
  supabase: SupabaseClient,
  institutionsId: string | null | undefined
): Promise<BosInstitutionScopeServer> {
  if (!institutionsId) {
    return { ids: [], csv: null, counsellingCode: null, isCAS: false };
  }

  // Primary: COE API (authoritative for CAS Aided+SF pair).
  try {
    const ctx = await resolveInstitutionContext(institutionsId, supabase);
    if (ctx?.myjkkn_institution_ids && ctx.myjkkn_institution_ids.length > 0) {
      const ids = ctx.myjkkn_institution_ids;
      return {
        ids,
        csv: ids.join(','),
        counsellingCode: ctx.counselling_code ?? null,
        isCAS: ids.length > 1,
      };
    }
  } catch {
    // COE unavailable → Supabase fallback below.
  }

  // Fallback: counselling_code self-join in Supabase.
  const { data: inst } = await supabase
    .from('institutions')
    .select('counselling_code')
    .eq('id', institutionsId)
    .single();

  if (inst?.counselling_code) {
    const { data: siblings } = await supabase
      .from('institutions')
      .select('id')
      .eq('counselling_code', inst.counselling_code)
      .eq('is_active', true);

    if (siblings && siblings.length > 0) {
      const ids = siblings.map((s: { id: string }) => s.id);
      return {
        ids,
        csv: ids.join(','),
        counsellingCode: inst.counselling_code,
        isCAS: ids.length > 1,
      };
    }
  }

  // Final fallback: treat as non-CAS.
  return {
    ids: [institutionsId],
    csv: institutionsId,
    counsellingCode: inst?.counselling_code ?? null,
    isCAS: false,
  };
}

/**
 * Validates a client-supplied list of institutions_ids against the user's
 * BoS scope. Use after `resolveBosBoardScope` to ensure a non-admin caller
 * can't enumerate other institutions via a tampered csv query param.
 *
 * Returns the intersected, CAS-aware set of ids that are safe to query.
 * For super-admin, returns `requested` unchanged.
 *
 * "CAS-aware": if the user has access to *any* sibling of a pair, this
 * function treats them as having access to *both* siblings — matching the
 * BoS spec that institution_code (not institution_id) is the unit of access.
 *
 * Usage:
 *
 *   const allowed = await intersectBosScope(supabase, scope, requestedIds);
 *   if (allowed.length === 0) return NextResponse.json({ data: [] });
 *   query = query.in('institutions_id', allowed);
 */
export async function intersectBosScope(
  supabase: SupabaseClient,
  scope: { isSuperAdmin: boolean; institutionsId: string | null; allInstitutionIds: string[] },
  requested: string[]
): Promise<string[]> {
  if (requested.length === 0) return [];
  if (scope.isSuperAdmin) return requested;

  // Expand the user's own scope to its full CAS sibling closure.
  const expanded = new Set<string>();
  const seed = [
    ...(scope.institutionsId ? [scope.institutionsId] : []),
    ...scope.allInstitutionIds,
  ];
  for (const id of seed) {
    const sibScope = await resolveBosInstitutionScope(supabase, id);
    sibScope.ids.forEach((s) => expanded.add(s));
  }

  return requested.filter((id) => expanded.has(id));
}
