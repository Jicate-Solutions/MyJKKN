import { useState, useCallback } from 'react';
import { SemesterService } from '@/lib/services/organization/semester-service';
import type { Semester, SemesterFilters } from '@/types/organizations';
import { useAuth } from '../use-auth';
import { usePermissions } from '../use-permissions';

export function useSemesters(initialFilters: SemesterFilters = {}) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SemesterFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchSemesters = useCallback(
    async (newFilters?: SemesterFilters, isPagination = false) => {
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

        const result = await SemesterService.getSemesters(currentFilters);
        setSemesters(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching semesters:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred while fetching semesters.'
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
      fetchSemesters(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchSemesters]
  );

  const changePageSize = useCallback(
    (limit: number) => {
      const updatedFilters = { ...filters, limit, page: 1 }; // Reset to first page when page size changes
      setFilters(updatedFilters);
      fetchSemesters(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchSemesters]
  );

  return {
    semesters,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchSemesters
  };
}
