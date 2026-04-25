import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BosTaDaClaim, BosClaimStatus } from '@/types/bos';
import { BosTaDaService, CreateTaDaClaimDto, UpdateTaDaClaimDto } from '@/lib/services/bos/bos-ta-da-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export const bosTaDaKeys = {
  all: ['bos-ta-da'] as const,
  byMeeting: (meetingId: string) => [...bosTaDaKeys.all, 'meeting', meetingId] as const,
  byInstitution: (institutionsId: string) =>
    [...bosTaDaKeys.all, 'institution', institutionsId] as const,
};

export function useBosTaDaClaims(params: {
  meetingId?: string;
  institutionsId?: string;
  claimStatus?: BosClaimStatus;
}) {
  return useQuery<BosTaDaClaim[], Error>({
    queryKey: [...bosTaDaKeys.all, params],
    queryFn: () => BosTaDaService.getClaims(params),
    enabled: !!(params.meetingId || params.institutionsId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useCreateBosTaDaClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaDaClaimDto) => BosTaDaService.createClaim(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({
        queryKey: bosTaDaKeys.byMeeting(created.meeting_id),
      });
      queryClient.invalidateQueries({ queryKey: bosTaDaKeys.all });
    },
  });
}

export function useUpdateBosTaDaClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaDaClaimDto }) =>
      BosTaDaService.updateClaim(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: bosTaDaKeys.byMeeting(updated.meeting_id),
      });
    },
  });
}

export function useDeleteBosTaDaClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, meetingId }: { id: string; meetingId: string }) =>
      BosTaDaService.deleteClaim(id).then(() => ({ meetingId })),
    onSuccess: ({ meetingId }) => {
      queryClient.invalidateQueries({ queryKey: bosTaDaKeys.byMeeting(meetingId) });
    },
  });
}
