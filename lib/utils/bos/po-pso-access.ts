// ─────────────────────────────────────────────────────────────────────────────
// lib/utils/bos/po-pso-access.ts
//
// Shared resolution + authorization helpers for the /api/bos/po-pso/* routes
// (institution master POs/PSOs + per-board PSO overrides).
//
// Write model (mirrors the BoS spec, not custom_roles permission keys):
//   master  — super-admin, principal of the institution, or ANY active board
//             member at the institution (CAS-aware).
//   board   — super-admin, principal of the institution, or member of THAT
//             board (scope.boardsOf).
// Routes authorize here, then write with the service-role client (same
// editor-flow pattern as bos_ta_da_claims).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BosBoardScope } from '@/lib/utils/bos/bos-access';
import { resolveCoeInstitutionById } from '@/lib/utils/bos/bos-access';
import { resolveBosInstitutionScope } from '@/lib/utils/bos/institution-scope';

export interface PoPsoTarget {
  /** Full CAS sibling id set (MyJKKN UUIDs) — use for reads and deletes. */
  ids: string[];
  /** Canonical MyJKKN UUID to write new rows under (FK → institutions). */
  canonicalId: string;
}

/**
 * Resolves a requested institution id — which may live in EITHER id space
 * (MyJKKN UUID from scope-based callers, or COE UUID from /api/bos/institutions
 * options) — to the CAS-expanded set of MyJKKN institution UUIDs.
 * Same dual-space tolerance as GET /api/bos/boards.
 */
export async function resolvePoPsoTarget(
  db: SupabaseClient,
  requestedId: string
): Promise<PoPsoTarget | null> {
  // MyJKKN space? The institutions row must exist (FK target for writes).
  const { data: inst } = await db
    .from('institutions')
    .select('id')
    .eq('id', requestedId)
    .maybeSingle();

  if (inst?.id) {
    const scope = await resolveBosInstitutionScope(db, requestedId);
    const ids = scope.ids.length > 0 ? scope.ids : [requestedId];
    return { ids, canonicalId: requestedId };
  }

  // COE space: bridge to the MyJKKN sibling set.
  const coe = await resolveCoeInstitutionById(requestedId);
  if (coe?.myjkkn_institution_ids && coe.myjkkn_institution_ids.length > 0) {
    return {
      ids: coe.myjkkn_institution_ids,
      canonicalId: coe.myjkkn_institution_ids[0],
    };
  }

  return null;
}

/** May this user edit the institution MASTER PO/PSO sets? */
export function canWriteMasterOutcomes(
  scope: BosBoardScope,
  targetIds: string[]
): boolean {
  if (scope.isSuperAdmin) return true;
  const target = new Set(targetIds);
  if (scope.isPrincipal) {
    return (
      scope.allInstitutionIds.some((id) => target.has(id)) ||
      (!!scope.institutionsId && target.has(scope.institutionsId))
    );
  }
  // Any active board membership at the institution grants master edit.
  return [...scope.institutionsOf].some((id) => target.has(id));
}

/** May this user edit the PSO override of a specific board? */
export function canWriteBoardPsos(
  scope: BosBoardScope,
  boardId: string,
  targetIds: string[]
): boolean {
  if (scope.isSuperAdmin) return true;
  const target = new Set(targetIds);
  if (scope.isPrincipal) {
    return (
      scope.allInstitutionIds.some((id) => target.has(id)) ||
      (!!scope.institutionsId && target.has(scope.institutionsId))
    );
  }
  return scope.boardsOf.has(boardId);
}
