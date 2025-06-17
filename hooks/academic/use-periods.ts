import { useState, useCallback } from 'react';
import { PeriodService } from '@/lib/services/academic/period-service';
import type {
  Period,
  PeriodFilters,
  CreatePeriodDto,
  UpdatePeriodDto
} from '@/types/academics';

export function usePeriods(initialFilters: PeriodFilters = {}) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PeriodFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchPeriods = useCallback(
    async (newFilters?: PeriodFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await PeriodService.getPeriods(currentFilters);
        setPeriods(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching periods:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateFilters = useCallback(
    (newFilters: Partial<PeriodFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchPeriods(updatedFilters);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchPeriods]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchPeriods(updatedFilters);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchPeriods]
  );

  const createPeriod = useCallback(
    async (data: CreatePeriodDto) => {
      try {
        setLoading(true);
        setError(null);
        await PeriodService.createPeriod(data);
        // Refresh periods list
        fetchPeriods();
      } catch (err) {
        console.error('Error creating period:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchPeriods]
  );

  const updatePeriod = useCallback(
    async (id: string, data: UpdatePeriodDto) => {
      try {
        setLoading(true);
        setError(null);
        await PeriodService.updatePeriod(id, data);
        // Refresh periods list
        fetchPeriods();
      } catch (err) {
        console.error('Error updating period:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchPeriods]
  );

  const deletePeriod = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await PeriodService.deletePeriod(id);
        // Refresh periods list
        fetchPeriods();
      } catch (err) {
        console.error('Error deleting period:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchPeriods]
  );

  return {
    periods,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchPeriods,
    createPeriod,
    updatePeriod,
    deletePeriod
  };
}
