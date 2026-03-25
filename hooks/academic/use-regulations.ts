// hooks/academic/use-regulations.ts
// Updated: 2026-02-28 — Migrated from useState/useCallback/useEffect to React Query
// Previous: manual fetch with useRef to avoid stale closures + setTimeout hacks

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { RegulationService } from '@/lib/services/academic/regulation-service';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';
import type {
  Regulation,
  RegulationFilters,
  CreateRegulationDto,
  UpdateRegulationDto,
} from '@/types/academics';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const REGULATION_KEYS = {
  all: ['regulations'] as const,
  list: (filters: RegulationFilters) => ['regulations', 'list', filters] as const,
} as const;

// ---------------------------------------------------------------------------
// useRegulations — paginated list + CRUD mutations (backward-compatible)
//
// Callers destructure (across all files):
//   { regulations, loading: loadingRegulations, createRegulation }
//   { createRegulation }   (regulations/new/page.tsx)
// All previously exported fields are still present.
// ---------------------------------------------------------------------------
export function useRegulations(initialFilters: RegulationFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<RegulationFilters>(initialFilters);

  // ------------------------------------------------------------------
  // List query
  // ------------------------------------------------------------------
  const query = useQuery({
    queryKey: REGULATION_KEYS.list(filters),
    queryFn: () => {
      return isSuperAdmin
        ? RegulationService.getRegulations(filters)
        : RegulationService.getRegulationsWithAccess(
            filters,
            userProfile?.institution_id,
            false
          );
    },
    enabled: isSuperAdmin !== undefined,
    ...QUERY_CONFIG.STABLE_DATA,
  });

  const regulations: Regulation[] = query.data?.data ?? [];
  const rawMeta = query.data?.metadata;
  const metadata = {
    total: rawMeta?.total ?? 0,
    page: filters.page ?? 1,
    limit: filters.limit ?? 10,
    totalPages: Math.ceil((rawMeta?.total ?? 0) / (filters.limit ?? 10)),
  };

  // ------------------------------------------------------------------
  // Filter helpers
  // ------------------------------------------------------------------
  const updateFilters = useCallback((newFilters: Partial<RegulationFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const changePage = useCallback((newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  }, []);

  const fetchRegulations = useCallback(
    async (newFilters?: RegulationFilters) => {
      if (newFilters) {
        setFilters(newFilters);
        // setFilters triggers a re-render; useQuery picks up the new key and fetches automatically.
      } else {
        await query.refetch();
      }
    },
    [query]
  );

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------
  const createMutation = useMutation({
    mutationFn: (data: CreateRegulationDto) =>
      RegulationService.createRegulation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATION_KEYS.all });
      toast.success('Regulation created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create regulation');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRegulationDto }) =>
      RegulationService.updateRegulation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATION_KEYS.all });
      toast.success('Regulation updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update regulation');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => RegulationService.deleteRegulation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGULATION_KEYS.all });
      toast.success('Regulation deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete regulation');
    },
  });

  const createRegulation = useCallback(
    async (data: CreateRegulationDto) => {
      await createMutation.mutateAsync(data);
    },
    [createMutation]
  );

  const updateRegulation = useCallback(
    async (id: string, data: UpdateRegulationDto) => {
      await updateMutation.mutateAsync({ id, data });
    },
    [updateMutation]
  );

  const deleteRegulation = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return {
    regulations,
    loading: query.isLoading || query.isFetching || isMutating,
    error: query.error ? (query.error as Error).message : null,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchRegulations,
    createRegulation,
    updateRegulation,
    deleteRegulation,
  };
}
