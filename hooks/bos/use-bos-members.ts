import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BosMember, CreateBosMemberDto, UpdateBosMemberDto } from '@/types/bos';
import { BosMemberService } from '@/lib/services/bos/bos-member-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export const bosMemberKeys = {
  all: ['bos-members'] as const,
  byComposition: (compositionId: string) =>
    [...bosMemberKeys.all, 'composition', compositionId] as const,
};

export function useBosMembersByComposition(compositionId: string | undefined) {
  return useQuery<BosMember[], Error>({
    queryKey: bosMemberKeys.byComposition(compositionId ?? ''),
    queryFn: () => BosMemberService.getMembers(compositionId!),
    enabled: !!compositionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useAddBosMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBosMemberDto) => BosMemberService.addMember(data),
    onSuccess: (newMember, variables) => {
      const compositionId = newMember.composition_id ?? variables.composition_id;
      // Write the new member into the cache immediately so the list re-renders
      // without waiting for the background GET to complete.
      queryClient.setQueryData<BosMember[]>(
        bosMemberKeys.byComposition(compositionId),
        (old = []) => [...old, newMember],
      );
      // Invalidate so the list is eventually reconciled with the server.
      queryClient.invalidateQueries({
        queryKey: bosMemberKeys.byComposition(compositionId),
      });
      queryClient.invalidateQueries({ queryKey: ['bos-compositions', 'detail'] });
    },
  });
}

export function useUpdateBosMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosMemberDto }) =>
      BosMemberService.updateMember(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: bosMemberKeys.byComposition(updated.composition_id),
      });
    },
  });
}

export function useRemoveBosMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, compositionId }: { id: string; compositionId: string }) =>
      BosMemberService.removeMember(id).then(() => ({ compositionId })),
    onSuccess: ({ compositionId }, variables) => {
      // Immediately remove the member from cache so the list re-renders without
      // waiting for the background GET to complete.
      queryClient.setQueryData<BosMember[]>(
        bosMemberKeys.byComposition(compositionId),
        (old = []) => old.filter((m) => m.id !== variables.id),
      );
      queryClient.invalidateQueries({
        queryKey: bosMemberKeys.byComposition(compositionId),
      });
      queryClient.invalidateQueries({ queryKey: ['bos-compositions', 'detail'] });
    },
  });
}
