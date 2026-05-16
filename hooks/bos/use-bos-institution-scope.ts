'use client';

// ─────────────────────────────────────────────────────────────────────────────
// hooks/bos/use-bos-institution-scope.ts
//
// The canonical client-side hook for resolving a BoS-scoped institution to its
// full CAS sibling pair + counselling_code. Use this whenever a BoS page or
// component needs to:
//   • filter data by the full institution_code group (Aided + SF for CAS)
//   • call a BoS API with the right ?institutionsIds=<csv> param
//   • pass the counselling_code to a COE proxy endpoint
//
// Background — why this hook exists:
//   In MyJKKN, CAS colleges have TWO institutions rows (Aided + Self-Financing)
//   sharing one `counselling_code` (which is the COE-side `institution_code`).
//   BoS treats those two MyJKKN UUIDs as a single logical institution. Any
//   query that filters by `institutions_id = <one uuid>` silently misses half
//   the data for CAS colleges. The fix is to always expand a single UUID to
//   its sibling pair via the COE API before filtering.
//
// Three callers we've already wired through this pattern:
//   - /bos/compositions/[id]   : regulations & taxonomy lookups
//   - AddMemberDialog          : facilitator picker
//   - /api/bos/lookup/facilitators : server-side expansion as a defense layer
//
// New BoS pages should use this hook so the same correctness is automatic.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { useInstitutionContextById } from '@/hooks/use-institution-context';

export interface BosInstitutionScope {
  /**
   * The full set of MyJKKN UUIDs that make up this institution. Length 2 for
   * a CAS pair (Aided + SF), length 1 for non-CAS. Use this for
   *   query.in('institutions_id', scope.ids)
   * or any client-side .filter() that needs to span the pair.
   */
  ids: string[];

  /**
   * Comma-separated form of `ids` for URL params, e.g.:
   *   fetch(`/api/bos/foo?institutionsIds=${scope.csv}`)
   * Null while loading or when there's no resolved institution yet — callers
   * should treat null as "not ready, defer the request."
   */
  csv: string | null;

  /**
   * The COE-side `institution_code` (= MyJKKN `counselling_code`). Required
   * for COE proxy endpoints like /api/bos/courses-master.
   */
  counsellingCode: string | undefined;

  /** True for CAS institutions (Aided + SF pair), false for single-row institutions. */
  isCAS: boolean;

  /** True while the COE-API resolution is in flight. Don't fire dependent fetches yet. */
  isLoading: boolean;

  /** Any resolution error (network, 404 from /api/institutions/resolve, etc.). */
  error: Error | null;
}

/**
 * Resolves a single MyJKKN institution UUID to its full BoS scope.
 *
 * Pass `composition.institutions_id` (or any other context-specific id) and
 * the hook returns the canonical bundle. The underlying `/api/institutions/resolve`
 * call is cached by React Query per id, so repeated calls on the same page
 * (e.g. one in the page + one inside a dialog component) hit memory not network.
 *
 * Usage in a component:
 *
 *   const scope = useBosInstitutionScope(composition?.institutions_id);
 *   const { data, isLoading } = useQuery({
 *     queryKey: ['bos', 'whatever', scope.csv],
 *     enabled: !scope.isLoading && !!scope.csv,
 *     queryFn: () => fetch(`/api/bos/whatever?institutionsIds=${scope.csv}`).then(r => r.json()),
 *   });
 */
export function useBosInstitutionScope(
  institutionsId: string | null | undefined
): BosInstitutionScope {
  const ctx = useInstitutionContextById(institutionsId);

  return useMemo<BosInstitutionScope>(() => {
    const data = ctx.data;
    const siblings = data?.myjkkn_institution_ids;
    const ids = siblings && siblings.length > 0
      ? siblings
      : institutionsId
        ? [institutionsId]
        : [];

    return {
      ids,
      csv: ids.length > 0 ? ids.join(',') : null,
      counsellingCode: data?.counselling_code,
      isCAS: ids.length > 1,
      isLoading: ctx.isLoading,
      error: ctx.error ?? null,
    };
  }, [ctx.data, ctx.isLoading, ctx.error, institutionsId]);
}
