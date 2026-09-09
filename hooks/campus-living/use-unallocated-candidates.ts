'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LearnerHosteliteService } from '@/lib/services/campus-living/learner-hostelite-service';

export const unallocatedCandidatesKeys = {
  all: ['hostel-unallocated-candidates'] as const,
  byInstitution: (institutionId?: string, institutionIds?: string[]) =>
    [
      'hostel-unallocated-candidates',
      institutionId ?? 'all',
      institutionIds?.length ? [...institutionIds].sort().join(',') : 'all',
    ] as const,
};

/**
 * @param institutionIds the colleges a block-scoped warden's blocks serve. An
 *   unplaced learner holds no block, so block scope cannot reach them directly;
 *   the institutions behind the blocks are the equivalent scope.
 *
 * `undefined` means "no set-scope"; an EMPTY array means "a set-scope is in
 * force but has not resolved yet" and holds the fetch. The distinction matters:
 * the RPC reads a null p_institution_ids as EVERY institution, so firing during
 * that window would briefly show a warden the whole platform's unplaced
 * learners — the same scope race documented in use-hostel-allocations.ts.
 */
export function useUnallocatedCandidates(institutionId?: string, institutionIds?: string[]) {
  const scopePending = institutionIds !== undefined && institutionIds.length === 0;
  return useQuery({
    queryKey: unallocatedCandidatesKeys.byInstitution(institutionId, institutionIds),
    queryFn: () => LearnerHosteliteService.listUnallocated(institutionId, institutionIds),
    enabled: !scopePending,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useInvalidateUnallocatedCandidates() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({ queryKey: unallocatedCandidatesKeys.all });
}
