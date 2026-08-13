'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/query-keys';
import { getErrorMessage } from '@/lib/utils';
import { CourseEventService } from '@/lib/services/courses/course-event-service';
import type { CourseEventFilters, CreateCourseEventDto, UpdateCourseEventDto } from '@/types/courses';

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

export function useDeleteCourseEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CourseEventService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.lists() });
      toast.success('Course deleted');
    },
    // A course with enrollments is blocked by ON DELETE RESTRICT (23503). Show the
    // real reason rather than a generic failure.
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}
