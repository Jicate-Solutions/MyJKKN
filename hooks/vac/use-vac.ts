// hooks/vac/use-vac.ts
// React Query hooks for the VAC (Value-Added Courses) module
// Covers: Courses, Lessons, Enrollments, Progress, Recommendations, Analytics, Programme Mapping

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { VACService } from '@/lib/services/vac/vac-service';
import type {
  VACCourseFilters,
  VACEnrollmentFilters,
  CreateVACCourseInput,
  UpdateVACCourseInput,
  CreateVACLessonInput,
  UpdateVACLessonInput,
  CreateVACEnrollmentInput,
} from '@/types/vac';

// ═══════════════════════════════════════════════════════════════════════════════
// Query Keys
// ═══════════════════════════════════════════════════════════════════════════════

export const vacKeys = {
  all: ['vac'] as const,
  courses: (filters?: VACCourseFilters) =>
    [...vacKeys.all, 'courses', filters] as const,
  course: (id: string) => [...vacKeys.all, 'course', id] as const,
  lessons: (courseId: string) =>
    [...vacKeys.all, 'lessons', courseId] as const,
  lesson: (id: string) => [...vacKeys.all, 'lesson', id] as const,
  myEnrollments: (userId: string) =>
    [...vacKeys.all, 'my-enrollments', userId] as const,
  enrollments: (filters?: VACEnrollmentFilters) =>
    [...vacKeys.all, 'enrollments', filters] as const,
  isEnrolled: (userId: string, courseId: string) =>
    [...vacKeys.all, 'is-enrolled', userId, courseId] as const,
  progress: (userId: string, courseId: string) =>
    [...vacKeys.all, 'progress', userId, courseId] as const,
  completionPct: (userId: string, courseId: string) =>
    [...vacKeys.all, 'completion-pct', userId, courseId] as const,
  recommended: (programmeId: string, institutionId: string) =>
    [...vacKeys.all, 'recommended', programmeId, institutionId] as const,
  overviewStats: (institutionId: string) =>
    [...vacKeys.all, 'overview-stats', institutionId] as const,
  courseStats: (institutionId: string) =>
    [...vacKeys.all, 'course-stats', institutionId] as const,
  trends: (institutionId: string) =>
    [...vacKeys.all, 'trends', institutionId] as const,
  programmeStats: (institutionId: string) =>
    [...vacKeys.all, 'programme-stats', institutionId] as const,
  courseProgrammes: (courseId: string) =>
    [...vacKeys.all, 'course-programmes', courseId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COURSE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch paginated, filterable list of VAC courses.
 * staleTime: 5 min — catalog rarely changes mid-session.
 */
export function useVACCourses(filters?: VACCourseFilters) {
  return useQuery({
    queryKey: vacKeys.courses(filters),
    queryFn: () => VACService.getCourses(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch a single VAC course by ID.
 */
export function useVACCourse(id: string) {
  return useQuery({
    queryKey: vacKeys.course(id),
    queryFn: () => VACService.getCourseById(id),
    enabled: !!id,
  });
}

/**
 * Create a new VAC course (with optional programme mapping).
 * Invalidates the course list on success.
 */
export function useCreateVACCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateVACCourseInput) =>
      VACService.createCourse(input),
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: vacKeys.courses() });
      toast.success(`Course "${course.name}" created`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create course');
    },
  });
}

/**
 * Update an existing VAC course.
 * Invalidates both the course list and the specific course detail cache.
 */
export function useUpdateVACCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateVACCourseInput & { id: string }) =>
      VACService.updateCourse(id, input),
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: vacKeys.courses() });
      queryClient.invalidateQueries({
        queryKey: vacKeys.course(course.id),
      });
      toast.success(`Course "${course.name}" updated`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update course');
    },
  });
}

/**
 * Delete a VAC course.
 * Invalidates the course list on success.
 */
export function useDeleteVACCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => VACService.deleteCourse(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vacKeys.courses() });
      toast.success('Course deleted');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete course');
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LESSON HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all lessons for a specific course, ordered by week then hour.
 */
export function useVACLessons(courseId: string) {
  return useQuery({
    queryKey: vacKeys.lessons(courseId),
    queryFn: () => VACService.getLessonsByCourse(courseId),
    enabled: !!courseId,
  });
}

/**
 * Fetch a single lesson by ID.
 */
export function useVACLesson(id: string) {
  return useQuery({
    queryKey: vacKeys.lesson(id),
    queryFn: () => VACService.getLessonById(id),
    enabled: !!id,
  });
}

/**
 * Create a new lesson in a course.
 * Invalidates the lesson list for the parent course.
 */
export function useCreateVACLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateVACLessonInput) =>
      VACService.createLesson(input),
    onSuccess: (lesson) => {
      queryClient.invalidateQueries({
        queryKey: vacKeys.lessons(lesson.course_id),
      });
      toast.success(`Lesson "${lesson.title}" created`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create lesson');
    },
  });
}

/**
 * Update an existing lesson.
 * courseId is passed so we can invalidate the correct lesson list.
 */
export function useUpdateVACLesson(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateVACLessonInput & { id: string }) =>
      VACService.updateLesson(id, input),
    onSuccess: (lesson) => {
      queryClient.invalidateQueries({
        queryKey: vacKeys.lessons(courseId),
      });
      queryClient.invalidateQueries({
        queryKey: vacKeys.lesson(lesson.id),
      });
      toast.success(`Lesson "${lesson.title}" updated`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update lesson');
    },
  });
}

/**
 * Delete a lesson.
 * courseId is passed so we can invalidate the correct lesson list.
 */
export function useDeleteVACLesson(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => VACService.deleteLesson(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: vacKeys.lessons(courseId),
      });
      toast.success('Lesson deleted');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete lesson');
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENROLLMENT HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enrol the current user in a course.
 * Invalidates my-enrollments and the is-enrolled check for the user+course pair.
 */
export function useEnrollInCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateVACEnrollmentInput) =>
      VACService.enrollInCourse(input),
    onSuccess: (enrollment) => {
      queryClient.invalidateQueries({
        queryKey: vacKeys.myEnrollments(enrollment.user_id),
      });
      queryClient.invalidateQueries({
        queryKey: vacKeys.isEnrolled(
          enrollment.user_id,
          enrollment.course_id
        ),
      });
      queryClient.invalidateQueries({ queryKey: vacKeys.enrollments() });
      toast.success('Enrolled successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to enrol');
    },
  });
}

/**
 * Fetch all enrollments for a specific user with course details.
 */
export function useMyEnrollments(userId: string) {
  return useQuery({
    queryKey: vacKeys.myEnrollments(userId),
    queryFn: () => VACService.getMyEnrollments(userId),
    enabled: !!userId,
  });
}

/**
 * Admin view: paginated list of enrollments with filters and user/course details.
 * staleTime: 30s — enrolments change more frequently than the catalog.
 */
export function useVACEnrollments(filters?: VACEnrollmentFilters) {
  return useQuery({
    queryKey: vacKeys.enrollments(filters),
    queryFn: () => VACService.getEnrollments(filters),
    staleTime: 30_000,
  });
}

/**
 * Quick boolean check: is a given user actively enrolled in a course?
 */
export function useIsEnrolled(userId: string, courseId: string) {
  return useQuery({
    queryKey: vacKeys.isEnrolled(userId, courseId),
    queryFn: () => VACService.isEnrolled(userId, courseId),
    enabled: !!userId && !!courseId,
  });
}

/**
 * Update enrollment status (and optional payment data).
 * Invalidates the admin enrollment list and the specific user's enrollments.
 */
export function useUpdateEnrollmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      paymentData,
    }: {
      id: string;
      status: string;
      userId?: string;
      courseId?: string;
      paymentData?: {
        payment_status?: string;
        payment_date?: string;
        payment_reference?: string;
      };
    }) => VACService.updateEnrollmentStatus(id, status, paymentData),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: vacKeys.enrollments() });
      if (variables.userId) {
        queryClient.invalidateQueries({
          queryKey: vacKeys.myEnrollments(variables.userId),
        });
      }
      if (variables.userId && variables.courseId) {
        queryClient.invalidateQueries({
          queryKey: vacKeys.isEnrolled(
            variables.userId,
            variables.courseId
          ),
        });
      }
      toast.success(`Enrollment status updated to "${variables.status}"`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update enrollment status');
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all progress records for a user in a specific course.
 * staleTime: 30s — progress updates happen frequently during learning.
 */
export function useVACProgress(userId: string, courseId: string) {
  return useQuery({
    queryKey: vacKeys.progress(userId, courseId),
    queryFn: () => VACService.getProgress(userId, courseId),
    enabled: !!userId && !!courseId,
    staleTime: 30_000,
  });
}

/**
 * Mark a lesson as completed and optionally store a score.
 * On success, invalidates progress, completion percentage, and my-enrollments
 * (because auto-completion may change the enrollment status).
 */
export function useMarkLessonComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      courseId,
      lessonId,
      score,
    }: {
      userId: string;
      courseId: string;
      lessonId: string;
      score?: number;
    }) => VACService.markLessonComplete(userId, courseId, lessonId, score),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: vacKeys.progress(variables.userId, variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: vacKeys.completionPct(
          variables.userId,
          variables.courseId
        ),
      });
      queryClient.invalidateQueries({
        queryKey: vacKeys.myEnrollments(variables.userId),
      });
      toast.success('Lesson completed');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to mark lesson as completed');
    },
  });
}

/**
 * Get the completion percentage (0-100) for a user in a course.
 */
export function useCourseCompletionPct(userId: string, courseId: string) {
  return useQuery({
    queryKey: vacKeys.completionPct(userId, courseId),
    queryFn: () =>
      VACService.getCourseCompletionPercentage(userId, courseId),
    enabled: !!userId && !!courseId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECOMMENDATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch up to 10 recommended courses for a programme at an institution.
 * staleTime: 10 min — recommendations are slow-moving.
 */
export function useRecommendedCourses(
  programmeId: string,
  institutionId: string
) {
  return useQuery({
    queryKey: vacKeys.recommended(programmeId, institutionId),
    queryFn: () =>
      VACService.getRecommendedCourses(programmeId, institutionId),
    enabled: !!programmeId && !!institutionId,
    staleTime: 10 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * High-level overview stats for a given institution (course counts,
 * enrollment counts, revenue, avg completion).
 */
export function useVACOverviewStats(institutionId: string) {
  return useQuery({
    queryKey: vacKeys.overviewStats(institutionId),
    queryFn: () => VACService.getOverviewStats(institutionId),
    enabled: !!institutionId,
    staleTime: 60_000,
  });
}

/**
 * Per-course enrollment statistics (via RPC function).
 */
export function useCourseEnrollmentStats(institutionId: string) {
  return useQuery({
    queryKey: vacKeys.courseStats(institutionId),
    queryFn: () => VACService.getCourseEnrollmentStats(institutionId),
    enabled: !!institutionId,
    staleTime: 60_000,
  });
}

/**
 * Monthly enrollment, completion, and revenue trends.
 * Defaults to 12 months of history.
 */
export function useEnrollmentTrends(
  institutionId: string,
  months: number = 12
) {
  return useQuery({
    queryKey: vacKeys.trends(institutionId),
    queryFn: () =>
      VACService.getEnrollmentTrends(institutionId, months),
    enabled: !!institutionId,
    staleTime: 60_000,
  });
}

/**
 * Programme-wise enrollment statistics.
 */
export function useVACProgrammeStats(institutionId: string) {
  return useQuery({
    queryKey: vacKeys.programmeStats(institutionId),
    queryFn: () => VACService.getProgrammeStats(institutionId),
    enabled: !!institutionId,
    staleTime: 60_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAMME MAPPING HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all programme mappings for a course (ordered: primary first).
 */
export function useCourseProgrammes(courseId: string) {
  return useQuery({
    queryKey: vacKeys.courseProgrammes(courseId),
    queryFn: () => VACService.getCourseProgrammes(courseId),
    enabled: !!courseId,
  });
}

/**
 * Replace all programme mappings for a course with a new set.
 * Invalidates the mapping cache and the course detail (since programmes changed).
 */
export function useUpdateCourseProgrammes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      courseId,
      programmeIds,
    }: {
      courseId: string;
      programmeIds: string[];
    }) => VACService.updateCourseProgrammes(courseId, programmeIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: vacKeys.courseProgrammes(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: vacKeys.course(variables.courseId),
      });
      toast.success('Programme mappings updated');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update programme mappings');
    },
  });
}

// ── Bulk Enrollment Hooks ────────────────────────────────────────────

export function useEligibleLearners(
  courseId: string,
  institutionId: string,
  filters: { programme_id?: string; semester_id?: string; section_id?: string }
) {
  return useQuery({
    queryKey: [...vacKeys.all, 'eligible-learners', courseId, institutionId, filters] as const,
    queryFn: () => VACService.getEligibleLearners(courseId, institutionId, filters),
    enabled: !!courseId && !!institutionId,
    staleTime: 30_000,
  });
}

export function useBulkEnroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { course_id: string; user_ids: string[]; waive_fee: boolean }) =>
      VACService.bulkEnroll(input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: vacKeys.all });
      if (result.enrolled_count > 0) {
        toast.success(
          `Successfully enrolled ${result.enrolled_count} learner(s).` +
          (result.already_enrolled > 0 ? ` ${result.already_enrolled} already enrolled.` : '') +
          (result.errors.length > 0 ? ` ${result.errors.length} failed.` : '')
        );
      } else if (result.already_enrolled > 0) {
        toast('All selected learners are already enrolled in this course.');
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Bulk enrollment failed');
    },
  });
}
