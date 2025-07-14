// hooks/use-programs.ts
import { useState, useCallback, useEffect } from 'react';
import { ProgramService } from '@/lib/services/organization/program-service';
import type { Program, ProgramFilters } from '@/types/organizations';
import { useAuth } from '../use-auth';
import { usePermissions } from '../use-permissions';

export function usePrograms(initialFilters: ProgramFilters = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProgramFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchPrograms = useCallback(
    async (newFilters?: ProgramFilters, isPagination = false) => {
      if (authLoading || permissionsLoading) return;

      try {
        if (isPagination) {
          setPaginationLoading(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const currentFilters = {
          ...(newFilters || filters),
          userId: user?.id,
          bypassInstitutionFilter: isSuperAdmin
        };

        const result = await ProgramService.getPrograms(currentFilters);
        setPrograms(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('[usePrograms] Fetch Error:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred while fetching programs.'
        );
      } finally {
        if (isPagination) {
          setPaginationLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filters, user?.id, isSuperAdmin, authLoading, permissionsLoading]
  );

  useEffect(() => {
    if (!authLoading && !permissionsLoading) {
      fetchPrograms();
    }
  }, [authLoading, permissionsLoading, fetchPrograms]);

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
      fetchPrograms(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchPrograms]
  );

  const changePageSize = useCallback(
    (limit: number) => {
      const updatedFilters = { ...filters, limit, page: 1 }; // Reset to first page when page size changes
      setFilters(updatedFilters);
      fetchPrograms(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchPrograms]
  );

  return {
    programs,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchPrograms
  };
}
