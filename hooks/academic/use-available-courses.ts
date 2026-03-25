'use client';

import { useQuery } from '@tanstack/react-query';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

interface AvailableCourse {
  id: string;
  course_name: string;
  course_code: string;
  mapping_id: string;
}

interface AvailableCourseFilters {
  institutionId: string;
  departmentId: string;
  programId: string;
  semesterId: string;
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const AVAILABLE_COURSES_KEYS = {
  all: ['available-courses'] as const,
  list: (filters: AvailableCourseFilters) =>
    ['available-courses', 'list', filters] as const,
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useAvailableCourses(filters?: AvailableCourseFilters) {
  const enabled =
    !!filters?.institutionId &&
    !!filters?.departmentId &&
    !!filters?.programId &&
    !!filters?.semesterId;

  const query = useQuery<AvailableCourse[]>({
    queryKey: filters
      ? AVAILABLE_COURSES_KEYS.list(filters)
      : AVAILABLE_COURSES_KEYS.all,
    queryFn: () =>
      StaffPlanService.getAvailableCoursesFromMappings(
        filters!.institutionId,
        filters!.departmentId,
        filters!.programId,
        filters!.semesterId
      ),
    enabled,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  return {
    // Backward-compatible names
    courses: query.data ?? [],
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    // React Query extras for consumers that want them
    refetch: query.refetch,
    isLoading: query.isPending,
    isFetching: query.isFetching,
  };
}
