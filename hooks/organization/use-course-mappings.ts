import { useQuery } from '@tanstack/react-query';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import type { CourseMappingFilters } from '@/types/organizations';
import { useMemo, useCallback } from 'react';

// Query key factory for better cache management
export const courseMappingKeys = {
  all: ['course-mappings'] as const,
  lists: () => [...courseMappingKeys.all, 'list'] as const,
  list: (filters: CourseMappingFilters) =>
    [...courseMappingKeys.lists(), filters] as const,
  details: () => [...courseMappingKeys.all, 'detail'] as const,
  detail: (id: string) => [...courseMappingKeys.details(), id] as const,
  stats: () => [...courseMappingKeys.all, 'stats'] as const
} as const;

export function useCourseMappings(filters: CourseMappingFilters) {
  // Memoize the filters object to prevent unnecessary re-renders
  const memoizedFilters = useMemo(() => {
    return {
      page: filters.page,
      limit: filters.limit,
      search: filters.search || '',
      institution_id: filters.institution_id || '',
      degree_id: filters.degree_id,
      department_id: filters.department_id,
      program_id: filters.program_id,
      semester_id: filters.semester_id,
      isActive: filters.isActive
    };
  }, [
    filters.page,
    filters.limit,
    filters.search,
    filters.institution_id,
    filters.degree_id,
    filters.department_id,
    filters.program_id,
    filters.semester_id,
    filters.isActive
  ]);

  // Memoize the query function to prevent unnecessary re-creation
  const queryFn = useCallback(async () => {
    const { data, metadata } = await CourseMappingService.getCourseMappings(
      memoizedFilters
    );
    return { data, metadata };
  }, [memoizedFilters]);

  return useQuery({
    queryKey: courseMappingKeys.list(memoizedFilters),
    queryFn,
    placeholderData: (previousData) => previousData,
    retry: 2,
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000 // Keep in cache for 5 minutes
  });
}

export function useCourseMappingDetail(id: string) {
  return useQuery({
    queryKey: courseMappingKeys.detail(id),
    queryFn: () => CourseMappingService.getCourseMapping(id),
    retry: false,
    staleTime: 5 * 60 * 1000 // Consider fresh for 5 minutes
  });
}
