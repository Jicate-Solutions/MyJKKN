'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/query-keys';
import { CourseApplicationService } from '@/lib/services/courses/course-application-service';
import { getErrorMessage } from '@/lib/utils';
import type {
  CourseApplicationFilters,
  CourseApprovalResult,
  CourseCredentialsResult,
} from '@/types/courses';

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

/**
 * Both decisions invalidate the same three things: the list (the row's status
 * moved), the counts (a status total changed), and — for an approval — the
 * course's enrollments, which did not exist a moment ago.
 *
 * Deliberately NOT wrapped in a toast here for approve. The result carries a
 * JKKN ID and a one-time password that the caller must render properly; a toast
 * that vanishes after four seconds is the wrong surface for a credential.
 */
function useInvalidateApplications() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.courseApplications.all });
    qc.invalidateQueries({ queryKey: queryKeys.courses.all });
  };
}

export function useApproveCourseApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation<
    CourseApprovalResult,
    unknown,
    {
      applicationId: string;
      email: string;
      packageId?: string | null;
      decisionNote?: string | null;
    }
  >({
    mutationFn: ({ applicationId, ...input }) =>
      CourseApplicationService.approve(applicationId, input),
    onSuccess: invalidate,
    // The route forwards the RPC's own RAISE message, which names the real
    // problem — a package with no instalments, an application already decided,
    // a person already enrolled. Replacing it with something generic would
    // throw away the only actionable part.
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useRejectCourseApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: ({
      applicationId,
      decisionNote,
    }: {
      applicationId: string;
      decisionNote?: string | null;
    }) => CourseApplicationService.reject(applicationId, decisionNote),
    onSuccess: () => {
      invalidate();
      toast.success('Application rejected');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

/**
 * Reissue a participant's sign-in details.
 *
 * No invalidation: nothing in any cached list changes — the password lives in
 * auth.users and the result is shown once, in the dialog, then discarded.
 */
export function useResendCourseCredentials() {
  return useMutation<
    CourseCredentialsResult,
    unknown,
    { enrollmentId: string; email?: string | null }
  >({
    mutationFn: ({ enrollmentId, email }) =>
      CourseApplicationService.resendCredentials(enrollmentId, email),
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}
