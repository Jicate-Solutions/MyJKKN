/**
 * React Query hooks for the Course Grades (LTI grades) module.
 *
 * Created: 2026-02-28
 *
 * Hooks:
 *   useCourseGrades            – paginated grade list, re-fetches on any filter/page change
 *   useCourseGradeFilterOptions – dropdown options for the filters panel
 */

import { useQuery } from '@tanstack/react-query';
import {
  CourseGradesService,
  type CourseGradesFilters,
} from '@/lib/services/academic/course-grades-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { QUERY_CONFIG } from '@/lib/config/query-config';

/**
 * Fetches a paginated list of LTI grades.
 *
 * The entire `filters` object (including `page` and `pageSize`) is included in
 * the query key, so React Query automatically re-fetches whenever any filter
 * value — including the current page — changes.
 */
export function useCourseGrades(filters: CourseGradesFilters) {
  return useQuery({
    queryKey: ['course-grades', filters],
    queryFn: () => CourseGradesService.getGrades(filters),
    enabled: !!filters.institutionId,
    ...QUERY_CONFIG.STABLE_DATA, // staleTime: 5 min, refetchOnWindowFocus: false
  });
}

/**
 * Fetches filter-panel dropdown options (tools, programs, semesters, sections).
 *
 * Uses FORM_DATA config — options rarely change, so a 10-minute staleTime is
 * appropriate. The browser Supabase singleton is injected directly here since
 * this hook always runs on the client side.
 */
export function useCourseGradeFilterOptions(institutionId: string | null) {
  const supabase = createClientSupabaseClient();

  return useQuery({
    queryKey: ['course-grade-filters', institutionId],
    queryFn: () => CourseGradesService.getFilterOptions(supabase, institutionId!),
    enabled: !!institutionId,
    ...QUERY_CONFIG.FORM_DATA, // staleTime: 10 min, refetchOnWindowFocus: false
  });
}
