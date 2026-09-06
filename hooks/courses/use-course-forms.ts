'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/query-keys';
import { getErrorMessage } from '@/lib/utils';
import { CourseFormService } from '@/lib/services/courses/course-form-service';
import type { SaveCourseFormDto } from '@/types/courses';

/**
 * Supabase errors are plain objects, not Error instances, so `instanceof Error`
 * always falls through — that is what getErrorMessage() is for. The SQLSTATE is
 * on `.code` beside `.message`.
 *
 * Only 23505 is rewritten. The RPC's own 42501 messages already name the form and
 * the missing permission, and a friendlier version would lose the only detail
 * that makes them actionable.
 */
function formError(e: unknown): string {
  const raw = getErrorMessage(e);
  const code = (e as { code?: string } | null)?.code;

  // Two different uniques are reachable: (course_event_id, slug) on the form and
  // (form_id, field_key) on its fields. The message names the constraint, so
  // point at the right one rather than guessing.
  if (code === '23505') {
    if (/field_key|fields_key_uniq/i.test(raw)) {
      return `Two fields share the same key. Every field key must be unique within a form. ${raw}`;
    }
    return `This course already has a form with that URL. ${raw}`;
  }

  return raw;
}

export function useCourseForms(courseEventId: string) {
  return useQuery({
    queryKey: queryKeys.courseForms.list(courseEventId),
    queryFn: () => CourseFormService.listByCourse(courseEventId),
    enabled: Boolean(courseEventId),
  });
}

export function useCourseForm(id: string) {
  return useQuery({
    queryKey: queryKeys.courseForms.detail(id),
    queryFn: () => CourseFormService.getById(id),
    enabled: Boolean(id),
  });
}

/** Create and edit share one hook because they share one write path — the RPC
 *  branches on whether the payload carries an id. */
export function useSaveCourseForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SaveCourseFormDto) => CourseFormService.save(dto),
    onSuccess: (result, dto) => {
      qc.invalidateQueries({ queryKey: queryKeys.courseForms.lists() });
      qc.invalidateQueries({ queryKey: queryKeys.courseForms.detail(result.form_id) });
      toast.success(
        dto.form.id
          ? `Form saved — ${result.field_count} field${result.field_count === 1 ? '' : 's'}`
          : 'Form created. It is not accepting applications until you enable it.',
      );
    },
    onError: (e) => toast.error(formError(e)),
  });
}

/**
 * Enabling is the switch that makes a form publicly reachable, so the toast says
 * so in those words rather than a neutral "updated". An admin flipping this needs
 * to know a stranger can now submit through it.
 */
export function useSetCourseFormEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      CourseFormService.setEnabled(id, enabled),
    onSuccess: (result, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.courseForms.lists() });
      qc.invalidateQueries({ queryKey: queryKeys.courseForms.detail(id) });
      toast.success(
        result.is_enabled
          ? 'Form is live — anyone with the link can now apply'
          : 'Form closed — it no longer accepts applications',
      );
    },
    onError: (e) => toast.error(formError(e)),
  });
}

export function useDeleteCourseForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CourseFormService.remove(id),
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.courseForms.lists() });
      // The row is gone — drop its detail cache rather than marking it stale and
      // inviting a refetch that can only 404.
      qc.removeQueries({ queryKey: queryKeys.courseForms.detail(id) });
      toast.success('Form deleted');
    },
    onError: (e) => toast.error(formError(e)),
  });
}
