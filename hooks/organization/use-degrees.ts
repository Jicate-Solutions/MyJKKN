// hooks/use-degrees.ts

import { useState, useCallback } from 'react';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import type { Degree, DegreeFilters } from '@/types/organizations';

export function useDegrees(initialFilters: DegreeFilters = {}) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DegreeFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchDegrees = useCallback(
    async (newFilters?: DegreeFilters, isPagination = false) => {
      try {
        if (isPagination) {
          setPaginationLoading(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const currentFilters = {
          ...(newFilters || filters),
          userId: profile?.id,
          bypassInstitutionFilter: isSuperAdmin
        };

        const result = await DegreeService.getDegrees(currentFilters);
        setDegrees(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching degrees:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred while fetching degrees.'
        );
      } finally {
        if (isPagination) {
          setPaginationLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filters, profile?.id, isSuperAdmin]
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
      fetchDegrees(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchDegrees]
  );

  const changePageSize = useCallback(
    (limit: number) => {
      const updatedFilters = { ...filters, limit, page: 1 }; // Reset to first page when page size changes
      setFilters(updatedFilters);
      fetchDegrees(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchDegrees]
  );

  return {
    degrees,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchDegrees
  };
}
