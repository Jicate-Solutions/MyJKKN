import { useState, useCallback } from 'react';
import { PeriodService } from '@/lib/services/academic/period-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  Period,
  PeriodFilters,
  CreatePeriodDto,
  UpdatePeriodDto
} from '@/types/academics';

export function usePeriods(initialFilters: PeriodFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
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

        // Use institution-aware method if user is not super admin
        const result = isSuperAdmin
          ? await PeriodService.getPeriods(currentFilters)
          : await PeriodService.getPeriodsWithAccess(
              currentFilters,
              userProfile?.institution_id,
              false
            );
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
    [filters, isSuperAdmin, userProfile?.institution_id]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<PeriodFilters>) => {
      setFilters((currentFilters) => {
        const updatedFilters = {
          ...currentFilters,
          ...newFilters,
          page: 1 // Reset to first page when filters change
        };
        fetchPeriods(updatedFilters);
        return updatedFilters;
      });
    },
    [fetchPeriods]
  );

  const changePage = useCallback(
    (page: number) => {
      setFilters((currentFilters) => {
        const updatedFilters = { ...currentFilters, page };
        fetchPeriods(updatedFilters);
        return updatedFilters;
      });
    },
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
