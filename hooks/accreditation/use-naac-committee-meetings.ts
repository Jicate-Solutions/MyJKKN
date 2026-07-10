// hooks/accreditation/use-naac-committee-meetings.ts
// ============================================================================
// React Query hooks for the IQAC Meeting Loop (PR 2/3): committee meetings +
// resolutions with next-meeting review. Extends the naacCommitteeKeys
// convention (see use-naac-committees.ts) with meetings/resolutions
// namespaces so invalidation stays precise.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CommitteeMeetingService,
  type CreateMeetingPayload,
  type PassResolutionPayload,
  type ResolutionReviewAction,
} from '@/lib/services/accreditation/committee-meeting-service';
import { naacCommitteeKeys } from '@/hooks/accreditation/use-naac-committees';

// Keys — hang off the existing NAAC committee namespace.
export const naacMeetingKeys = {
  meetings: [...naacCommitteeKeys.all, 'meetings'] as const,
  meetingList: (committeeId: string) =>
    [...naacMeetingKeys.meetings, 'list', committeeId] as const,
  resolutions: [...naacCommitteeKeys.all, 'resolutions'] as const,
  openResolutions: (committeeId: string) =>
    [...naacMeetingKeys.resolutions, 'open', committeeId] as const,
  meetingResolutions: (meetingId: string) =>
    [...naacMeetingKeys.resolutions, 'by-meeting', meetingId] as const,
  reviewedInMeeting: (meetingId: string) =>
    [...naacMeetingKeys.resolutions, 'reviewed-in', meetingId] as const,
};

// -------------------- Queries --------------------

export function useCommitteeMeetings(committeeId: string | undefined) {
  return useQuery({
    queryKey: committeeId
      ? naacMeetingKeys.meetingList(committeeId)
      : [...naacMeetingKeys.meetings, 'list', 'none'],
    queryFn: () => CommitteeMeetingService.listMeetings(committeeId!),
    enabled: !!committeeId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Open resolutions for a committee (the next meeting's review queue). */
export function useOpenResolutions(committeeId: string | undefined) {
  return useQuery({
    queryKey: committeeId
      ? naacMeetingKeys.openResolutions(committeeId)
      : [...naacMeetingKeys.resolutions, 'open', 'none'],
    queryFn: () => CommitteeMeetingService.listOpenResolutions(committeeId!),
    enabled: !!committeeId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Resolutions PASSED in a meeting. */
export function useMeetingResolutions(meetingId: string | undefined) {
  return useQuery({
    queryKey: meetingId
      ? naacMeetingKeys.meetingResolutions(meetingId)
      : [...naacMeetingKeys.resolutions, 'by-meeting', 'none'],
    queryFn: () => CommitteeMeetingService.listResolutionsByMeeting(meetingId!),
    enabled: !!meetingId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Resolutions REVIEWED (done/carried/dropped) in a meeting. */
export function useReviewedInMeeting(meetingId: string | undefined) {
  return useQuery({
    queryKey: meetingId
      ? naacMeetingKeys.reviewedInMeeting(meetingId)
      : [...naacMeetingKeys.resolutions, 'reviewed-in', 'none'],
    queryFn: () => CommitteeMeetingService.listReviewedInMeeting(meetingId!),
    enabled: !!meetingId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// -------------------- Mutations --------------------

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMeetingPayload) =>
      CommitteeMeetingService.createMeeting(payload),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacMeetingKeys.meetingList(variables.committee_id),
      });
    },
  });
}

export function useMarkMeetingHeld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ meetingId }: { meetingId: string; committeeId: string }) =>
      CommitteeMeetingService.markHeld(meetingId),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacMeetingKeys.meetingList(variables.committeeId),
      });
    },
  });
}

export function useCloseMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      meetingId,
      minutesSummary,
    }: {
      meetingId: string;
      committeeId: string;
      minutesSummary: string;
    }) => CommitteeMeetingService.closeMeeting(meetingId, minutesSummary),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacMeetingKeys.meetingList(variables.committeeId),
      });
    },
  });
}

export function useCancelMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ meetingId }: { meetingId: string; committeeId: string }) =>
      CommitteeMeetingService.cancelMeeting(meetingId),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacMeetingKeys.meetingList(variables.committeeId),
      });
    },
  });
}

export function usePassResolution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PassResolutionPayload) =>
      CommitteeMeetingService.passResolution(payload),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacMeetingKeys.openResolutions(variables.committee_id),
      });
      qc.invalidateQueries({
        queryKey: naacMeetingKeys.meetingResolutions(variables.meeting_id),
      });
    },
  });
}

export function useReviewResolution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reviewedInMeetingId,
      outcomeNote,
    }: {
      id: string;
      action: ResolutionReviewAction;
      reviewedInMeetingId: string;
      committeeId: string;
      outcomeNote?: string | null;
    }) =>
      CommitteeMeetingService.reviewResolution(
        id,
        action,
        reviewedInMeetingId,
        outcomeNote,
      ),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacMeetingKeys.openResolutions(variables.committeeId),
      });
      qc.invalidateQueries({
        queryKey: naacMeetingKeys.reviewedInMeeting(
          variables.reviewedInMeetingId,
        ),
      });
    },
  });
}
