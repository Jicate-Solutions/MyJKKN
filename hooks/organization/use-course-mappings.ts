import { useState, useCallback, useEffect } from 'react';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import type {
  CourseMapping,
  CourseMappingFilters
} from '@/types/organizations';
import { useAuth } from '../use-auth';
import { usePermissions } from '../use-permissions';

export function useCourseMappings(initialFilters: CourseMappingFilters = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [courseMappings, setCourseMappings] = useState<CourseMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CourseMappingFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchCourseMappings = useCallback(
    async (newFilters?: CourseMappingFilters, isPagination = false) => {
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

        const result = await CourseMappingService.getCourseMappings(
          currentFilters
        );
        setCourseMappings(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('[useCourseMappings] Fetch Error:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred while fetching course mappings.'
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
      fetchCourseMappings();
    }
  }, [authLoading, permissionsLoading, fetchCourseMappings]);

  const updateFilters = useCallback(
    (newFilters: Partial<CourseMappingFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchCourseMappings(updatedFilters);
    },
    [filters, fetchCourseMappings]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchCourseMappings(updatedFilters, true);
    },
    [filters, fetchCourseMappings]
  );

  const changePageSize = useCallback(
    (limit: number) => {
      const updatedFilters = { ...filters, limit, page: 1 };
      setFilters(updatedFilters);
      fetchCourseMappings(updatedFilters, true);
    },
    [filters, fetchCourseMappings]
  );

  return {
    courseMappings,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchCourseMappings
  };
}
