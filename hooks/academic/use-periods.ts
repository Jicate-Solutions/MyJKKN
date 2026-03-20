// hooks/academic/use-periods.ts
// Updated: 2026-02-28 — Migrated from useState/useCallback/useEffect to React Query
// Previous: manual fetch with useRef to avoid stale closures + setTimeout hacks

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { PeriodService } from '@/lib/services/academic/period-service';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';
import type {
  Period,
  PeriodFilters,
  CreatePeriodDto,
  UpdatePeriodDto,
} from '@/types/academics';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const PERIOD_KEYS = {
  all: ['periods'] as const,
  list: (filters: PeriodFilters) => ['periods', 'list', filters] as const,
} as const;

// ---------------------------------------------------------------------------
// usePeriods — paginated list + CRUD mutations (backward-compatible)
//
// Callers destructure (across all files):
//   { createPeriod }   (periods/new/page.tsx — only needs the mutation)
// All previously exported fields are still present for other potential callers.
// ---------------------------------------------------------------------------
export function usePeriods(initialFilters: PeriodFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<PeriodFilters>(initialFilters);

  // ------------------------------------------------------------------
  // List query
  // ------------------------------------------------------------------
  const query = useQuery({
    queryKey: PERIOD_KEYS.list(filters),
    queryFn: () => {
      return isSuperAdmin
        ? PeriodService.getPeriods(filters)
        : PeriodService.getPeriodsWithAccess(
            filters,
            userProfile?.institution_id,
            false
          );
    },
    enabled: isSuperAdmin !== undefined,
    ...QUERY_CONFIG.STABLE_DATA,
  });

  const periods: Period[] = query.data?.data ?? [];
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
  const updateFilters = useCallback((newFilters: Partial<PeriodFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const changePage = useCallback((newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  }, []);

  const fetchPeriods = useCallback(
    async (newFilters?: PeriodFilters) => {
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
    mutationFn: (data: CreatePeriodDto) => PeriodService.createPeriod(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.all });
      toast.success('Period created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create period');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePeriodDto }) =>
      PeriodService.updatePeriod(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.all });
      toast.success('Period updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update period');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => PeriodService.deletePeriod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.all });
      toast.success('Period deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete period');
    },
  });

  const createPeriod = useCallback(
    async (data: CreatePeriodDto) => {
      await createMutation.mutateAsync(data);
    },
    [createMutation]
  );

  const updatePeriod = useCallback(
    async (id: string, data: UpdatePeriodDto) => {
      await updateMutation.mutateAsync({ id, data });
    },
    [updateMutation]
  );

  const deletePeriod = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return {
    periods,
    loading: query.isLoading || query.isFetching || isMutating,
    error: query.error ? (query.error as Error).message : null,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchPeriods,
    createPeriod,
    updatePeriod,
    deletePeriod,
  };
}
