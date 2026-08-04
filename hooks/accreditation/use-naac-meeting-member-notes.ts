// hooks/accreditation/use-naac-meeting-member-notes.ts
// ============================================================================
// React Query hooks for each committee member's own account of an IQAC sitting,
// plus the Chairman/Coordinator's compile-into-minutes write.
//
// Keys hang off the existing naacMeetingKeys namespace so invalidation stays
// precise and the meeting list refreshes when compiled minutes land.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MeetingMemberNotesService,
  type MeetingMemberNote,
} from '@/lib/services/accreditation/meeting-member-notes-service';
import { CommitteeMeetingService } from '@/lib/services/accreditation/committee-meeting-service';
import { naacMeetingKeys } from '@/hooks/accreditation/use-naac-committee-meetings';

export const naacMeetingNoteKeys = {
  notes: [...naacMeetingKeys.meetings, 'member-notes'] as const,
  byMeeting: (meetingId: string) =>
    [...naacMeetingNoteKeys.notes, meetingId] as const,
};

/** Every note on a sitting the signed-in viewer is allowed to read. */
export function useMeetingMemberNotes(meetingId: string | undefined) {
  return useQuery<MeetingMemberNote[]>({
    queryKey: meetingId
      ? naacMeetingNoteKeys.byMeeting(meetingId)
      : [...naacMeetingNoteKeys.notes, 'none'],
    queryFn: () => MeetingMemberNotesService.listForMeeting(meetingId!),
    enabled: !!meetingId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Write / revise the signed-in member's own account. */
export function useSaveMyMeetingNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      meetingId,
      noteText,
    }: {
      meetingId: string;
      noteText: string;
    }) => MeetingMemberNotesService.saveMyNote(meetingId, noteText),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacMeetingNoteKeys.byMeeting(variables.meetingId),
      });
    },
  });
}

/**
 * Write the compiled minutes into the meeting's existing minutes_summary,
 * leaving status alone. The overwrite decision is made before this runs.
 */
export function useSaveMinutesSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      meetingId,
      minutesSummary,
    }: {
      meetingId: string;
      committeeId: string;
      minutesSummary: string;
    }) =>
      CommitteeMeetingService.updateMinutesSummary(meetingId, minutesSummary),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacMeetingKeys.meetingList(variables.committeeId),
      });
    },
  });
}
