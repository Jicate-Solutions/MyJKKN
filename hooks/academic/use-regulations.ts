import { useState, useCallback, useEffect, useRef } from 'react';
import { RegulationService } from '@/lib/services/academic/regulation-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  Regulation,
  RegulationFilters,
  CreateRegulationDto,
  UpdateRegulationDto
} from '@/types/academics';

export function useRegulations(initialFilters: RegulationFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RegulationFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  // Use ref to track the current filters to avoid stale closure issues
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchRegulations = useCallback(
    async (newFilters?: RegulationFilters) => {
      try {
        setLoading(true);
        setError(null);
        // Use the passed filters or the current filters from ref
        const currentFilters = newFilters || filtersRef.current;

        // Use institution-aware method if user is not super admin
        const result = isSuperAdmin
          ? await RegulationService.getRegulations(currentFilters)
          : await RegulationService.getRegulationsWithAccess(
              currentFilters,
              userProfile?.institution_id,
              false
            );
        setRegulations(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching regulations:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [isSuperAdmin, userProfile?.institution_id]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<RegulationFilters>) => {
      setFilters((currentFilters) => {
        const updatedFilters = {
          ...currentFilters,
          ...newFilters,
          page: 1 // Reset to first page when filters change
        };
        // Use setTimeout to break the synchronous update cycle
        setTimeout(() => {
          fetchRegulations(updatedFilters);
        }, 0);
        return updatedFilters;
      });
    },
    [fetchRegulations]
  );

  const changePage = useCallback(
    (page: number) => {
      setFilters((currentFilters) => {
        const updatedFilters = { ...currentFilters, page };
        // Use setTimeout to break the synchronous update cycle
        setTimeout(() => {
          fetchRegulations(updatedFilters);
        }, 0);
        return updatedFilters;
      });
    },
    [fetchRegulations]
  );

  // Update filtersRef when initialFilters change
  useEffect(() => {
    if (JSON.stringify(initialFilters) !== JSON.stringify(filtersRef.current)) {
      setFilters(initialFilters);
    }
  }, [initialFilters]);

  const createRegulation = useCallback(
    async (data: CreateRegulationDto) => {
      try {
        setLoading(true);
        setError(null);
        await RegulationService.createRegulation(data);
        // Refresh regulations list
        fetchRegulations();
      } catch (err) {
        console.error('Error creating regulation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchRegulations]
  );

  const updateRegulation = useCallback(
    async (id: string, data: UpdateRegulationDto) => {
      try {
        setLoading(true);
        setError(null);
        await RegulationService.updateRegulation(id, data);
        // Refresh regulations list
        fetchRegulations();
      } catch (err) {
        console.error('Error updating regulation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchRegulations]
  );

  const deleteRegulation = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await RegulationService.deleteRegulation(id);
        // Refresh regulations list
        fetchRegulations();
      } catch (err) {
        console.error('Error deleting regulation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchRegulations]
  );

  return {
    regulations,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchRegulations,
    createRegulation,
    updateRegulation,
    deleteRegulation
  };
}
