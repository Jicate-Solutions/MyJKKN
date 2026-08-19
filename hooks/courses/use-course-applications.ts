'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { CourseApplicationService } from '@/lib/services/courses/course-application-service';
import type { CourseApplicationFilters } from '@/types/courses';

/**
 * Read-only, so there are no mutation hooks here and nothing to invalidate.
 * Approving an application is a transaction that provisions an identity, and it
 * will arrive as one RPC — see the note at the top of course-application-service.
 */

export function useCourseApplications(
  courseEventId: string,
  filters: CourseApplicationFilters = {},
) {
  return useQuery({
    queryKey: queryKeys.courseApplications.list(courseEventId, filters),
    queryFn: () => CourseApplicationService.listByCourse(courseEventId, filters),
    enabled: Boolean(courseEventId),
  });
}

/** Unfiltered per-status counts. Separate query from the list precisely BECAUSE
 *  it must not move when the list's filters change. */
export function useCourseApplicationCounts(courseEventId: string) {
  return useQuery({
    queryKey: queryKeys.courseApplications.counts(courseEventId),
    queryFn: () => CourseApplicationService.countsByCourse(courseEventId),
    enabled: Boolean(courseEventId),
  });
}

export function useCourseApplication(id: string) {
  return useQuery({
    queryKey: queryKeys.courseApplications.detail(id),
    queryFn: () => CourseApplicationService.getById(id),
    enabled: Boolean(id),
  });
}
