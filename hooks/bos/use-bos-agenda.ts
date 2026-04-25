import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BosAgendaItem, CreateBosAgendaItemDto, UpdateBosAgendaItemDto } from '@/types/bos';
import { BosAgendaService } from '@/lib/services/bos/bos-agenda-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export const bosAgendaKeys = {
  all: ['bos-agenda'] as const,
  byMeeting: (meetingId: string) => [...bosAgendaKeys.all, 'meeting', meetingId] as const,
};

export function useBosAgendaItems(meetingId: string | undefined) {
  return useQuery<BosAgendaItem[], Error>({
    queryKey: bosAgendaKeys.byMeeting(meetingId ?? ''),
    queryFn: () => BosAgendaService.getAgendaItems(meetingId!),
    enabled: !!meetingId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useCreateBosAgendaItem(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<CreateBosAgendaItemDto, 'meeting_id' | 'item_number' | 'sort_order'>
    ) => BosAgendaService.createAgendaItem(meetingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bosAgendaKeys.byMeeting(meetingId) });
      // Refresh meeting detail so agenda_item_count updates
      queryClient.invalidateQueries({ queryKey: ['bos-meetings', 'detail'] });
    },
  });
}

export function useUpdateBosAgendaItem(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosAgendaItemDto }) =>
      BosAgendaService.updateAgendaItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bosAgendaKeys.byMeeting(meetingId) });
    },
  });
}

export function useDeleteBosAgendaItem(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => BosAgendaService.deleteAgendaItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bosAgendaKeys.byMeeting(meetingId) });
      queryClient.invalidateQueries({ queryKey: ['bos-meetings', 'detail'] });
    },
  });
}
