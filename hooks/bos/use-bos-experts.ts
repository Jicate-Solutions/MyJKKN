// hooks/bos/use-bos-experts.ts
// React Query hooks for BoS External Expert Directory

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import {
  BosExternalExpert,
  BosExpertFilters,
  BosListResponse,
  CreateBosExpertDto,
  UpdateBosExpertDto,
} from '@/types/bos';
import { BosExpertService } from '@/lib/services/bos/bos-expert-service';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ── Query Key Factory ────────────────────────────────────────────────────────
// Structured keys enable precise, scoped cache invalidation.
// e.g., invalidating bosExpertKeys.lists() clears all list queries
// without touching individual detail caches.

export const bosExpertKeys = {
  all: ['bos-experts'] as const,
  lists: () => [...bosExpertKeys.all, 'list'] as const,
  list: (filters: BosExpertFilters) => [...bosExpertKeys.lists(), filters] as const,
  details: () => [...bosExpertKeys.all, 'detail'] as const,
  detail: (id: string) => [...bosExpertKeys.details(), id] as const,
};

// ── useBoSExperts ────────────────────────────────────────────────────────────
// Returns a paginated, filtered list of external experts for the institution.
// The institution_id is automatically scoped from the authenticated user's profile.

export function useBosExperts(
  filters: BosExpertFilters = {}
): UseQueryResult<BosListResponse<BosExternalExpert>, Error> {
  const { profile } = useAuth();

  const scopedFilters: BosExpertFilters = {
    ...filters,
    institutionsId: profile?.institution_id ?? filters.institutionsId,
  };

  return useQuery({
    queryKey: bosExpertKeys.list(scopedFilters),
    queryFn: () => BosExpertService.getExperts(scopedFilters),
    enabled: !!profile?.institution_id,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ── useBosExpert ─────────────────────────────────────────────────────────────
// Fetches a single expert by ID — used in detail view and edit form prefill.

export function useBosExpert(id: string | undefined) {
  return useQuery({
    queryKey: bosExpertKeys.detail(id ?? ''),
    queryFn: () => BosExpertService.getExpert(id!),
    enabled: !!id,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

// ── useCreateBosExpert ────────────────────────────────────────────────────────

export function useCreateBosExpert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBosExpertDto) => BosExpertService.createExpert(data),
    onSuccess: () => {
      // Invalidate all list queries so the new expert appears immediately
      queryClient.invalidateQueries({ queryKey: bosExpertKeys.lists() });
    },
  });
}

// ── useUpdateBosExpert ────────────────────────────────────────────────────────

export function useUpdateBosExpert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosExpertDto }) =>
      BosExpertService.updateExpert(id, data),
    onSuccess: (updatedExpert) => {
      // Update the detail cache immediately (optimistic-like behaviour)
      queryClient.setQueryData(
        bosExpertKeys.detail(updatedExpert.id),
        updatedExpert
      );
      // Invalidate lists to reflect updated values in table rows
      queryClient.invalidateQueries({ queryKey: bosExpertKeys.lists() });
    },
  });
}

// ── useDeleteBosExpert ────────────────────────────────────────────────────────

export function useDeleteBosExpert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BosExpertService.deleteExpert(id),
    onSuccess: (_data, id) => {
      // Remove the detail cache entry for the deleted expert
      queryClient.removeQueries({ queryKey: bosExpertKeys.detail(id) });
      // Refresh the list
      queryClient.invalidateQueries({ queryKey: bosExpertKeys.lists() });
    },
  });
}
