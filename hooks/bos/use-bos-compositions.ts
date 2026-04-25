// hooks/bos/use-bos-compositions.ts

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import {
  BosComposition,
  BosCompositionFilters,
  BosListResponse,
  CreateBosCompositionDto,
  UpdateBosCompositionDto,
} from '@/types/bos';
import { BosCompositionService } from '@/lib/services/bos/bos-composition-service';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export const bosCompositionKeys = {
  all: ['bos-compositions'] as const,
  lists: () => [...bosCompositionKeys.all, 'list'] as const,
  list: (filters: BosCompositionFilters) =>
    [...bosCompositionKeys.lists(), filters] as const,
  details: () => [...bosCompositionKeys.all, 'detail'] as const,
  detail: (id: string) => [...bosCompositionKeys.details(), id] as const,
};

export function useBosCompositions(
  filters: BosCompositionFilters = {}
): UseQueryResult<BosListResponse<BosComposition>, Error> {
  const { profile } = useAuth();

  const scopedFilters: BosCompositionFilters = {
    ...filters,
    institutionsId: profile?.institution_id ?? filters.institutionsId,
  };

  return useQuery({
    queryKey: bosCompositionKeys.list(scopedFilters),
    queryFn: () => BosCompositionService.getCompositions(scopedFilters),
    enabled: !!profile?.institution_id,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useBosComposition(id: string | undefined) {
  return useQuery({
    queryKey: bosCompositionKeys.detail(id ?? ''),
    queryFn: () => BosCompositionService.getComposition(id!),
    enabled: !!id,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useCreateBosComposition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBosCompositionDto) =>
      BosCompositionService.createComposition(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bosCompositionKeys.lists() });
    },
  });
}

export function useUpdateBosComposition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosCompositionDto }) =>
      BosCompositionService.updateComposition(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(bosCompositionKeys.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: bosCompositionKeys.lists() });
    },
  });
}

export function useDeleteBosComposition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BosCompositionService.deleteComposition(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: bosCompositionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: bosCompositionKeys.lists() });
    },
  });
}
