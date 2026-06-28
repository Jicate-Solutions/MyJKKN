'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LearnerHosteliteService } from '@/lib/services/campus-living/learner-hostelite-service';

export const unallocatedCandidatesKeys = {
  all: ['hostel-unallocated-candidates'] as const,
  byInstitution: (institutionId?: string) =>
    ['hostel-unallocated-candidates', institutionId ?? 'all'] as const,
};

export function useUnallocatedCandidates(institutionId?: string) {
  return useQuery({
    queryKey: unallocatedCandidatesKeys.byInstitution(institutionId),
    queryFn: () => LearnerHosteliteService.listUnallocated(institutionId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useInvalidateUnallocatedCandidates() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({ queryKey: unallocatedCandidatesKeys.all });
}
