// hooks/academic/use-academic-years.ts

import { useState, useCallback } from 'react';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import type { AcademicYear, AcademicYearFilters } from '@/types/academics';

export function useAcademicYears(initialFilters: AcademicYearFilters = {}) {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AcademicYearFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchAcademicYears = useCallback(
    async (newFilters?: AcademicYearFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await AcademicYearService.getAcademicYears(
          currentFilters
        );
        setAcademicYears(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching academic years:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<AcademicYearFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchAcademicYears(updatedFilters);
    },
    [filters, fetchAcademicYears]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchAcademicYears(updatedFilters);
    },
    [filters, fetchAcademicYears]
  );

  return {
    academicYears,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchAcademicYears
  };
}
