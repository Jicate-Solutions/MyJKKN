'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LearnerHosteliteService } from '@/lib/services/campus-living/learner-hostelite-service';
import type {
  LearnerHostelitesFilters,
  LearnerHostelType,
} from '@/types/campus-living';

export const learnerHosteliteKeys = {
  all: ['learner-hostelites'] as const,
  list: (institutionId: string | undefined, filters: LearnerHostelitesFilters | undefined) =>
    ['learner-hostelites', 'list', institutionId ?? null, filters ?? null] as const,
  candidates: (institutionId: string | undefined, search: string) =>
    ['learner-hostelites', 'candidates', institutionId ?? null, search] as const,
  blocks: (institutionId: string | undefined) =>
    ['learner-hostelites', 'blocks', institutionId ?? null] as const,
  detail: (learnerId: string | null) =>
    ['learner-hostelites', 'detail', learnerId] as const,
};

export function useLearnerHostelites(
  institutionId: string | undefined,
  filters?: LearnerHostelitesFilters,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: learnerHosteliteKeys.list(institutionId, filters),
    queryFn: () => LearnerHosteliteService.listHostelites(institutionId, filters),
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });
}

// Detail bundle for the click-anywhere-on-row drawer (BUG-003326).
// 5-min stale window per /assumption-thrash Round 3 #3 (lineage decision —
// stale-cache pattern, no realtime).
export function useLearnerDetailBundle(learnerId: string | null) {
  return useQuery({
    queryKey: learnerHosteliteKeys.detail(learnerId),
    queryFn: () =>
      learnerId
        ? LearnerHosteliteService.getLearnerDetailBundle(learnerId)
        : Promise.reject(new Error('learnerId required')),
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000,
  });
}

// Block list for the Block filter dropdown.
export function useHostelBlocksForFilter(institutionId?: string) {
  return useQuery({
    queryKey: learnerHosteliteKeys.blocks(institutionId),
    queryFn: () => LearnerHosteliteService.listBlocksForFilter(institutionId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRemoveLearnerFromHostel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (learnerId: string) => LearnerHosteliteService.removeFromHostel(learnerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: learnerHosteliteKeys.all });
      toast.success('Removed from hostel. Learner is now classified as day scholar.');
    },
    onError: (err: Error) => {
      toast.error(`Failed to remove: ${err.message}`);
    },
  });
}

export function useAddLearnerToHostel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      learnerId,
      hostelType,
    }: {
      learnerId: string;
      hostelType?: LearnerHostelType;
    }) => LearnerHosteliteService.addToHostel(learnerId, hostelType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: learnerHosteliteKeys.all });
      toast.success('Added to hostel.');
    },
    onError: (err: Error) => {
      toast.error(`Failed to add: ${err.message}`);
    },
  });
}

export function useSearchHosteliteCandidates(
  institutionId: string | undefined,
  search: string,
) {
  return useQuery({
    queryKey: learnerHosteliteKeys.candidates(institutionId, search),
    queryFn: () => LearnerHosteliteService.searchCandidates(institutionId, search),
    enabled: search.trim().length >= 2,
    staleTime: 30 * 1000,
  });
}
