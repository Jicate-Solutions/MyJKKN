// ================================================================================
// VAC (Value-Added Courses) Service
// Created: 2026-04-02
// Handles: Courses, Lessons, Enrollments, Progress, Analytics, Programme Mapping
// ================================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  VACCourse,
  VACLesson,
  VACEnrollment,
  VACEnrollmentWithDetails,
  VACLearnerProgress,
  VACCourseProgramme,
  VACCourseFilters,
  VACEnrollmentFilters,
  VACCoursesResponse,
  VACEnrollmentsResponse,
  CreateVACCourseInput,
  UpdateVACCourseInput,
  CreateVACLessonInput,
  UpdateVACLessonInput,
  CreateVACEnrollmentInput,
  CourseEnrollmentStats,
  VACOverviewStats,
  VACTrendDataPoint,
  VACProgrammeStats,
  FinksProfile,
} from '@/types/vac';

export class VACService {
  // Cast to any — VAC tables exist in DB but aren't in generated Supabase types yet.
  // Regenerate types with: supabase gen types typescript --project-id <id>
  private static getSupabase() {
    return createClientSupabaseClient() as any;
  }

  /** Whitelist of columns that may be used in .order() to prevent injection */
  private static readonly SORTABLE_COLUMNS = new Set([
    'code',
    'name',
    'track',
    'fee',
    'duration_hours',
    'created_at',
    'updated_at',
    'course_category',
    'nsqf_level',
    'is_active',
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // COURSES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * List courses with filtering, search, pagination and sorting.
   */
  static async getCourses(
    filters: VACCourseFilters = {}
  ): Promise<VACCoursesResponse> {
    const supabase = this.getSupabase();

    const {
      institution_id,
      track,
      course_category,
      search,
      is_active,
      faculty_eligible,
      programme_id,
      nsqf_level,
      fee_min,
      fee_max,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = filters;

    // If filtering by programme_id we need a join through the junction table.
    // Otherwise a straightforward query on vac_courses suffices.
    let query = supabase
      .from('vac_courses')
      .select('*', { count: 'exact' });

    // ── Apply filters ─────────────────────────────────────────────────────

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (track) {
      query = query.eq('track', track);
    }

    if (course_category) {
      query = query.eq('course_category', course_category);
    }

    if (typeof is_active === 'boolean') {
      query = query.eq('is_active', is_active);
    }

    if (typeof faculty_eligible === 'boolean') {
      query = query.eq('faculty_eligible', faculty_eligible);
    }

    if (nsqf_level !== undefined && nsqf_level !== null) {
      query = query.eq('nsqf_level', nsqf_level);
    }

    if (fee_min !== undefined && fee_min !== null) {
      query = query.gte('fee', fee_min);
    }

    if (fee_max !== undefined && fee_max !== null) {
      query = query.lte('fee', fee_max);
    }

    if (search) {
      const term = `%${search}%`;
      query = query.or(`name.ilike.${term},code.ilike.${term},description.ilike.${term}`);
    }

    // If filtering by programme_id, get course IDs from junction table first
    if (programme_id) {
      const { data: mappings, error: mapErr } = await supabase
        .from('vac_course_programmes')
        .select('course_id')
        .eq('programme_id', programme_id);

      if (mapErr) throw new Error(mapErr.message);

      const courseIds = (mappings ?? []).map((m) => m.course_id);

      if (courseIds.length === 0) {
        return { data: [], metadata: { total: 0, totalPages: 0, page } };
      }

      query = query.in('id', courseIds);
    }

    // ── Sorting ───────────────────────────────────────────────────────────

    const safeSortBy = this.SORTABLE_COLUMNS.has(sortBy) ? sortBy : 'created_at';
    query = query.order(safeSortBy, { ascending: sortOrder === 'asc' });

    // ── Pagination ────────────────────────────────────────────────────────

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);

    const total = count ?? 0;

    return {
      data: (data ?? []) as VACCourse[],
      metadata: {
        total,
        totalPages: Math.ceil(total / limit),
        page,
      },
    };
  }

  /**
   * Get a single course by ID.
   */
  static async getCourseById(id: string): Promise<VACCourse | null> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('vac_courses')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      // PGRST116 = no rows returned
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }

    return data as VACCourse;
  }

  /**
   * Create a new VAC course with optional programme mappings.
   */
  /**
   * Strips empty-string values from UUID and optional fields
   * so Supabase doesn't receive '' where NULL is expected.
   */
  private static sanitizePayload<T extends Record<string, unknown>>(payload: T): T {
    const cleaned = { ...payload };
    for (const key of Object.keys(cleaned)) {
      const val = cleaned[key];
      if (val === '' || val === undefined) {
        (cleaned as any)[key] = null;
      }
    }
    return cleaned;
  }

  static async createCourse(input: CreateVACCourseInput): Promise<VACCourse> {
    const supabase = this.getSupabase();

    // Separate programme_ids from the course payload
    const { programme_ids, ...rawPayload } = input;

    // Sanitize: convert empty strings / undefined to null for UUID columns
    const coursePayload = this.sanitizePayload(rawPayload);

    // Ensure institution_id is present (required)
    if (!coursePayload.institution_id) {
      throw new Error('Institution ID is required to create a course.');
    }

    const { data: course, error } = await supabase
      .from('vac_courses')
      .insert([coursePayload])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`A course with code "${input.code}" already exists.`);
      }
      throw new Error(error.message);
    }

    // Insert programme mappings if provided
    if (programme_ids && programme_ids.length > 0) {
      const mappings = programme_ids.map((programmeId, idx) => ({
        course_id: course.id,
        programme_id: programmeId,
        is_primary: idx === 0, // First programme is primary
      }));

      const { error: mapErr } = await supabase
        .from('vac_course_programmes')
        .insert(mappings);

      if (mapErr) {
        // Best-effort: course was created but mapping failed.
        // Log but don't throw — caller can retry mapping separately.
        console.error('[vac] Failed to insert programme mappings:', mapErr.message);
      }
    }

    return course as VACCourse;
  }

  /**
   * Update an existing VAC course and optionally replace programme mappings.
   */
  static async updateCourse(
    id: string,
    input: UpdateVACCourseInput
  ): Promise<VACCourse> {
    const supabase = this.getSupabase();

    const { programme_ids, ...coursePayload } = input;

    // Only update fields that were actually provided — sanitize empty strings to null
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(coursePayload)) {
      if (value !== undefined) {
        updateData[key] = value === '' ? null : value;
      }
    }

    // Always bump updated_at
    updateData.updated_at = new Date().toISOString();

    const { data: course, error } = await supabase
      .from('vac_courses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`A course with that code already exists.`);
      }
      throw new Error(error.message);
    }

    // Replace programme mappings if the array was explicitly provided
    if (programme_ids !== undefined) {
      // Delete existing mappings
      const { error: delErr } = await supabase
        .from('vac_course_programmes')
        .delete()
        .eq('course_id', id);

      if (delErr) {
        console.error('[vac] Failed to delete old programme mappings:', delErr.message);
      }

      // Insert new mappings
      if (programme_ids.length > 0) {
        const mappings = programme_ids.map((programmeId, idx) => ({
          course_id: id,
          programme_id: programmeId,
          is_primary: idx === 0,
        }));

        const { error: insErr } = await supabase
          .from('vac_course_programmes')
          .insert(mappings);

        if (insErr) {
          console.error('[vac] Failed to insert programme mappings:', insErr.message);
        }
      }
    }

    return course as VACCourse;
  }

  /**
   * Delete a course. Cascade rules in the DB handle lessons, enrollments, etc.
   */
  static async deleteCourse(id: string): Promise<void> {
    const supabase = this.getSupabase();

    const { error } = await supabase
      .from('vac_courses')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LESSONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all lessons for a course ordered by week then hour.
   */
  static async getLessonsByCourse(courseId: string): Promise<VACLesson[]> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('vac_lessons')
      .select('*')
      .eq('course_id', courseId)
      .order('week', { ascending: true })
      .order('hour', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []) as VACLesson[];
  }

  /**
   * Get a single lesson by ID.
   */
  static async getLessonById(id: string): Promise<VACLesson | null> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('vac_lessons')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }

    return data as VACLesson;
  }

  /**
   * Create a new lesson.
   */
  static async createLesson(input: CreateVACLessonInput): Promise<VACLesson> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('vac_lessons')
      .insert([input])
      .select()
      .single();

    if (error) throw new Error(error.message);

    return data as VACLesson;
  }

  /**
   * Update an existing lesson.
   */
  static async updateLesson(
    id: string,
    input: UpdateVACLessonInput
  ): Promise<VACLesson> {
    const supabase = this.getSupabase();

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('vac_lessons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return data as VACLesson;
  }

  /**
   * Delete a lesson by ID.
   */
  static async deleteLesson(id: string): Promise<void> {
    const supabase = this.getSupabase();

    const { error } = await supabase
      .from('vac_lessons')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENROLLMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enrol a user in a course.
   * Automatically sets payment_status based on course fee.
   */
  static async enrollInCourse(
    input: CreateVACEnrollmentInput
  ): Promise<VACEnrollment> {
    const supabase = this.getSupabase();

    // Check for existing active enrollment
    const { data: existing, error: checkErr } = await supabase
      .from('vac_enrollments')
      .select('id, status')
      .eq('user_id', input.user_id)
      .eq('course_id', input.course_id)
      .in('status', ['active', 'completed'])
      .maybeSingle();

    if (checkErr) throw new Error(checkErr.message);

    if (existing) {
      throw new Error(
        existing.status === 'completed'
          ? 'User has already completed this course.'
          : 'User is already enrolled in this course.'
      );
    }

    // Fetch course to determine fee
    const { data: course, error: courseErr } = await supabase
      .from('vac_courses')
      .select('fee')
      .eq('id', input.course_id)
      .single();

    if (courseErr) throw new Error(courseErr.message);

    const fee = course.fee ?? 0;
    const paymentStatus = fee > 0 ? 'pending' : 'waived';

    const enrollmentData = {
      user_id: input.user_id,
      course_id: input.course_id,
      payment_amount: input.payment_amount ?? fee,
      payment_status: paymentStatus,
      status: 'active' as const,
      notes: input.notes ?? null,
      enrolled_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('vac_enrollments')
      .insert([enrollmentData])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('User is already enrolled in this course.');
      }
      throw new Error(error.message);
    }

    return data as VACEnrollment;
  }

  /**
   * Get all enrollments for a specific user with course details.
   * Uses a PostgREST join to avoid N+1 queries.
   */
  static async getMyEnrollments(
    userId: string
  ): Promise<VACEnrollmentWithDetails[]> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('vac_enrollments')
      .select(
        `
        *,
        vac_courses (
          code,
          name,
          institution,
          track,
          duration_hours,
          fee,
          institution_id
        )
      `
      )
      .eq('user_id', userId)
      .order('enrolled_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Map joined data into the flat VACEnrollmentWithDetails shape
    const mapped: VACEnrollmentWithDetails[] = (data ?? []).map((row: any) => {
      const course = row.vac_courses ?? {};
      return {
        id: row.id,
        user_id: row.user_id,
        course_id: row.course_id,
        enrolled_at: row.enrolled_at,
        status: row.status,
        payment_status: row.payment_status,
        payment_amount: row.payment_amount,
        payment_date: row.payment_date,
        payment_reference: row.payment_reference,
        completed_at: row.completed_at,
        expires_at: row.expires_at,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
        course_code: course.code ?? '',
        course_name: course.name ?? '',
        course_institution: course.institution ?? null,
        course_track: course.track ?? '',
        course_duration: course.duration_hours ?? 0,
        course_fee: course.fee ?? 0,
        course_institution_id: course.institution_id ?? null,
        user_name: null,
        user_email: null,
      };
    });

    return mapped;
  }

  /**
   * Admin view: list enrollments with course + user details, filters, and pagination.
   */
  static async getEnrollments(
    filters: VACEnrollmentFilters = {}
  ): Promise<VACEnrollmentsResponse> {
    const supabase = this.getSupabase();

    const {
      course_id,
      status,
      payment_status,
      search,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = filters;

    let query = supabase
      .from('vac_enrollments')
      .select(
        `
        *,
        vac_courses (
          code,
          name,
          institution,
          track,
          duration_hours,
          fee,
          institution_id
        ),
        profiles:user_id (
          full_name,
          email
        )
      `,
        { count: 'exact' }
      );

    if (course_id) {
      query = query.eq('course_id', course_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (payment_status) {
      query = query.eq('payment_status', payment_status);
    }

    // Search by user name or course name requires filtering after join
    // For now, filter by course_id if search is provided
    if (search) {
      // We search on the enrollment-level columns available; deeper search
      // would require a database view or RPC.
      const term = `%${search}%`;
      query = query.or(`notes.ilike.${term}`);
    }

    // Sorting — only allow safe columns on the enrollments table
    const enrollmentSortable = new Set([
      'enrolled_at',
      'status',
      'payment_status',
      'created_at',
      'updated_at',
      'completed_at',
    ]);
    const safeSortBy = enrollmentSortable.has(sortBy) ? sortBy : 'created_at';
    query = query.order(safeSortBy, { ascending: sortOrder === 'asc' });

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);

    const total = count ?? 0;

    // Flatten joined data
    const mapped: VACEnrollmentWithDetails[] = (data ?? []).map((row: any) => {
      const course = row.vac_courses ?? {};
      const profile = row.profiles ?? {};
      return {
        id: row.id,
        user_id: row.user_id,
        course_id: row.course_id,
        enrolled_at: row.enrolled_at,
        status: row.status,
        payment_status: row.payment_status,
        payment_amount: row.payment_amount,
        payment_date: row.payment_date,
        payment_reference: row.payment_reference,
        completed_at: row.completed_at,
        expires_at: row.expires_at,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
        course_code: course.code ?? '',
        course_name: course.name ?? '',
        course_institution: course.institution ?? null,
        course_track: course.track ?? '',
        course_duration: course.duration_hours ?? 0,
        course_fee: course.fee ?? 0,
        course_institution_id: course.institution_id ?? null,
        user_name: profile.full_name ?? null,
        user_email: profile.email ?? null,
      };
    });

    return {
      data: mapped,
      metadata: {
        total,
        totalPages: Math.ceil(total / limit),
        page,
      },
    };
  }

  /**
   * Update enrollment status and optional payment data.
   */
  static async updateEnrollmentStatus(
    id: string,
    status: string,
    paymentData?: {
      payment_status?: string;
      payment_date?: string;
      payment_reference?: string;
    }
  ): Promise<void> {
    const supabase = this.getSupabase();

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (paymentData) {
      if (paymentData.payment_status !== undefined) {
        updateData.payment_status = paymentData.payment_status;
      }
      if (paymentData.payment_date !== undefined) {
        updateData.payment_date = paymentData.payment_date;
      }
      if (paymentData.payment_reference !== undefined) {
        updateData.payment_reference = paymentData.payment_reference;
      }
    }

    const { error } = await supabase
      .from('vac_enrollments')
      .update(updateData)
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  /**
   * Quick boolean check: is the user actively enrolled in this course?
   */
  static async isEnrolled(
    userId: string,
    courseId: string
  ): Promise<boolean> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('vac_enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw new Error(error.message);

    return data !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRESS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all progress records for a user in a course, ordered by lesson hour.
   */
  static async getProgress(
    userId: string,
    courseId: string
  ): Promise<VACLearnerProgress[]> {
    const supabase = this.getSupabase();

    // Join with vac_lessons to get ordering by week + hour
    const { data, error } = await supabase
      .from('vac_learner_progress')
      .select(
        `
        *,
        vac_lessons!inner (
          week,
          hour
        )
      `
      )
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .order('week', { referencedTable: 'vac_lessons', ascending: true })
      .order('hour', { referencedTable: 'vac_lessons', ascending: true });

    if (error) throw new Error(error.message);

    // Strip the joined lesson data and return flat progress records
    return (data ?? []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      course_id: row.course_id,
      lesson_id: row.lesson_id,
      status: row.status,
      completed_at: row.completed_at,
      score: row.score,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })) as VACLearnerProgress[];
  }

  /**
   * Mark a lesson as completed (upsert).
   * After marking, checks if all lessons are done to auto-complete the enrollment.
   */
  static async markLessonComplete(
    userId: string,
    courseId: string,
    lessonId: string,
    score?: number
  ): Promise<VACLearnerProgress> {
    const supabase = this.getSupabase();

    const now = new Date().toISOString();

    // Upsert: if a progress row already exists for this user+lesson, update it
    const { data: existing, error: findErr } = await supabase
      .from('vac_learner_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('lesson_id', lessonId)
      .maybeSingle();

    if (findErr) throw new Error(findErr.message);

    let progress: VACLearnerProgress;

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from('vac_learner_progress')
        .update({
          status: 'completed',
          completed_at: now,
          score: score ?? null,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      progress = data as VACLearnerProgress;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('vac_learner_progress')
        .insert([
          {
            user_id: userId,
            course_id: courseId,
            lesson_id: lessonId,
            status: 'completed',
            completed_at: now,
            score: score ?? null,
          },
        ])
        .select()
        .single();

      if (error) throw new Error(error.message);
      progress = data as VACLearnerProgress;
    }

    // Check if all lessons in the course are now completed
    await this.maybeAutoCompleteEnrollment(userId, courseId);

    return progress;
  }

  /**
   * If every lesson in the course is completed, mark the enrollment as completed.
   */
  private static async maybeAutoCompleteEnrollment(
    userId: string,
    courseId: string
  ): Promise<void> {
    const supabase = this.getSupabase();

    // Total lesson count for the course
    const { count: totalLessons, error: totalErr } = await supabase
      .from('vac_lessons')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId);

    if (totalErr || !totalLessons || totalLessons === 0) return;

    // Completed lesson count for this user
    const { count: completedLessons, error: compErr } = await supabase
      .from('vac_learner_progress')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'completed');

    if (compErr) return;

    if ((completedLessons ?? 0) >= totalLessons) {
      await supabase
        .from('vac_enrollments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .eq('status', 'active');
    }
  }

  /**
   * Get the completion percentage for a user in a course.
   */
  static async getCourseCompletionPercentage(
    userId: string,
    courseId: string
  ): Promise<number> {
    const supabase = this.getSupabase();

    // Total lessons
    const { count: totalLessons, error: totalErr } = await supabase
      .from('vac_lessons')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId);

    if (totalErr) throw new Error(totalErr.message);

    if (!totalLessons || totalLessons === 0) return 0;

    // Completed by user
    const { count: completedLessons, error: compErr } = await supabase
      .from('vac_learner_progress')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'completed');

    if (compErr) throw new Error(compErr.message);

    return Math.round(((completedLessons ?? 0) / totalLessons) * 100);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return up to 10 active courses mapped to a given programme.
   */
  static async getRecommendedCourses(
    programmeId: string,
    institutionId: string
  ): Promise<VACCourse[]> {
    const supabase = this.getSupabase();

    // Get course IDs mapped to this programme
    const { data: mappings, error: mapErr } = await supabase
      .from('vac_course_programmes')
      .select('course_id')
      .eq('programme_id', programmeId);

    if (mapErr) throw new Error(mapErr.message);

    const courseIds = (mappings ?? []).map((m) => m.course_id);

    if (courseIds.length === 0) return [];

    const { data, error } = await supabase
      .from('vac_courses')
      .select('*')
      .in('id', courseIds)
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('ai_era_strategic_value', { ascending: false, nullsFirst: false })
      .limit(10);

    if (error) throw new Error(error.message);

    return (data ?? []) as VACCourse[];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * High-level overview stats for a given institution.
   */
  static async getOverviewStats(
    institutionId: string
  ): Promise<VACOverviewStats> {
    const supabase = this.getSupabase();

    // ── Courses ───────────────────────────────────────────────────────────

    const { count: totalCourses, error: tcErr } = await supabase
      .from('vac_courses')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId);

    if (tcErr) throw new Error(tcErr.message);

    const { count: activeCourses, error: acErr } = await supabase
      .from('vac_courses')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('is_active', true);

    if (acErr) throw new Error(acErr.message);

    // ── Enrollments — fetched via a join so we scope to institution courses ──

    // Get course IDs for this institution
    const { data: instCourses, error: icErr } = await supabase
      .from('vac_courses')
      .select('id')
      .eq('institution_id', institutionId);

    if (icErr) throw new Error(icErr.message);

    const courseIds = (instCourses ?? []).map((c) => c.id);

    if (courseIds.length === 0) {
      return {
        total_courses: totalCourses ?? 0,
        active_courses: activeCourses ?? 0,
        total_enrollments: 0,
        active_enrollments: 0,
        completed_enrollments: 0,
        total_learners: 0,
        total_revenue: 0,
        avg_completion_rate: 0,
      };
    }

    // Total enrollments
    const { count: totalEnrollments, error: teErr } = await supabase
      .from('vac_enrollments')
      .select('id', { count: 'exact', head: true })
      .in('course_id', courseIds);

    if (teErr) throw new Error(teErr.message);

    // Active enrollments
    const { count: activeEnrollments, error: aeErr } = await supabase
      .from('vac_enrollments')
      .select('id', { count: 'exact', head: true })
      .in('course_id', courseIds)
      .eq('status', 'active');

    if (aeErr) throw new Error(aeErr.message);

    // Completed enrollments
    const { count: completedEnrollments, error: ceErr } = await supabase
      .from('vac_enrollments')
      .select('id', { count: 'exact', head: true })
      .in('course_id', courseIds)
      .eq('status', 'completed');

    if (ceErr) throw new Error(ceErr.message);

    // Distinct learners
    const { data: learnerRows, error: lErr } = await supabase
      .from('vac_enrollments')
      .select('user_id')
      .in('course_id', courseIds);

    if (lErr) throw new Error(lErr.message);

    const uniqueLearners = new Set((learnerRows ?? []).map((r) => r.user_id));

    // Total revenue (sum of payment_amount where payment_status = 'paid')
    const { data: revenueRows, error: rErr } = await supabase
      .from('vac_enrollments')
      .select('payment_amount')
      .in('course_id', courseIds)
      .eq('payment_status', 'paid');

    if (rErr) throw new Error(rErr.message);

    const totalRevenue = (revenueRows ?? []).reduce(
      (sum, r) => sum + (r.payment_amount ?? 0),
      0
    );

    // Avg completion rate
    const total = totalEnrollments ?? 0;
    const completed = completedEnrollments ?? 0;
    const avgCompletionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total_courses: totalCourses ?? 0,
      active_courses: activeCourses ?? 0,
      total_enrollments: total,
      active_enrollments: activeEnrollments ?? 0,
      completed_enrollments: completed,
      total_learners: uniqueLearners.size,
      total_revenue: totalRevenue,
      avg_completion_rate: avgCompletionRate,
    };
  }

  /**
   * Per-course enrollment statistics via RPC function.
   */
  static async getCourseEnrollmentStats(
    institutionId: string
  ): Promise<CourseEnrollmentStats[]> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase.rpc(
      'get_vac_course_enrollment_stats',
      { p_institution_id: institutionId }
    );

    if (error) throw new Error(error.message);

    return (data ?? []) as CourseEnrollmentStats[];
  }

  /**
   * Monthly enrollment and completion trends for the last N months.
   */
  static async getEnrollmentTrends(
    institutionId: string,
    months: number = 12
  ): Promise<VACTrendDataPoint[]> {
    const supabase = this.getSupabase();

    // Get institution course IDs
    const { data: instCourses, error: icErr } = await supabase
      .from('vac_courses')
      .select('id')
      .eq('institution_id', institutionId);

    if (icErr) throw new Error(icErr.message);

    const courseIds = (instCourses ?? []).map((c) => c.id);

    if (courseIds.length === 0) return [];

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const startISO = startDate.toISOString();

    // Fetch enrollments within the date range
    const { data: enrollments, error: eErr } = await supabase
      .from('vac_enrollments')
      .select('enrolled_at, completed_at, payment_amount, payment_status, status')
      .in('course_id', courseIds)
      .gte('enrolled_at', startISO);

    if (eErr) throw new Error(eErr.message);

    // Aggregate by month
    const monthMap = new Map<
      string,
      { enrollments: number; completions: number; revenue: number }
    >();

    // Pre-fill all months so there are no gaps
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, { enrollments: 0, completions: 0, revenue: 0 });
    }

    for (const row of enrollments ?? []) {
      // Enrollment month
      if (row.enrolled_at) {
        const d = new Date(row.enrolled_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const bucket = monthMap.get(key);
        if (bucket) {
          bucket.enrollments += 1;
          if (row.payment_status === 'paid') {
            bucket.revenue += row.payment_amount ?? 0;
          }
        }
      }

      // Completion month
      if (row.completed_at) {
        const d = new Date(row.completed_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const bucket = monthMap.get(key);
        if (bucket) {
          bucket.completions += 1;
        }
      }
    }

    // Convert to sorted array
    const result: VACTrendDataPoint[] = [];
    const sortedKeys = Array.from(monthMap.keys()).sort();
    for (const key of sortedKeys) {
      const bucket = monthMap.get(key)!;
      result.push({
        month: key,
        enrollments: bucket.enrollments,
        completions: bucket.completions,
        revenue: bucket.revenue,
      });
    }

    return result;
  }

  /**
   * Programme-wise enrollment statistics.
   */
  static async getProgrammeStats(
    institutionId: string
  ): Promise<VACProgrammeStats[]> {
    const supabase = this.getSupabase();

    // Get all course-programme mappings for institution courses
    const { data: courses, error: cErr } = await supabase
      .from('vac_courses')
      .select('id')
      .eq('institution_id', institutionId);

    if (cErr) throw new Error(cErr.message);

    const courseIds = (courses ?? []).map((c) => c.id);

    if (courseIds.length === 0) return [];

    // Get programme mappings
    const { data: mappings, error: mErr } = await supabase
      .from('vac_course_programmes')
      .select('course_id, programme_id')
      .in('course_id', courseIds);

    if (mErr) throw new Error(mErr.message);

    if (!mappings || mappings.length === 0) return [];

    // Build a map: programme_id -> Set<course_id>
    const progCoursesMap = new Map<string, Set<string>>();
    for (const m of mappings) {
      if (!progCoursesMap.has(m.programme_id)) {
        progCoursesMap.set(m.programme_id, new Set());
      }
      progCoursesMap.get(m.programme_id)!.add(m.course_id);
    }

    // Get all enrollments for these courses
    const { data: enrollments, error: eErr } = await supabase
      .from('vac_enrollments')
      .select('course_id, user_id, status')
      .in('course_id', courseIds);

    if (eErr) throw new Error(eErr.message);

    // Get programme names
    const programmeIds = Array.from(progCoursesMap.keys());
    const { data: programmes, error: pErr } = await supabase
      .from('programmes')
      .select('id, programme_name')
      .in('id', programmeIds);

    if (pErr) throw new Error(pErr.message);

    const progNameMap = new Map<string, string>();
    for (const p of programmes ?? []) {
      progNameMap.set(p.id, p.programme_name);
    }

    // Aggregate stats per programme
    const result: VACProgrammeStats[] = [];

    for (const [programmeId, programCourseIds] of progCoursesMap.entries()) {
      const relevantEnrollments = (enrollments ?? []).filter((e) =>
        programCourseIds.has(e.course_id)
      );

      const enrolledCount = relevantEnrollments.length;
      const completedCount = relevantEnrollments.filter(
        (e) => e.status === 'completed'
      ).length;
      const cancelledCount = relevantEnrollments.filter(
        (e) => e.status === 'cancelled'
      ).length;

      // "At risk" = active for too long without completion (simplified: active but
      // we track it; a more advanced version would check progress %).
      // For now, count active enrollments that are NOT completed.
      const activeCount = relevantEnrollments.filter(
        (e) => e.status === 'active'
      ).length;

      const avgCompletionPct =
        enrolledCount > 0
          ? Math.round((completedCount / enrolledCount) * 100)
          : 0;

      result.push({
        programme_id: programmeId,
        programme_name: progNameMap.get(programmeId) ?? 'Unknown Programme',
        enrolled_count: enrolledCount,
        completed_count: completedCount,
        at_risk_count: activeCount, // Simplified: active = potential at-risk
        avg_completion_pct: avgCompletionPct,
      });
    }

    // Sort by enrolled count descending
    result.sort((a, b) => b.enrolled_count - a.enrolled_count);

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRAMME MAPPING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all programme mappings for a course.
   */
  static async getCourseProgrammes(
    courseId: string
  ): Promise<VACCourseProgramme[]> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('vac_course_programmes')
      .select('*')
      .eq('course_id', courseId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []) as VACCourseProgramme[];
  }

  /**
   * Replace all programme mappings for a course with a new set.
   */
  static async updateCourseProgrammes(
    courseId: string,
    programmeIds: string[]
  ): Promise<void> {
    const supabase = this.getSupabase();

    // Delete all existing mappings for this course
    const { error: delErr } = await supabase
      .from('vac_course_programmes')
      .delete()
      .eq('course_id', courseId);

    if (delErr) throw new Error(delErr.message);

    // Insert new mappings
    if (programmeIds.length > 0) {
      const mappings = programmeIds.map((programmeId, idx) => ({
        course_id: courseId,
        programme_id: programmeId,
        is_primary: idx === 0,
      }));

      const { error: insErr } = await supabase
        .from('vac_course_programmes')
        .insert(mappings);

      if (insErr) throw new Error(insErr.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // BULK ENROLLMENT
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get eligible learners for bulk enrollment, filtered by programme/semester/section.
   * Returns learners NOT already enrolled in the given course.
   */
  static async getEligibleLearners(
    courseId: string,
    institutionId: string,
    filters: { programme_id?: string; semester_id?: string; section_id?: string }
  ) {
    const supabase = this.getSupabase();

    // Get learners matching filters
    let query = supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, institution_id, program_id, semester_id, section_id')
      .eq('institution_id', institutionId)
      .in('lifecycle_status', ['enrolled', 'active_student', 'confirmed']);

    if (filters.programme_id) {
      query = query.eq('program_id', filters.programme_id);
    }
    if (filters.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }
    if (filters.section_id) {
      query = query.eq('section_id', filters.section_id);
    }

    const { data: learners, error } = await query.order('roll_number', { ascending: true });
    if (error) throw new Error(error.message);
    if (!learners || learners.length === 0) return [];

    // Check which ones are already enrolled
    const learnerIds = learners.map((l: any) => l.id);
    const { data: existingEnrollments } = await supabase
      .from('vac_enrollments')
      .select('user_id')
      .eq('course_id', courseId)
      .in('user_id', learnerIds)
      .in('status', ['active', 'completed']);

    const enrolledSet = new Set((existingEnrollments || []).map((e: any) => e.user_id));

    return learners.map((l: any) => ({
      id: l.id,
      first_name: l.first_name || '',
      last_name: l.last_name || '',
      roll_number: l.roll_number,
      already_enrolled: enrolledSet.has(l.id),
    }));
  }

  /**
   * Bulk enroll multiple learners in a course.
   * Skips already-enrolled learners. Optionally waives fee.
   */
  static async bulkEnroll(input: {
    course_id: string;
    user_ids: string[];
    waive_fee: boolean;
  }) {
    const supabase = this.getSupabase();

    // Get course fee
    const { data: course, error: courseErr } = await supabase
      .from('vac_courses')
      .select('fee')
      .eq('id', input.course_id)
      .single();

    if (courseErr) throw new Error(courseErr.message);

    const fee = Number(course?.fee || 0);
    const paymentStatus = (input.waive_fee || fee === 0) ? 'waived' : 'pending';
    const paymentAmount = (input.waive_fee || fee === 0) ? 0 : fee;

    // Check existing enrollments to skip
    const { data: existing } = await supabase
      .from('vac_enrollments')
      .select('user_id')
      .eq('course_id', input.course_id)
      .in('user_id', input.user_ids)
      .in('status', ['active', 'completed']);

    const alreadyEnrolledSet = new Set((existing || []).map((e: any) => e.user_id));
    const toEnroll = input.user_ids.filter((uid) => !alreadyEnrolledSet.has(uid));

    if (toEnroll.length === 0) {
      return {
        total_eligible: input.user_ids.length,
        enrolled_count: 0,
        skipped_count: 0,
        already_enrolled: alreadyEnrolledSet.size,
        errors: [],
      };
    }

    // Build enrollment records
    const records = toEnroll.map((userId) => ({
      user_id: userId,
      course_id: input.course_id,
      status: 'active',
      payment_status: paymentStatus,
      payment_amount: paymentAmount,
      enrolled_at: new Date().toISOString(),
    }));

    // Insert in batches of 50 to avoid payload limits
    const errors: { user_id: string; name: string; reason: string }[] = [];
    let enrolledCount = 0;
    const batchSize = 50;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error: insertErr, data: inserted } = await supabase
        .from('vac_enrollments')
        .insert(batch)
        .select('id');

      if (insertErr) {
        // If batch fails, try individual inserts
        for (const record of batch) {
          const { error: singleErr } = await supabase
            .from('vac_enrollments')
            .insert(record);

          if (singleErr) {
            if (singleErr.code === '23505') {
              // Duplicate — already enrolled (race condition)
            } else {
              errors.push({
                user_id: record.user_id,
                name: '',
                reason: singleErr.message,
              });
            }
          } else {
            enrolledCount++;
          }
        }
      } else {
        enrolledCount += (inserted?.length || batch.length);
      }
    }

    return {
      total_eligible: input.user_ids.length,
      enrolled_count: enrolledCount,
      skipped_count: input.user_ids.length - enrolledCount - alreadyEnrolledSet.size,
      already_enrolled: alreadyEnrolledSet.size,
      errors,
    };
  }
}
