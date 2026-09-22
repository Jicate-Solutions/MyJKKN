// app/(routes)/accreditation/cac/_lib/use-cac-community.ts
// ============================================================================
// The two reads behind the community-collaboration panel.
//
// TWO FUNCTIONS, TWO KEYS. `hooks/accreditation/use-cac-cluster.ts` settled the
// rule this file follows: one query key per REQUEST, not one per page. These
// are two SECURITY DEFINER functions with their own guards, so sharing a key
// would make one cache entry serve two payloads and whichever resolved last
// would win.
//
// WHY THEY ARE FUNCTIONS AND NOT `.from('sh_community_engagements')`.
// The register is RLS-scoped, so reading it from the browser returns the
// VIEWER's slice — and a Cluster Academic Council member's access rules are
// usually scoped to one institution. That is the precise bug this whole module
// was rewritten to remove on 2026-08-01: the council was shown a slice of the
// cluster it exists to look across, and from the client a hidden row and an
// absent row are the same empty array. Reading as definer is what lets the
// panel state an absence plainly instead of hedging it.
//
// Read-only. Nothing here writes; the way to change any figure below is to
// record the work in the module that owns it.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CommunityClusterTotals,
  CommunityCollegeRow,
} from './community-collaboration';

export const cacCommunityClusterKeys = {
  all: ['accreditation', 'cac-community-cluster'] as const,
};

export const cacCommunityCollegeKeys = {
  all: ['accreditation', 'cac-community-colleges'] as const,
};

// These records move on the departments' timeline, not this page's. Five
// minutes matches every other read on this page, so returning to it does not
// re-run the aggregation.
const SHARED_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;

/**
 * `fn_community_cluster_totals()` returns ONE row.
 *
 * Null when the function returned nothing at all — which the panel renders as
 * "nothing recorded yet", never as a row of zeros. Defaulting the fields to 0
 * here instead would hand the screen a figure it cannot tell apart from a
 * measured one, and that is the bare zero the council's second decision
 * forbids.
 */
async function fetchCommunityClusterTotals(): Promise<CommunityClusterTotals | null> {
  const sb = createClientSupabaseClient() as any;
  const { data, error } = await sb.rpc('fn_community_cluster_totals');
  if (error) throw error;

  // A set-returning function comes back as an array; a scalar one as an object.
  // Accept both rather than depend on which the sibling lane shipped.
  const row = Array.isArray(data) ? data[0] : data;
  return (row as CommunityClusterTotals | undefined) ?? null;
}

/**
 * `fn_community_college_totals()` returns one row per (college, INITIATIVE) —
 * not one per college.
 *
 * The rows are handed on at that grain and folded into college lines by
 * `aggregateColleges`, so that the fold is a pure function a test can drive
 * rather than something buried in a fetch. This hook's job ends at the
 * contract.
 */
async function fetchCommunityCollegeRows(): Promise<CommunityCollegeRow[]> {
  const sb = createClientSupabaseClient() as any;
  const { data, error } = await sb.rpc('fn_community_college_totals');
  if (error) throw error;
  // Anything that is not an array is a contract change, and an empty list is
  // the safe reading of it: the panel treats "no rows" as "nothing recorded",
  // never as "these colleges did nothing".
  return Array.isArray(data) ? (data as CommunityCollegeRow[]) : [];
}

export function useCacCommunityClusterTotals() {
  return useQuery({
    queryKey: cacCommunityClusterKeys.all,
    queryFn: fetchCommunityClusterTotals,
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useCacCommunityCollegeRows() {
  return useQuery({
    queryKey: cacCommunityCollegeKeys.all,
    queryFn: fetchCommunityCollegeRows,
    ...SHARED_QUERY_OPTIONS,
  });
}
