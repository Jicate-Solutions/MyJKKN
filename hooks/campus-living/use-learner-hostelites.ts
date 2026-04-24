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
