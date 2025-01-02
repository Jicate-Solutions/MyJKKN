// hooks/use-programs.ts
import { useState, useCallback } from 'react';
import { ProgramService } from '@/lib/services/organization/program-service';
import type { Program, ProgramFilters } from '@/types/organizations';

export function usePrograms(initialFilters: ProgramFilters = {}) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProgramFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchPrograms = useCallback(
    async (newFilters?: ProgramFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await ProgramService.getPrograms(currentFilters);
        setPrograms(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching programs:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<ProgramFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchPrograms(updatedFilters);
    },
    [filters, fetchPrograms]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchPrograms(updatedFilters);
    },
    [filters, fetchPrograms]
  );

  return {
    programs,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchPrograms
  };
}
