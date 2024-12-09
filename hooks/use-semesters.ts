import { useState, useCallback } from 'react';
import { SemesterService } from '@/lib/services/semester-service';
import type { Semester, SemesterFilters } from '@/types/organizations';

export function useSemesters(initialFilters: SemesterFilters = {}) {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SemesterFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchSemesters = useCallback(
    async (newFilters?: SemesterFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await SemesterService.getSemesters(currentFilters);
        setSemesters(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching semesters:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<SemesterFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchSemesters(updatedFilters);
    },
    [filters, fetchSemesters]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchSemesters(updatedFilters);
    },
    [filters, fetchSemesters]
  );

  return {
    semesters,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchSemesters
  };
}
