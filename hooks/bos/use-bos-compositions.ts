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
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Every keyed function takes userId as its first argument so the React Query
// cache is partitioned per authenticated user. Without this, the module-level
// QueryClient in providers/query-client-provider.tsx serves user A's cached
// composition list to user B after a session change — until staleTime expires
// or the user hits refresh. Same root cause across all user-scoped BoS hooks.
export const bosCompositionKeys = {
  all: (userId: string | null | undefined) =>
    ['bos-compositions', userId ?? 'anonymous'] as const,
  lists: (userId: string | null | undefined) =>
    [...bosCompositionKeys.all(userId), 'list'] as const,
  list: (userId: string | null | undefined, filters: BosCompositionFilters) =>
    [...bosCompositionKeys.lists(userId), filters] as const,
  details: (userId: string | null | undefined) =>
    [...bosCompositionKeys.all(userId), 'detail'] as const,
  detail: (userId: string | null | undefined, id: string) =>
    [...bosCompositionKeys.details(userId), id] as const,
};

export function useBosCompositions(
  filters: BosCompositionFilters = {}
): UseQueryResult<BosListResponse<BosComposition>, Error> {
  const { profile } = useAuth();
  const { data: institutionCtx } = useInstitutionContext();
  const userId = profile?.id ?? null;

  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

  const scopedFilters: BosCompositionFilters = {
    ...filters,
    institutionsId: institutionCtx?.myjkkn_id ?? filters.institutionsId,
  };

  return useQuery({
    queryKey: bosCompositionKeys.list(userId, scopedFilters),
    queryFn: () => BosCompositionService.getCompositions(scopedFilters),
    enabled: !!profile && (!!institutionCtx?.myjkkn_id || isSuperAdmin),
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useBosComposition(id: string | undefined) {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useQuery({
    queryKey: bosCompositionKeys.detail(userId, id ?? ''),
    queryFn: () => BosCompositionService.getComposition(id!),
    enabled: !!id && !!userId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useCreateBosComposition() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useMutation({
    mutationFn: (data: CreateBosCompositionDto) =>
      BosCompositionService.createComposition(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bosCompositionKeys.lists(userId) });
    },
  });
}

export function useUpdateBosComposition() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosCompositionDto }) =>
      BosCompositionService.updateComposition(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(bosCompositionKeys.detail(userId, updated.id), updated);
      queryClient.invalidateQueries({ queryKey: bosCompositionKeys.lists(userId) });
    },
  });
}

export function useDeleteBosComposition() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  return useMutation({
    mutationFn: (id: string) => BosCompositionService.deleteComposition(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: bosCompositionKeys.detail(userId, id) });
      queryClient.invalidateQueries({ queryKey: bosCompositionKeys.lists(userId) });
    },
  });
}
