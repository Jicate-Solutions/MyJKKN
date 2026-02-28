// hooks/academic/use-batches.ts
// Updated: 2026-02-28 — Migrated from useState/useCallback/useEffect to React Query
// Previous: manual fetch with useRef to avoid stale closures + setTimeout hacks

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { BatchService } from '@/lib/services/academic/batch-service';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';
import type {
  Batch,
  BatchFilters,
  CreateBatchDto,
  UpdateBatchDto,
} from '@/types/academics';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const BATCH_KEYS = {
  all: ['batches'] as const,
  list: (filters: BatchFilters) => ['batches', 'list', filters] as const,
} as const;

// ---------------------------------------------------------------------------
// useBatches — paginated list + CRUD mutations (backward-compatible)
//
// Callers destructure (across all files):
//   { batches, loading, createBatch }
//   { batches, loading: loadingBatches }
//   { createBatch }
// All fields are preserved.
// ---------------------------------------------------------------------------
export function useBatches(initialFilters: BatchFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<BatchFilters>(initialFilters);

  // ------------------------------------------------------------------
  // List query
  // ------------------------------------------------------------------
  const query = useQuery({
    queryKey: BATCH_KEYS.list(filters),
    queryFn: () => {
      return isSuperAdmin
        ? BatchService.getBatches(filters)
        : BatchService.getBatchesWithAccess(
            filters,
            userProfile?.institution_id,
            false
          );
    },
    enabled: isSuperAdmin !== undefined,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  const batches: Batch[] = query.data?.data ?? [];
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
  const updateFilters = useCallback((newFilters: Partial<BatchFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const changePage = useCallback((newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  }, []);

  const fetchBatches = useCallback(
    async (newFilters?: BatchFilters) => {
      if (newFilters) {
        setFilters(newFilters);
        await queryClient.invalidateQueries({
          queryKey: BATCH_KEYS.list(newFilters),
        });
      } else {
        await query.refetch();
      }
    },
    [query, queryClient]
  );

  // ------------------------------------------------------------------
  // Mutations — keep the same async function signatures callers expect
  // ------------------------------------------------------------------
  const createMutation = useMutation({
    mutationFn: (data: CreateBatchDto) => BatchService.createBatch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BATCH_KEYS.all });
      toast.success('Batch created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create batch');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBatchDto }) =>
      BatchService.updateBatch(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BATCH_KEYS.all });
      toast.success('Batch updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update batch');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => BatchService.deleteBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BATCH_KEYS.all });
      toast.success('Batch deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete batch');
    },
  });

  // Wrap mutations in the same async throw-on-error shape the old hook used
  const createBatch = useCallback(
    async (data: CreateBatchDto) => {
      await createMutation.mutateAsync(data);
    },
    [createMutation]
  );

  const updateBatch = useCallback(
    async (id: string, data: UpdateBatchDto) => {
      await updateMutation.mutateAsync({ id, data });
    },
    [updateMutation]
  );

  const deleteBatch = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return {
    batches,
    loading: query.isLoading || query.isFetching || isMutating,
    error: query.error ? (query.error as Error).message : null,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchBatches,
    createBatch,
    updateBatch,
    deleteBatch,
  };
}
