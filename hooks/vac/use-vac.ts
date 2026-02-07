// VAC Module Hooks
// TanStack Query hooks for Value-Added Courses

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import { VACService } from '@/lib/services/vac-service';
import type {
  VACCourse,
  VACLesson,
  VACCoursesResponse,
  VACLessonResponse,
  VACCourseFilters,
  VACLearnerProgress,
  VACEnrollment,
  VACEnrollmentWithDetails,
  VACEnrollmentFormData,
  VACEnrollmentsResponse,
  VACEnrollmentCheckResult,
  VACEnrollmentStats
} from '@/types/vac';

// ============================================
// Query Keys
// ============================================

export const vacQueryKeys = {
  all: ['vac'] as const,
  courses: () => [...vacQueryKeys.all, 'courses'] as const,
  coursesList: (filters?: VACCourseFilters) => [...vacQueryKeys.courses(), filters] as const,
  course: (id: string) => [...vacQueryKeys.all, 'course', id] as const,
  courseByCode: (code: string) => [...vacQueryKeys.all, 'course-code', code] as const,
  lessons: (courseId: string) => [...vacQueryKeys.all, 'lessons', courseId] as const,
  lesson: (lessonId: string) => [...vacQueryKeys.all, 'lesson', lessonId] as const,
  progress: (userId: string, courseId: string) => [...vacQueryKeys.all, 'progress', userId, courseId] as const,
  stats: (courseId: string) => [...vacQueryKeys.all, 'stats', courseId] as const,
  // Enrollment keys
  enrollments: (userId: string) => [...vacQueryKeys.all, 'enrollments', userId] as const,
  enrollment: (enrollmentId: string) => [...vacQueryKeys.all, 'enrollment', enrollmentId] as const,
  isEnrolled: (userId: string, courseId: string) => [...vacQueryKeys.all, 'is-enrolled', userId, courseId] as const,
  enrollmentStats: (courseId: string) => [...vacQueryKeys.all, 'enrollment-stats', courseId] as const,
  courseEnrollments: (courseId: string) => [...vacQueryKeys.all, 'course-enrollments', courseId] as const,
  analytics: () => [...vacQueryKeys.all, 'analytics'] as const,
};

// ============================================
// Course Hooks
// ============================================

/**
 * Fetch all VAC courses with optional filters
 */
export function useVACCourses(filters?: VACCourseFilters) {
  const memoizedFilters = useMemo(() => ({
    institution: filters?.institution,
    track: filters?.track,
    activeOnly: filters?.activeOnly ?? true,
  }), [filters?.institution, filters?.track, filters?.activeOnly]);

  const queryFn = useCallback(async (): Promise<VACCoursesResponse> => {
    return VACService.getCourses(memoizedFilters);
  }, [memoizedFilters]);

  return useQuery({
    queryKey: vacQueryKeys.coursesList(memoizedFilters),
    queryFn,
    placeholderData: (previousData) => previousData,
    retry: 2,
    staleTime: 60000, // Fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Fetch a single VAC course by ID
 */
export function useVACCourse(courseId: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACCourse | null> => {
    if (!courseId) return null;
    return VACService.getCourseById(courseId);
  }, [courseId]);

  return useQuery({
    queryKey: vacQueryKeys.course(courseId || ''),
    queryFn,
    enabled: !!courseId,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch a VAC course by code (e.g., "CSE-MATLAB")
 */
export function useVACCourseByCode(code: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACCourse | null> => {
    if (!code) return null;
    return VACService.getCourseByCode(code);
  }, [code]);

  return useQuery({
    queryKey: vacQueryKeys.courseByCode(code || ''),
    queryFn,
    enabled: !!code,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

// ============================================
// Course Mutation Hooks
// ============================================

/**
 * Create a new VAC course
 */
export function useCreateVACCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: import('@/types/vac').VACCourseFormData) => {
      return VACService.createCourse(formData);
    },
    onSuccess: () => {
      // Invalidate all course queries to refetch
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.courses(),
      });
    },
  });
}

/**
 * Update an existing VAC course
 */
export function useUpdateVACCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      formData,
    }: {
      id: string;
      formData: Partial<import('@/types/vac').VACCourseFormData>;
    }) => {
      return VACService.updateCourse(id, formData);
    },
    onSuccess: (_, variables) => {
      // Invalidate specific course and course list
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.course(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.courses(),
      });
    },
  });
}

/**
 * Delete a VAC course
 */
export function useDeleteVACCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return VACService.deleteCourse(id);
    },
    onSuccess: () => {
      // Invalidate all course queries to refetch
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.courses(),
      });
    },
  });
}

// ============================================
// Lesson Hooks
// ============================================

/**
 * Fetch all lessons for a course
 */
export function useVACLessons(courseId: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACLesson[]> => {
    if (!courseId) return [];
    return VACService.getLessonsByCourse(courseId);
  }, [courseId]);

  return useQuery({
    queryKey: vacQueryKeys.lessons(courseId || ''),
    queryFn,
    enabled: !!courseId,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch a single lesson with course context and prev/next navigation
 */
export function useVACLesson(lessonId: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACLessonResponse | null> => {
    if (!lessonId) return null;
    return VACService.getLessonById(lessonId);
  }, [lessonId]);

  return useQuery({
    queryKey: vacQueryKeys.lesson(lessonId || ''),
    queryFn,
    enabled: !!lessonId,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

// ============================================
// Lesson Mutation Hooks
// ============================================

/**
 * Create a new VAC lesson
 */
export function useCreateVACLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      courseId,
      data,
    }: {
      courseId: string;
      data: import('@/types/vac').VACLessonFormData;
    }) => {
      return VACService.createLesson(courseId, data);
    },
    onSuccess: (_, variables) => {
      // Invalidate lessons list for this course
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.lessons(variables.courseId),
      });
      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.stats(variables.courseId),
      });
    },
  });
}

/**
 * Update an existing VAC lesson
 */
export function useUpdateVACLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lessonId,
      data,
    }: {
      lessonId: string;
      data: Partial<import('@/types/vac').VACLessonFormData>;
    }) => {
      return VACService.updateLesson(lessonId, data);
    },
    onSuccess: (result) => {
      // Invalidate specific lesson
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.lesson(result.id),
      });
      // Invalidate lessons list for this course
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.lessons(result.course_id),
      });
      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.stats(result.course_id),
      });
    },
  });
}

/**
 * Delete a VAC lesson
 */
export function useDeleteVACLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lessonId,
      courseId,
    }: {
      lessonId: string;
      courseId: string;
    }) => {
      await VACService.deleteLesson(lessonId);
      return { courseId };
    },
    onSuccess: (result) => {
      // Invalidate lessons list for this course
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.lessons(result.courseId),
      });
      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.stats(result.courseId),
      });
    },
  });
}

// ============================================
// Progress Hooks
// ============================================

/**
 * Fetch user's progress for a course
 */
export function useVACProgress(userId: string | undefined, courseId: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACLearnerProgress[]> => {
    if (!userId || !courseId) return [];
    return VACService.getProgress(userId, courseId);
  }, [userId, courseId]);

  return useQuery({
    queryKey: vacQueryKeys.progress(userId || '', courseId || ''),
    queryFn,
    enabled: !!userId && !!courseId,
    retry: 2,
    staleTime: 30000, // Fresh for 30 seconds (progress changes more often)
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Mutation to update lesson progress
 */
export function useUpdateVACProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      courseId,
      lessonId,
      status,
      score,
    }: {
      userId: string;
      courseId: string;
      lessonId: string;
      status: 'not_started' | 'in_progress' | 'completed';
      score?: number;
    }) => {
      return VACService.updateProgress(userId, courseId, lessonId, status, score);
    },
    onSuccess: (_, variables) => {
      // Invalidate progress query to refetch
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.progress(variables.userId, variables.courseId),
      });
      // Also invalidate course progress summary
      queryClient.invalidateQueries({
        queryKey: [...vacQueryKeys.all, 'course-progress', variables.userId, variables.courseId],
      });
    },
  });
}

/**
 * Mutation to mark a lesson as complete
 */
export function useMarkLessonComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      courseId,
      lessonId,
      score,
    }: {
      userId: string;
      courseId: string;
      lessonId: string;
      score?: number;
    }) => {
      return VACService.markLessonComplete(userId, courseId, lessonId, score);
    },
    onSuccess: (_, variables) => {
      // Invalidate all related progress queries
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.progress(variables.userId, variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: [...vacQueryKeys.all, 'course-progress', variables.userId, variables.courseId],
      });
      queryClient.invalidateQueries({
        queryKey: [...vacQueryKeys.all, 'lesson-progress', variables.userId, variables.lessonId],
      });
    },
  });
}

/**
 * Mutation to start a lesson (mark as in_progress)
 */
export function useStartLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      courseId,
      lessonId,
    }: {
      userId: string;
      courseId: string;
      lessonId: string;
    }) => {
      return VACService.startLesson(userId, courseId, lessonId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.progress(variables.userId, variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: [...vacQueryKeys.all, 'lesson-progress', variables.userId, variables.lessonId],
      });
    },
  });
}

/**
 * Fetch course progress summary (percentage complete)
 */
export function useCourseProgress(userId: string | undefined, courseId: string | undefined) {
  const queryFn = useCallback(async () => {
    if (!userId || !courseId) return null;
    return VACService.getCourseProgressSummary(userId, courseId);
  }, [userId, courseId]);

  return useQuery({
    queryKey: [...vacQueryKeys.all, 'course-progress', userId || '', courseId || ''],
    queryFn,
    enabled: !!userId && !!courseId,
    retry: 2,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch single lesson progress
 */
export function useLessonProgress(userId: string | undefined, lessonId: string | undefined) {
  const queryFn = useCallback(async () => {
    if (!userId || !lessonId) return null;
    return VACService.getLessonProgress(userId, lessonId);
  }, [userId, lessonId]);

  return useQuery({
    queryKey: [...vacQueryKeys.all, 'lesson-progress', userId || '', lessonId || ''],
    queryFn,
    enabled: !!userId && !!lessonId,
    retry: 2,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}

// ============================================
// Stats Hook
// ============================================

/**
 * Fetch course statistics (total lessons, published, hours)
 */
export function useVACCourseStats(courseId: string | undefined) {
  const queryFn = useCallback(async () => {
    if (!courseId) return null;
    return VACService.getCourseStats(courseId);
  }, [courseId]);

  return useQuery({
    queryKey: vacQueryKeys.stats(courseId || ''),
    queryFn,
    enabled: !!courseId,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

// ============================================
// Combined Hook for Course Detail Page
// ============================================

/**
 * Fetch course with its lessons in one hook
 * Useful for course detail pages
 */
export function useVACCourseWithLessons(courseId: string | undefined) {
  const courseQuery = useVACCourse(courseId);
  const lessonsQuery = useVACLessons(courseId);
  const statsQuery = useVACCourseStats(courseId);

  return {
    course: courseQuery.data,
    lessons: lessonsQuery.data || [],
    stats: statsQuery.data,
    isLoading: courseQuery.isLoading || lessonsQuery.isLoading,
    isError: courseQuery.isError || lessonsQuery.isError,
    error: courseQuery.error || lessonsQuery.error,
    refetch: () => {
      courseQuery.refetch();
      lessonsQuery.refetch();
      statsQuery.refetch();
    },
  };
}

// ============================================
// Enrollment Hooks
// ============================================

/**
 * Enroll current user in a course
 */
export function useEnrollInCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      courseId,
      formData,
    }: {
      userId: string;
      courseId: string;
      formData?: Partial<VACEnrollmentFormData>;
    }) => {
      return VACService.enrollInCourse(userId, courseId, formData);
    },
    onSuccess: (_, variables) => {
      // Invalidate enrollment queries
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.enrollments(variables.userId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.isEnrolled(variables.userId, variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.enrollmentStats(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.courseEnrollments(variables.courseId),
      });
    },
  });
}

/**
 * Fetch all enrollments for a user
 */
export function useMyEnrollments(userId: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACEnrollmentsResponse> => {
    if (!userId) return { enrollments: [], total: 0 };
    return VACService.getEnrollments(userId);
  }, [userId]);

  return useQuery({
    queryKey: vacQueryKeys.enrollments(userId || ''),
    queryFn,
    enabled: !!userId,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch active enrollments only (My Courses)
 */
export function useActiveEnrollments(userId: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACEnrollmentsResponse> => {
    if (!userId) return { enrollments: [], total: 0 };
    return VACService.getActiveEnrollments(userId);
  }, [userId]);

  return useQuery({
    queryKey: [...vacQueryKeys.enrollments(userId || ''), 'active'] as const,
    queryFn,
    enabled: !!userId,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Check if user is enrolled in a specific course
 */
export function useIsEnrolled(userId: string | undefined, courseId: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACEnrollmentCheckResult> => {
    if (!userId || !courseId) return { isEnrolled: false };
    return VACService.isEnrolled(userId, courseId);
  }, [userId, courseId]);

  return useQuery({
    queryKey: vacQueryKeys.isEnrolled(userId || '', courseId || ''),
    queryFn,
    enabled: !!userId && !!courseId,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Update enrollment (status, payment, etc.)
 */
export function useUpdateEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      enrollmentId,
      updates,
    }: {
      enrollmentId: string;
      userId: string;
      courseId: string;
      updates: Parameters<typeof VACService.updateEnrollment>[1];
    }) => {
      return VACService.updateEnrollment(enrollmentId, updates);
    },
    onSuccess: (_, variables) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.enrollment(variables.enrollmentId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.enrollments(variables.userId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.isEnrolled(variables.userId, variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.enrollmentStats(variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.courseEnrollments(variables.courseId),
      });
    },
  });
}

/**
 * Cancel enrollment
 */
export function useCancelEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      enrollmentId,
      reason,
    }: {
      enrollmentId: string;
      userId: string;
      courseId: string;
      reason?: string;
    }) => {
      return VACService.cancelEnrollment(enrollmentId, reason);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.enrollments(variables.userId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.isEnrolled(variables.userId, variables.courseId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.enrollmentStats(variables.courseId),
      });
    },
  });
}

/**
 * Mark payment as complete
 */
export function useMarkPaymentComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      enrollmentId,
      amount,
      reference,
    }: {
      enrollmentId: string;
      userId: string;
      courseId: string;
      amount: number;
      reference?: string;
    }) => {
      return VACService.markPaymentComplete(enrollmentId, amount, reference);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.enrollments(variables.userId),
      });
      queryClient.invalidateQueries({
        queryKey: vacQueryKeys.enrollmentStats(variables.courseId),
      });
    },
  });
}

/**
 * Get enrollment statistics for a course (admin)
 */
export function useEnrollmentStats(courseId: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACEnrollmentStats | null> => {
    if (!courseId) return null;
    return VACService.getEnrollmentStats(courseId);
  }, [courseId]);

  return useQuery({
    queryKey: vacQueryKeys.enrollmentStats(courseId || ''),
    queryFn,
    enabled: !!courseId,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Get all enrollments for a course (admin)
 */
export function useCourseEnrollments(courseId: string | undefined) {
  const queryFn = useCallback(async (): Promise<VACEnrollmentsResponse> => {
    if (!courseId) return { enrollments: [], total: 0 };
    return VACService.getCourseEnrollments(courseId);
  }, [courseId]);

  return useQuery({
    queryKey: vacQueryKeys.courseEnrollments(courseId || ''),
    queryFn,
    enabled: !!courseId,
    retry: 2,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Combined hook for course detail with enrollment status
 */
export function useVACCourseWithEnrollment(
  courseId: string | undefined,
  userId: string | undefined
) {
  const courseQuery = useVACCourse(courseId);
  const lessonsQuery = useVACLessons(courseId);
  const statsQuery = useVACCourseStats(courseId);
  const enrollmentQuery = useIsEnrolled(userId, courseId);
  const progressQuery = useCourseProgress(userId, courseId);

  return {
    course: courseQuery.data,
    lessons: lessonsQuery.data || [],
    stats: statsQuery.data,
    isEnrolled: enrollmentQuery.data?.isEnrolled ?? false,
    enrollment: enrollmentQuery.data?.enrollment,
    progress: progressQuery.data,
    isLoading:
      courseQuery.isLoading ||
      lessonsQuery.isLoading ||
      enrollmentQuery.isLoading,
    isError:
      courseQuery.isError || lessonsQuery.isError || enrollmentQuery.isError,
    error: courseQuery.error || lessonsQuery.error || enrollmentQuery.error,
    refetch: () => {
      courseQuery.refetch();
      lessonsQuery.refetch();
      statsQuery.refetch();
      enrollmentQuery.refetch();
      progressQuery.refetch();
    },
  };
}
