import { Course, CourseFilters } from '@/types/organizations';
import { CourseService } from '@/lib/services/organization/course-service';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';

export function useCourses(filters: CourseFilters) {
  // Memoize the filters object to prevent unnecessary re-renders
  const memoizedFilters = useMemo(() => {
    return {
      page: filters.page,
      limit: filters.limit,
      search: filters.search || '',
      institution_id: filters.institution_id || '',
      isActive: filters.isActive,
      userId: filters.userId,
      bypassInstitutionFilter: filters.bypassInstitutionFilter
    };
  }, [
    filters.page,
    filters.limit,
    filters.search,
    filters.institution_id,
    filters.isActive,
    filters.userId,
    filters.bypassInstitutionFilter
  ]);

  // Memoize the query function to prevent unnecessary re-creation
  const queryFn = useCallback(async () => {
    const { data, metadata } = await CourseService.getCourses(memoizedFilters);
    return { data, metadata };
  }, [memoizedFilters]);

  return useQuery({
    queryKey: ['courses', memoizedFilters],
    queryFn,
    placeholderData: (previousData) => previousData,
    retry: 2,
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000 // Keep in cache for 5 minutes
  });
}
