import { useState, useCallback } from 'react';
import { CourseService } from '@/lib/services/organization/course-service';
import type { Course, CourseFilters } from '@/types/organizations';

export function useCourses(initialFilters: CourseFilters = {}) {
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
      try {
        if (isPagination) {
          setPaginationLoading(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await CourseService.getCourses(currentFilters);
        setCourses(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching courses:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        if (isPagination) {
          setPaginationLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filters]
  );

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
