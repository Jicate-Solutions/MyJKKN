// hooks/use-classroom-practice-micro.ts
// Classroom Practice L2 — the one micro-item riding a feedback submission.
// Mirrors the SCF hook conventions (hooks/use-session-feedback.ts).
//
// The fetch is deliberately a ONE-SHOT: the item is RECORDED server-side at the
// moment it is handed out (an ignored offer must still count against the
// learner's response rate), so a refetch would burn deck slots for nothing.
// retry/refetch are therefore all off, and the result is cached for the life of
// the dialog.

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ClassroomPracticeMicroService,
  type MicroItem,
} from '@/lib/services/classroom-practice-micro-service';

export const cpMicroQueryKeys = {
  all: ['cp-micro'] as const,
  // timetableId is part of the key because it is part of the SESSION identity:
  // a learner can sit two different classes in the same period slot on one day.
  // Without it, and with staleTime:Infinity below, the second dialog would be
  // served the first session's cached item and answering would hit an
  // already-answered impression.
  item: (attendanceDate: string, timetableId: string, periodId: string) =>
    [...cpMicroQueryKeys.all, 'item', attendanceDate, timetableId, periodId] as const,
};

/** The single item to offer for this session, or null to render nothing. */
export function useMicroItem(
  attendanceDate: string,
  timetableId: string,
  periodId: string,
  enabled: boolean,
) {
  return useQuery<MicroItem | null>({
    queryKey: cpMicroQueryKeys.item(attendanceDate, timetableId, periodId),
    queryFn: () =>
      ClassroomPracticeMicroService.nextItem(attendanceDate, timetableId, periodId),
    enabled: enabled && !!attendanceDate && !!timetableId && !!periodId,
    // One shot only — see the note at the top of this file.
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
}

/** Record a 0-4 answer or a skip. Never rejects (the service swallows), so the
 *  component can show the same quiet thanks state on every outcome. Resolves
 *  with the server's commentInvite decision. */
export function useAnswerMicroItem() {
  return useMutation({
    mutationFn: (input: { impressionId: string; score: number | null; skip: boolean }) =>
      ClassroomPracticeMicroService.answer(input.impressionId, input.score, input.skip),
    retry: false,
  });
}

/** Attach the one optional sealed line for the Principal. Never rejects. */
export function useSealedComment() {
  return useMutation({
    mutationFn: (input: { impressionId: string; comment: string }) =>
      ClassroomPracticeMicroService.comment(input.impressionId, input.comment),
    retry: false,
  });
}
