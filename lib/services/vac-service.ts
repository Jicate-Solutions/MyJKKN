// VAC Service Layer
// Following MyJKKN pattern: Static class with static methods
// NOTE: VAC tables need to be created and types regenerated before this service is fully typed

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  VACCourse,
  VACLesson,
  VACCoursesResponse,
  VACLessonResponse,
  VACCourseFormData,
  VACLessonFormData,
  VACLearnerProgress,
  VACCourseFilters,
  VACEnrollment,
  VACEnrollmentWithDetails,
  VACEnrollmentFormData,
  VACEnrollmentStats,
  VACEnrollmentsResponse,
  VACEnrollmentCheckResult,
  VACEnrollmentStatus,
  VACPaymentStatus
} from '@/types/vac';

// Helper to get untyped supabase client for VAC tables (not yet in generated types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = (): any => createClientSupabaseClient();

export class VACService {
  // ============================================
  // Course Operations
  // ============================================

  static async getCourses(filters?: VACCourseFilters): Promise<VACCoursesResponse> {
    const supabase = getSupabase();

    let query = supabase.from('vac_courses').select('*').order('code');

    if (filters?.institution) {
      query = query.eq('institution', filters.institution);
    }
    if (filters?.track) {
      query = query.eq('track', filters.track);
    }
    if (filters?.activeOnly !== false) {
      query = query.eq('is_active', true);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      courses: (data || []) as VACCourse[],
      total: count || data?.length || 0
    };
  }

  static async getCourseById(id: string): Promise<VACCourse | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_courses')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as VACCourse;
  }

  static async getCourseByCode(code: string): Promise<VACCourse | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_courses')
      .select('*')
      .eq('code', code)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as VACCourse | null;
  }

  static async createCourse(formData: VACCourseFormData): Promise<VACCourse> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_courses')
      .insert(formData)
      .select()
      .single();

    if (error) throw error;
    return data as VACCourse;
  }

  static async updateCourse(id: string, formData: Partial<VACCourseFormData>): Promise<VACCourse> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_courses')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as VACCourse;
  }

  static async deleteCourse(id: string): Promise<void> {
    const supabase = getSupabase();

    // First delete all lessons associated with this course
    const { error: lessonsError } = await supabase
      .from('vac_lessons')
      .delete()
      .eq('course_id', id);

    if (lessonsError) throw lessonsError;

    // Then delete the course itself
    const { error } = await supabase
      .from('vac_courses')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ============================================
  // Lesson Operations
  // ============================================

  static async getLessonsByCourse(courseId: string): Promise<VACLesson[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_lessons')
      .select('*')
      .eq('course_id', courseId)
      .order('week')
      .order('hour');

    if (error) throw error;
    return (data || []) as VACLesson[];
  }

  static async getLessonById(lessonId: string): Promise<VACLessonResponse | null> {
    const supabase = getSupabase();

    // Get the lesson
    const { data: lesson, error: lessonError } = await supabase
      .from('vac_lessons')
      .select('*')
      .eq('id', lessonId)
      .single();

    if (lessonError) throw lessonError;
    if (!lesson) return null;

    // Get the course
    const { data: course, error: courseError } = await supabase
      .from('vac_courses')
      .select('*')
      .eq('id', lesson.course_id)
      .single();

    if (courseError) throw courseError;

    // Get prev/next lessons
    const { data: allLessons } = await supabase
      .from('vac_lessons')
      .select('id, hour, title')
      .eq('course_id', lesson.course_id)
      .order('hour');

    const currentIndex = allLessons?.findIndex((l: { id: string }) => l.id === lessonId) ?? -1;
    const prevLesson = currentIndex > 0 ? allLessons?.[currentIndex - 1] : undefined;
    const nextLesson = currentIndex < (allLessons?.length || 0) - 1 ? allLessons?.[currentIndex + 1] : undefined;

    return {
      lesson: lesson as VACLesson,
      course: course as VACCourse,
      prev_lesson: prevLesson,
      next_lesson: nextLesson
    };
  }

  static async getLessonByHour(courseId: string, hour: number): Promise<VACLesson | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_lessons')
      .select('*')
      .eq('course_id', courseId)
      .eq('hour', hour)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as VACLesson | null;
  }

  static async createLesson(courseId: string, formData: VACLessonFormData): Promise<VACLesson> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_lessons')
      .insert({ ...formData, course_id: courseId })
      .select()
      .single();

    if (error) throw error;
    return data as VACLesson;
  }

  static async updateLesson(lessonId: string, formData: Partial<VACLessonFormData>): Promise<VACLesson> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_lessons')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', lessonId)
      .select()
      .single();

    if (error) throw error;
    return data as VACLesson;
  }

  static async deleteLesson(lessonId: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('vac_lessons')
      .delete()
      .eq('id', lessonId);

    if (error) throw error;
  }

  // ============================================
  // Bulk Operations (for importing content)
  // ============================================

  static async bulkCreateLessons(courseId: string, lessons: VACLessonFormData[]): Promise<VACLesson[]> {
    const supabase = getSupabase();

    const lessonsWithCourse = lessons.map(l => ({ ...l, course_id: courseId }));

    const { data, error } = await supabase
      .from('vac_lessons')
      .insert(lessonsWithCourse)
      .select();

    if (error) throw error;
    return (data || []) as VACLesson[];
  }

  // ============================================
  // Progress Tracking
  // ============================================

  static async getProgress(userId: string, courseId: string): Promise<VACLearnerProgress[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_learner_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId);

    if (error) throw error;
    return (data || []) as VACLearnerProgress[];
  }

  static async updateProgress(
    userId: string,
    courseId: string,
    lessonId: string,
    status: 'not_started' | 'in_progress' | 'completed',
    score?: number
  ): Promise<VACLearnerProgress> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_learner_progress')
      .upsert({
        user_id: userId,
        course_id: courseId,
        lesson_id: lessonId,
        status,
        score,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,lesson_id'
      })
      .select()
      .single();

    if (error) throw error;
    return data as VACLearnerProgress;
  }

  /**
   * Mark a lesson as complete with optional score
   */
  static async markLessonComplete(
    userId: string,
    courseId: string,
    lessonId: string,
    score?: number
  ): Promise<VACLearnerProgress> {
    return this.updateProgress(userId, courseId, lessonId, 'completed', score);
  }

  /**
   * Get the overall progress percentage for a course
   * Returns: { completed: number, total: number, percentage: number }
   */
  static async getCourseProgressSummary(
    userId: string,
    courseId: string
  ): Promise<{ completed: number; total: number; percentage: number; inProgress: number }> {
    const supabase = getSupabase();

    // Get total published lessons for the course
    const { data: lessons, error: lessonsError } = await supabase
      .from('vac_lessons')
      .select('id')
      .eq('course_id', courseId)
      .eq('is_published', true);

    if (lessonsError) throw lessonsError;

    const totalLessons = lessons?.length || 0;

    if (totalLessons === 0) {
      return { completed: 0, total: 0, percentage: 0, inProgress: 0 };
    }

    // Get user's progress for this course
    const { data: progress, error: progressError } = await supabase
      .from('vac_learner_progress')
      .select('lesson_id, status')
      .eq('user_id', userId)
      .eq('course_id', courseId);

    if (progressError) throw progressError;

    const completedCount = (progress || []).filter(p => p.status === 'completed').length;
    const inProgressCount = (progress || []).filter(p => p.status === 'in_progress').length;
    const percentage = Math.round((completedCount / totalLessons) * 100);

    return {
      completed: completedCount,
      total: totalLessons,
      percentage,
      inProgress: inProgressCount
    };
  }

  /**
   * Get single lesson progress for a user
   */
  static async getLessonProgress(
    userId: string,
    lessonId: string
  ): Promise<VACLearnerProgress | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_learner_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data as VACLearnerProgress | null;
  }

  /**
   * Batch update progress - mark lesson as in_progress when user starts viewing
   */
  static async startLesson(
    userId: string,
    courseId: string,
    lessonId: string
  ): Promise<VACLearnerProgress> {
    const supabase = getSupabase();

    // Only update if not already completed
    const existing = await this.getLessonProgress(userId, lessonId);
    if (existing?.status === 'completed') {
      return existing;
    }

    return this.updateProgress(userId, courseId, lessonId, 'in_progress');
  }

  // ============================================
  // Course Statistics
  // ============================================

  static async getCourseStats(courseId: string): Promise<{
    totalLessons: number;
    publishedLessons: number;
    totalHours: number;
  }> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_lessons')
      .select('id, is_published, duration_minutes')
      .eq('course_id', courseId);

    if (error) throw error;

    const lessons = data || [];
    return {
      totalLessons: lessons.length,
      publishedLessons: lessons.filter((l: { is_published: boolean }) => l.is_published).length,
      totalHours: Math.round(lessons.reduce((sum: number, l: { duration_minutes?: number }) => sum + (l.duration_minutes || 60), 0) / 60)
    };
  }

  // ============================================
  // Enrollment Operations
  // ============================================

  /**
   * Enroll a user in a course
   */
  static async enrollInCourse(
    userId: string,
    courseId: string,
    formData?: Partial<VACEnrollmentFormData>
  ): Promise<VACEnrollment> {
    const supabase = getSupabase();

    const enrollmentData = {
      user_id: userId,
      course_id: courseId,
      status: 'active' as VACEnrollmentStatus,
      payment_status: formData?.payment_status || ('pending' as VACPaymentStatus),
      payment_amount: formData?.payment_amount,
      payment_reference: formData?.payment_reference,
      notes: formData?.notes
    };

    const { data, error } = await supabase
      .from('vac_enrollments')
      .insert(enrollmentData)
      .select()
      .single();

    if (error) {
      // Check if already enrolled (unique constraint violation)
      if (error.code === '23505') {
        throw new Error('You are already enrolled in this course');
      }
      throw error;
    }
    return data as VACEnrollment;
  }

  /**
   * Get all enrollments for a user
   */
  static async getEnrollments(userId: string): Promise<VACEnrollmentsResponse> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_enrollments_with_details')
      .select('*')
      .eq('user_id', userId)
      .order('enrolled_at', { ascending: false });

    if (error) throw error;

    return {
      enrollments: (data || []) as VACEnrollmentWithDetails[],
      total: data?.length || 0
    };
  }

  /**
   * Get a specific enrollment by ID
   */
  static async getEnrollmentById(enrollmentId: string): Promise<VACEnrollmentWithDetails | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_enrollments_with_details')
      .select('*')
      .eq('id', enrollmentId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as VACEnrollmentWithDetails | null;
  }

  /**
   * Check if a user is enrolled in a specific course
   */
  static async isEnrolled(userId: string, courseId: string): Promise<VACEnrollmentCheckResult> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_enrollments')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return {
      isEnrolled: !!data,
      enrollment: data as VACEnrollment | undefined
    };
  }

  /**
   * Check enrollment using the database function (faster for simple checks)
   */
  static async checkEnrollmentFast(userId: string, courseId: string): Promise<boolean> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .rpc('is_enrolled_in_vac_course', {
        p_user_id: userId,
        p_course_id: courseId
      });

    if (error) throw error;
    return data as boolean;
  }

  /**
   * Update enrollment status (e.g., cancel, complete)
   */
  static async updateEnrollment(
    enrollmentId: string,
    updates: {
      status?: VACEnrollmentStatus;
      payment_status?: VACPaymentStatus;
      payment_amount?: number;
      payment_reference?: string;
      payment_date?: string;
      notes?: string;
    }
  ): Promise<VACEnrollment> {
    const supabase = getSupabase();

    const updateData: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };

    // Set completed_at if status is being changed to completed
    if (updates.status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    // Set payment_date if payment_status is being changed to paid
    if (updates.payment_status === 'paid' && !updates.payment_date) {
      updateData.payment_date = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('vac_enrollments')
      .update(updateData)
      .eq('id', enrollmentId)
      .select()
      .single();

    if (error) throw error;
    return data as VACEnrollment;
  }

  /**
   * Cancel an enrollment
   */
  static async cancelEnrollment(enrollmentId: string, reason?: string): Promise<VACEnrollment> {
    return this.updateEnrollment(enrollmentId, {
      status: 'cancelled',
      notes: reason
    });
  }

  /**
   * Mark enrollment as complete
   */
  static async completeEnrollment(enrollmentId: string): Promise<VACEnrollment> {
    return this.updateEnrollment(enrollmentId, {
      status: 'completed'
    });
  }

  /**
   * Mark payment as completed
   */
  static async markPaymentComplete(
    enrollmentId: string,
    amount: number,
    reference?: string
  ): Promise<VACEnrollment> {
    return this.updateEnrollment(enrollmentId, {
      payment_status: 'paid',
      payment_amount: amount,
      payment_reference: reference,
      payment_date: new Date().toISOString()
    });
  }

  /**
   * Waive payment for an enrollment (admin only)
   */
  static async waivePayment(enrollmentId: string, reason: string): Promise<VACEnrollment> {
    return this.updateEnrollment(enrollmentId, {
      payment_status: 'waived',
      notes: `Payment waived: ${reason}`
    });
  }

  /**
   * Get enrollment statistics for a course
   */
  static async getEnrollmentStats(courseId: string): Promise<VACEnrollmentStats> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .rpc('get_vac_course_enrollment_stats', { p_course_id: courseId });

    if (error) throw error;

    // The function returns an array with one row
    const stats = data?.[0] || {
      total_enrollments: 0,
      active_enrollments: 0,
      completed_enrollments: 0,
      paid_enrollments: 0,
      total_revenue: 0
    };

    return stats as VACEnrollmentStats;
  }

  /**
   * Get overall analytics across ALL courses (admin dashboard)
   * Fetches courses and all enrollments, then aggregates in JS
   */
  static async getOverallAnalytics(): Promise<{
    totalEnrollments: number;
    activeStudents: number;
    completedEnrollments: number;
    totalCourses: number;
    activeCourses: number;
    totalRevenue: number;
    courseStats: Array<{
      courseId: string;
      courseName: string;
      courseCode: string;
      enrollmentCount: number;
      completionRate: number;
      revenue: number;
    }>;
    trackDistribution: Array<{
      track: string;
      count: number;
      percentage: number;
    }>;
    paymentBreakdown: {
      paid: number;
      pending: number;
      waived: number;
      refunded: number;
    };
  }> {
    const supabase = getSupabase();

    // Fetch all courses (active and inactive)
    const { data: coursesData, error: coursesError } = await supabase
      .from('vac_courses')
      .select('*')
      .order('code');

    if (coursesError) throw coursesError;

    const courses = (coursesData || []) as VACCourse[];

    // Fetch ALL enrollments across all courses using the details view
    const { data: enrollmentsData, error: enrollmentsError } = await supabase
      .from('vac_enrollments_with_details')
      .select('*')
      .order('enrolled_at', { ascending: false });

    if (enrollmentsError) throw enrollmentsError;

    const enrollments = (enrollmentsData || []) as VACEnrollmentWithDetails[];

    // Aggregate stats
    const totalEnrollments = enrollments.length;
    const activeStudents = enrollments.filter(e => e.status === 'active').length;
    const completedEnrollments = enrollments.filter(e => e.status === 'completed').length;
    const totalCourses = courses.length;
    const activeCourses = courses.filter(c => c.is_active).length;
    const totalRevenue = enrollments
      .filter(e => e.payment_status === 'paid' && e.payment_amount)
      .reduce((sum, e) => sum + (e.payment_amount || 0), 0);

    // Per-course stats
    const courseEnrollmentMap = new Map<string, VACEnrollmentWithDetails[]>();
    enrollments.forEach(e => {
      const existing = courseEnrollmentMap.get(e.course_id) || [];
      existing.push(e);
      courseEnrollmentMap.set(e.course_id, existing);
    });

    const courseStats = courses
      .map(course => {
        const courseEnrollments = courseEnrollmentMap.get(course.id) || [];
        const completed = courseEnrollments.filter(e => e.status === 'completed').length;
        const total = courseEnrollments.length;
        const revenue = courseEnrollments
          .filter(e => e.payment_status === 'paid' && e.payment_amount)
          .reduce((sum, e) => sum + (e.payment_amount || 0), 0);

        return {
          courseId: course.id,
          courseName: course.name,
          courseCode: course.code,
          enrollmentCount: total,
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          revenue,
        };
      })
      .sort((a, b) => b.enrollmentCount - a.enrollmentCount);

    // Track distribution based on enrollments
    const trackCounts = new Map<string, number>();
    enrollments.forEach(e => {
      const track = e.course_track || 'unknown';
      trackCounts.set(track, (trackCounts.get(track) || 0) + 1);
    });

    const trackDistribution = Array.from(trackCounts.entries())
      .map(([track, count]) => ({
        track,
        count,
        percentage: totalEnrollments > 0 ? Math.round((count / totalEnrollments) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Payment breakdown
    const paymentBreakdown = {
      paid: enrollments.filter(e => e.payment_status === 'paid').length,
      pending: enrollments.filter(e => e.payment_status === 'pending').length,
      waived: enrollments.filter(e => e.payment_status === 'waived').length,
      refunded: enrollments.filter(e => e.payment_status === 'refunded').length,
    };

    return {
      totalEnrollments,
      activeStudents,
      completedEnrollments,
      totalCourses,
      activeCourses,
      totalRevenue,
      courseStats,
      trackDistribution,
      paymentBreakdown,
    };
  }

  /**
   * Get all enrollments for a course (admin)
   */
  static async getCourseEnrollments(courseId: string): Promise<VACEnrollmentsResponse> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_enrollments_with_details')
      .select('*')
      .eq('course_id', courseId)
      .order('enrolled_at', { ascending: false });

    if (error) throw error;

    return {
      enrollments: (data || []) as VACEnrollmentWithDetails[],
      total: data?.length || 0
    };
  }

  /**
   * Get active enrollments (My Courses)
   */
  static async getActiveEnrollments(userId: string): Promise<VACEnrollmentsResponse> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('vac_enrollments_with_details')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('enrolled_at', { ascending: false });

    if (error) throw error;

    return {
      enrollments: (data || []) as VACEnrollmentWithDetails[],
      total: data?.length || 0
    };
  }
}
