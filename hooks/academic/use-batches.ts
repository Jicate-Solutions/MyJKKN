import { useState, useCallback, useEffect, useRef } from 'react';
import { BatchService } from '@/lib/services/academic/batch-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  Batch,
  BatchFilters,
  CreateBatchDto,
  UpdateBatchDto
} from '@/types/academics';

export function useBatches(initialFilters: BatchFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BatchFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  // Use ref to track the current filters to avoid stale closure issues
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchBatches = useCallback(
    async (newFilters?: BatchFilters) => {
      try {
        setLoading(true);
        setError(null);
        // Use the passed filters or the current filters from ref
        const currentFilters = newFilters || filtersRef.current;

        // Use institution-aware method if user is not super admin
        const result = isSuperAdmin
          ? await BatchService.getBatches(currentFilters)
          : await BatchService.getBatchesWithAccess(
              currentFilters,
              userProfile?.institution_id,
              false
            );
        setBatches(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching batches:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [isSuperAdmin, userProfile?.institution_id]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<BatchFilters>) => {
      setFilters((currentFilters) => {
        const updatedFilters = {
          ...currentFilters,
          ...newFilters,
          page: 1 // Reset to first page when filters change
        };
        // Use setTimeout to break the synchronous update cycle
        setTimeout(() => {
          fetchBatches(updatedFilters);
        }, 0);
        return updatedFilters;
      });
    },
    [fetchBatches]
  );

  const changePage = useCallback(
    (page: number) => {
      setFilters((currentFilters) => {
        const updatedFilters = { ...currentFilters, page };
        // Use setTimeout to break the synchronous update cycle
        setTimeout(() => {
          fetchBatches(updatedFilters);
        }, 0);
        return updatedFilters;
      });
    },
    [fetchBatches]
  );

  // Update filtersRef when initialFilters change
  useEffect(() => {
    if (JSON.stringify(initialFilters) !== JSON.stringify(filtersRef.current)) {
      setFilters(initialFilters);
    }
  }, [initialFilters]);

  const createBatch = useCallback(
    async (data: CreateBatchDto) => {
      try {
        setLoading(true);
        setError(null);
        await BatchService.createBatch(data);
        // Refresh batches list
        fetchBatches();
      } catch (err) {
        console.error('Error creating batch:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchBatches]
  );

  const updateBatch = useCallback(
    async (id: string, data: UpdateBatchDto) => {
      try {
        setLoading(true);
        setError(null);
        await BatchService.updateBatch(id, data);
        // Refresh batches list
        fetchBatches();
      } catch (err) {
        console.error('Error updating batch:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchBatches]
  );

  const deleteBatch = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await BatchService.deleteBatch(id);
        // Refresh batches list
        fetchBatches();
      } catch (err) {
        console.error('Error deleting batch:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchBatches]
  );

  return {
    batches,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchBatches,
    createBatch,
    updateBatch,
    deleteBatch
  };
}
