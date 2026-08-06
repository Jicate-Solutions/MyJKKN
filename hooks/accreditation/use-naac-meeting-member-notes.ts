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
import { createClientSupabaseClient } from '@/lib/supabase/client';

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

export interface NoteAuthorProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
}

/**
 * Live profiles for note authors who still have one.
 *
 * This is a CONVENIENCE, not the source of attribution. A note carries its own
 * author_name / author_email snapshot precisely so it stays attributed after
 * the author's profile row is deleted, and callers must prefer that snapshot;
 * this lookup only exists so a note written before the snapshot landed still
 * shows a name. Departed authors have author_user_id === null and are filtered
 * out here — passing a null into .in('id', …) would send `null` to PostgREST
 * and turn a legitimate lookup into a malformed one.
 */
export function useNoteAuthorProfiles(userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((v): v is string => !!v))].sort();
  return useQuery({
    // Same key shape as the committee detail page's lookup, so the two share a
    // cache entry rather than issuing the request twice.
    queryKey: ['profiles', 'lookup', ids.join(',')],
    queryFn: async (): Promise<Record<string, NoteAuthorProfileLite>> => {
      if (ids.length === 0) return {};
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      if (error) throw error;
      return ((data ?? []) as NoteAuthorProfileLite[]).reduce<
        Record<string, NoteAuthorProfileLite>
      >((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
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
