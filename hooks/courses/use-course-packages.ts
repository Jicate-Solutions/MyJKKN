'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/query-keys';
import { getErrorMessage } from '@/lib/utils';
import { CoursePackageService } from '@/lib/services/courses/course-package-service';
import type { SaveCoursePackageDto } from '@/types/courses';

/**
 * Supabase errors are plain objects, not Error instances, so `instanceof Error`
 * always falls through — that is what getErrorMessage() is for. The SQLSTATE
 * sits on `.code` next to `.message`.
 *
 * Only the two codes a user can actually provoke from this form are rewritten.
 * The RPC's own 42501 messages already name the package and the permission that
 * is missing, and replacing those with something friendlier would throw away the
 * only detail that makes them actionable.
 */
function packageError(e: unknown): string {
  const raw = getErrorMessage(e);
  const code = (e as { code?: string } | null)?.code;

  if (code === '23514') {
    // Several different 23514s are reachable from this form. The deferred sum
    // trigger writes its own plain English AND quotes the real sum against the
    // real price, so it is passed straight through rather than replaced by a
    // vaguer sentence. The ordinary CHECK constraints (seat_cap > 0, amount > 0,
    // total_amount >= 0, the sale window) surface as bare constraint names, so
    // those get a lead-in that says what kind of problem it is.
    return /add up to the price/i.test(raw)
      ? raw
      : `That package could not be saved — one of its values is out of range. ${raw}`;
  }

  // UNIQUE (course_event_id, name).
  if (code === '23505') {
    return `This course already has a package with that name. ${raw}`;
  }

  return raw;
}

export function useCoursePackages(courseEventId: string) {
  return useQuery({
    queryKey: queryKeys.coursePackages.list(courseEventId),
    queryFn: () => CoursePackageService.listByCourse(courseEventId),
    enabled: Boolean(courseEventId),
  });
}

export function useCoursePackage(id: string) {
  return useQuery({
    queryKey: queryKeys.coursePackages.detail(id),
    queryFn: () => CoursePackageService.getById(id),
    enabled: Boolean(id),
  });
}

/** Create and edit are the same call — fn_save_course_package branches on
 *  whether the payload carries an id. There is no separate create hook because
 *  there is no separate write path. */
export function useSaveCoursePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SaveCoursePackageDto) => CoursePackageService.save(dto),
    onSuccess: (result, dto) => {
      qc.invalidateQueries({ queryKey: queryKeys.coursePackages.lists() });
      qc.invalidateQueries({ queryKey: queryKeys.coursePackages.detail(result.package_id) });
      toast.success(dto.package.id ? 'Package updated' : 'Package created');
    },
    onError: (e) => toast.error(packageError(e)),
  });
}

export function useDeleteCoursePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CoursePackageService.remove(id),
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.coursePackages.lists() });
      // The row is gone, so drop its detail cache outright rather than marking
      // it stale and inviting a refetch that can only 404.
      qc.removeQueries({ queryKey: queryKeys.coursePackages.detail(id) });
      toast.success('Package deleted');
    },
    onError: (e) => toast.error(packageError(e)),
  });
}
