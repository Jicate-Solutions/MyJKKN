'use client';

// React Query hooks for `learner_hostel_profiles`.
//
// - useLearnerHostelProfile(learnerId): reads the side-table row for a
//   learner. Returns null if no row exists yet (first-save state).
// - useSaveLearnerHostelFields(): composite mutation — updates hostel_type
//   on learners_profiles AND upserts the side-table row in one hook call.
//   This is what the edit drawer binds to.
//
// On success, invalidates BOTH:
//   - learnerHostelProfileKeys.detail(learnerId) — so reopening the drawer
//     shows the freshly-saved values
//   - learnerHosteliteKeys.all — so the Learners tab refetches because
//     hostel_type may have changed (drives the hostel badge in that tab).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LearnerHostelProfileService } from '@/lib/services/campus-living/learner-hostel-profile-service';
import { learnerHosteliteKeys } from '@/hooks/campus-living/use-learner-hostelites';
import type { LearnerHostelType } from '@/types/campus-living';
import type {
  LearnerHostelProfile,
  UpsertLearnerHostelProfileDTO,
} from '@/types/learner-hostel-profile';

export const learnerHostelProfileKeys = {
  all: ['learner-hostel-profile'] as const,
  detail: (learnerId: string | undefined) =>
    ['learner-hostel-profile', 'detail', learnerId ?? null] as const,
};

export function useLearnerHostelProfile(
  learnerId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: learnerHostelProfileKeys.detail(learnerId),
    queryFn: () =>
      learnerId
        ? LearnerHostelProfileService.getProfile(learnerId)
        : Promise.resolve(null),
    enabled: (options?.enabled ?? true) && !!learnerId,
    // 1 min staleTime — warden may open/close the drawer multiple times
    // in quick succession; avoid hitting the DB each time.
    staleTime: 60 * 1000,
  });
}

export interface SaveLearnerHostelFieldsInput {
  learnerId: string;
  hostelType: LearnerHostelType;
  profileFields: Omit<UpsertLearnerHostelProfileDTO, 'learner_id'>;
  updatedBy: string | null;
}

export function useSaveLearnerHostelFields() {
  const qc = useQueryClient();
  return useMutation<LearnerHostelProfile, Error, SaveLearnerHostelFieldsInput>({
    mutationFn: (input) => LearnerHostelProfileService.saveHostelFields(input),
    onSuccess: (_data, variables) => {
      // Refresh the drawer's own data for next open
      qc.invalidateQueries({
        queryKey: learnerHostelProfileKeys.detail(variables.learnerId),
      });
      // Refresh the Learners tab — hostel_type badge may have changed
      qc.invalidateQueries({ queryKey: learnerHosteliteKeys.all });
      toast.success('Saved.');
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });
}

// Exposed for the (unlikely) caller that only wants to upsert the side-
// table without touching hostel_type. Drawer does NOT use this — it uses
// the composite `useSaveLearnerHostelFields` above.
export function useUpsertLearnerHostelProfile() {
  const qc = useQueryClient();
  return useMutation<
    LearnerHostelProfile,
    Error,
    { payload: UpsertLearnerHostelProfileDTO; updatedBy: string | null }
  >({
    mutationFn: ({ payload, updatedBy }) =>
      LearnerHostelProfileService.upsertProfile(payload, updatedBy),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: learnerHostelProfileKeys.detail(variables.payload.learner_id),
      });
      toast.success('Hostel profile saved.');
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });
}
