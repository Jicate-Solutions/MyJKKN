'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/query-keys';
import { getErrorMessage } from '@/lib/utils';
import { CourseEventService } from '@/lib/services/courses/course-event-service';
import type {
  CourseDeleteBlockers, CourseEventFilters, CreateCourseEventDto, UpdateCourseEventDto,
} from '@/types/courses';

export function useCourseEvents(filters: CourseEventFilters) {
  const scoped = Boolean(filters.institution_id) || (filters.institution_ids?.length ?? 0) > 0;
  return useQuery({
    queryKey: queryKeys.courses.list(filters),
    queryFn: () => CourseEventService.list(filters),
    // Without an institution the service throws by design; don't fire the query at all.
    enabled: scoped,
  });
}

export function useCourseEvent(id: string) {
  return useQuery({
    queryKey: queryKeys.courses.detail(id),
    queryFn: () => CourseEventService.getById(id),
    enabled: Boolean(id),
  });
}

export function useCreateCourseEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCourseEventDto) => CourseEventService.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.lists() });
      toast.success('Course created');
    },
    // Supabase errors are plain objects — instanceof Error falls through.
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateCourseEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCourseEventDto }) =>
      CourseEventService.update(id, dto),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.lists() });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(id) });
      toast.success('Course updated');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

/**
 * What a delete would destroy. Fetched lazily — `enabled` is driven by the
 * confirm dialog being open, so the closed dialog on every row of the table
 * costs no request.
 *
 * Not retried: the RPC self-authorizes and throws 42501 for a non-super-admin,
 * which is a verdict, not a transient failure. staleTime 0 because the counts
 * must reflect the moment of the decision, not a cached earlier state.
 */
export function useCourseDeleteBlockers(id: string | null, enabled: boolean) {
  return useQuery<CourseDeleteBlockers>({
    queryKey: queryKeys.courses.deleteBlockers(id ?? ''),
    queryFn: () => CourseEventService.getDeleteBlockers(id as string),
    enabled: Boolean(id) && enabled,
    retry: false,
    staleTime: 0,
  });
}

export function useDeleteCourseEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CourseEventService.remove(id),
    onSuccess: (result, id) => {
      // Drop this course's own cached queries outright — they can never be
      // valid again, and leaving the blockers entry behind would let a stale
      // count render if an id were somehow reused.
      qc.removeQueries({ queryKey: queryKeys.courses.detail(id) });
      qc.removeQueries({ queryKey: queryKeys.courses.deleteBlockers(id) });
      // Invalidate courses.all, not lists() — mirrors useDeleteEvent's fix
      // (hooks/events/use-general-events.ts:163-169). /courses fetches via
      // DataTable's fetchDataFn, so it never registers a ['courses','list']
      // query; narrowing to lists() would match nothing in the cache and fire
      // no invalidate event. .all also covers any future page holding a
      // cached courses query. The list page additionally carries its own
      // tick counter (app/(routes)/courses/page.tsx) since this module has
      // no always-cached query to guarantee the bridge fires.
      qc.invalidateQueries({ queryKey: queryKeys.courses.all });

      // The cascade emptied four sibling caches keyed off their own roots, not
      // under ['courses'] — invalidating courses.all alone would leave a detail
      // page that is still mounted rendering packages and sessions belonging to
      // a course that no longer exists.
      qc.invalidateQueries({ queryKey: queryKeys.coursePackages.all });
      qc.invalidateQueries({ queryKey: queryKeys.courseSessions.all });
      qc.invalidateQueries({ queryKey: queryKeys.courseForms.all });
      qc.invalidateQueries({ queryKey: queryKeys.courseApplications.all });

      // Name what actually went. The RPC returns real counts, and after a
      // cascade that can destroy receipts a bare "Course deleted" understates it.
      const d = result?.deleted;
      const removed = d
        ? [
            d.enrollments && `${d.enrollments} enrollment(s)`,
            d.bills && `${d.bills} bill(s)`,
            d.payments && `${d.payments} payment(s)`,
          ].filter(Boolean).join(', ')
        : '';
      toast.success(
        removed ? `Course deleted — also removed ${removed}` : 'Course deleted'
      );
    },
    // 42501 here means the caller is not a super admin. Surface the real reason
    // rather than a generic failure.
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}
