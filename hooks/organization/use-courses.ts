import { useState, useCallback, useEffect } from 'react';
import { CourseService } from '@/lib/services/organization/course-service';
import type { Course, CourseFilters } from '@/types/organizations';
import { useAuth } from '../use-auth';
import { usePermissions } from '../use-permissions';

export function useCourses(initialFilters: CourseFilters = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CourseFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchCourses = useCallback(
    async (newFilters?: CourseFilters, isPagination = false) => {
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

        const result = await CourseService.getCourses(currentFilters);
        setCourses(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('[useCourses] Fetch Error:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred while fetching courses.'
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
      fetchCourses();
    }
  }, [authLoading, permissionsLoading, fetchCourses]);

  const updateFilters = useCallback(
    (newFilters: Partial<CourseFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchCourses(updatedFilters);
    },
    [filters, fetchCourses]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchCourses(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchCourses]
  );

  const changePageSize = useCallback(
    (limit: number) => {
      const updatedFilters = { ...filters, limit, page: 1 }; // Reset to first page when page size changes
      setFilters(updatedFilters);
      fetchCourses(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchCourses]
  );

  return {
    courses,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchCourses
  };
}
