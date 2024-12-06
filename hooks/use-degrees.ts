// hooks/use-degrees.ts

import { useState, useCallback } from 'react';
import { DegreeService } from '@/lib/services/degree-service';
import type { Degree, DegreeFilters } from '@/types/organizations';

export function useDegrees(initialFilters: DegreeFilters = {}) {
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DegreeFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchDegrees = useCallback(
    async (newFilters?: DegreeFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await DegreeService.getDegrees(currentFilters);
        setDegrees(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching degrees:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<DegreeFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchDegrees(updatedFilters);
    },
    [filters, fetchDegrees]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchDegrees(updatedFilters);
    },
    [filters, fetchDegrees]
  );

  return {
    degrees,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchDegrees
  };
}
