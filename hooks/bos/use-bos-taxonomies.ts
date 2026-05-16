// hooks/bos/use-bos-taxonomies.ts
// React Query hooks for the master taxonomy registry (Bloom's, Fink's, custom).

import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import {
  BosListResponse,
  BosTaxonomyFilters,
  BosTaxonomySummary,
  BosTaxonomyWithLevels,
  CreateBosTaxonomyDto,
  UpdateBosTaxonomyDto,
} from '@/types/bos';
import { BosTaxonomyMasterService } from '@/lib/services/bos/bos-taxonomy-master-service';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ── Query Key Factory ────────────────────────────────────────────────────────
// Same shape as the rest of /hooks/bos/* so cache-invalidation idioms transfer.

export const bosTaxonomyKeys = {
  all: ['bos-taxonomies'] as const,
  lists: () => [...bosTaxonomyKeys.all, 'list'] as const,
  list: (filters: BosTaxonomyFilters) => [...bosTaxonomyKeys.lists(), filters] as const,
  details: () => [...bosTaxonomyKeys.all, 'detail'] as const,
  detail: (id: string) => [...bosTaxonomyKeys.details(), id] as const,
};

// ── useBosTaxonomies ─────────────────────────────────────────────────────────
// Paginated list of taxonomy frameworks for the current institution.
// Each row carries a level_count so the UI can show "K1..K6" at a glance.

export function useBosTaxonomies(
  filters: BosTaxonomyFilters = {}
): UseQueryResult<BosListResponse<BosTaxonomySummary>, Error> {
  const { profile } = useAuth();

  const scopedFilters: BosTaxonomyFilters = {
    ...filters,
    institutionsId: filters.institutionsId ?? profile?.institution_id ?? undefined,
  };

  // Super-admins legitimately have no institution_id (they're cross-institution
  // by design). The API already returns all institutions' rows when no
  // institutionsId is supplied, so don't gate the query on a value the user
  // will never have. Wait until the profile has loaded so we can tell which
  // path applies, then run.
  const enabled =
    !!profile && (!!scopedFilters.institutionsId || !!profile.is_super_admin);

  return useQuery({
    queryKey: bosTaxonomyKeys.list(scopedFilters),
    queryFn: () => BosTaxonomyMasterService.list(scopedFilters),
    enabled,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ── useBosTaxonomy ───────────────────────────────────────────────────────────
// Fetches one taxonomy with all its levels. Used by the edit form / detail dialog.

export function useBosTaxonomy(id: string | undefined) {
  return useQuery({
    queryKey: bosTaxonomyKeys.detail(id ?? ''),
    queryFn: () => BosTaxonomyMasterService.get(id!),
    enabled: !!id,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

// ── useCreateBosTaxonomy ─────────────────────────────────────────────────────

export function useCreateBosTaxonomy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBosTaxonomyDto) =>
      BosTaxonomyMasterService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bosTaxonomyKeys.lists() });
    },
  });
}

// ── useUpdateBosTaxonomy ─────────────────────────────────────────────────────

export function useUpdateBosTaxonomy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosTaxonomyDto }) =>
      BosTaxonomyMasterService.update(id, data),
    onSuccess: (updated: BosTaxonomyWithLevels) => {
      queryClient.setQueryData(bosTaxonomyKeys.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: bosTaxonomyKeys.lists() });
    },
  });
}

// ── useDeleteBosTaxonomy ─────────────────────────────────────────────────────

export function useDeleteBosTaxonomy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => BosTaxonomyMasterService.remove(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: bosTaxonomyKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: bosTaxonomyKeys.lists() });
    },
  });
}
