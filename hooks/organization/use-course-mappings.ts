import { useState, useCallback } from 'react';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import type {
  CourseMapping,
  CourseMappingFilters
} from '@/types/organizations';

export function useCourseMappings(initialFilters: CourseMappingFilters = {}) {
  const [courseMappings, setCourseMappings] = useState<CourseMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CourseMappingFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchCourseMappings = useCallback(
    async (newFilters?: CourseMappingFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await CourseMappingService.getCourseMappings(
          currentFilters
        );
        setCourseMappings(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching course mappings:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

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
      fetchCourseMappings(updatedFilters);
    },
    [filters, fetchCourseMappings]
  );

  return {
    courseMappings,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCourseMappings
  };
}
