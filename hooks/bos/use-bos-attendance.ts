import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BosMeetingAttendee } from '@/types/bos';
import {
  BosAttendanceService,
  AttendanceUpsertRecord,
} from '@/lib/services/bos/bos-attendance-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export const bosAttendanceKeys = {
  all: ['bos-attendance'] as const,
  byMeeting: (meetingId: string) => [...bosAttendanceKeys.all, 'meeting', meetingId] as const,
};

export function useBosAttendance(meetingId: string | undefined) {
  return useQuery<BosMeetingAttendee[], Error>({
    queryKey: bosAttendanceKeys.byMeeting(meetingId ?? ''),
    queryFn: () => BosAttendanceService.getAttendance(meetingId!),
    enabled: !!meetingId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useSaveBosAttendance(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (records: AttendanceUpsertRecord[]) =>
      BosAttendanceService.saveAttendance(meetingId, records),
    onSuccess: (saved) => {
      // Optimistically update the cache directly
      queryClient.setQueryData<BosMeetingAttendee[]>(
        bosAttendanceKeys.byMeeting(meetingId),
        saved
      );
      // Refresh meeting detail so attendee_count reflects changes
      queryClient.invalidateQueries({ queryKey: ['bos-meetings', 'detail'] });
    },
  });
}
