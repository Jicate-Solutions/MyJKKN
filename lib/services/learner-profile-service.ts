import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LearnerProfile,
  CreateLearnerProfileDto,
  UpdateLearnerProfileDto,
  LearnerProfileFilters,
  LearnerProfileListResponse,
  LifecycleStatus,
  StatusTransitionDto,
  EnrollmentDto,
  LearnerDashboardStats,
  LearnerLifecycleFunnel,
} from '@/types/learner-profile';
import { STATUS_TRANSITIONS, REQUIRED_FIELDS_BY_STATUS } from '@/types/learner-profile';

// ============================================
// LEARNER PROFILE SERVICE
// ============================================
// Created: 2025-01-18
// Purpose: Unified service for complete learner lifecycle management
// Replaces: AdmissionService + StudentService
// ============================================

export class LearnerProfileService {
  // ============================================
  // CRUD OPERATIONS
  // ============================================

  /**
   * Get single learner profile by ID
   */
  static async getLearnerProfile(id: string): Promise<LearnerProfile | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learners_profiles')
      .select(
        `
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name, semester_code),
        section:sections(id, section_name),
        academic_year:academic_years(id, academic_year_name, start_date, end_date, is_active),
        regulation:regulations(id, regulation_code, regulation_year),
        batch:batches(id, batch_name, batch_code)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[learner-profile-service] Error fetching learner profile:', error);
      throw error;
    }

    return data;
  }

  /**
   * Get learner profile by application ID
   */
  static async getLearnerByApplicationId(applicationId: string): Promise<LearnerProfile | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learners_profiles')
      .select('*')
      .eq('application_id', applicationId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      console.error('[learner-profile-service] Error fetching by application ID:', error);
      throw error;
    }

    return data;
  }

  /**
   * List learner profiles with filters and pagination
   */
  static async getLearnerProfiles(
    filters: LearnerProfileFilters = {}
  ): Promise<LearnerProfileListResponse> {
    const supabase = createClientSupabaseClient();
    const {
      search,
      lifecycle_status,
      institution_id,
      degree_id,
      department_id,
      program_id,
      semester_id,
      section_id,
      academic_year_id,
      gender,
      entry_type,
      is_profile_complete,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = filters;

    let query = supabase
      .from('learners_profiles')
      .select(
        `
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name, semester_code),
        section:sections(id, section_name),
        academic_year:academic_years(id, academic_year_name, is_active)
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,application_id.ilike.%${search}%,roll_number.ilike.%${search}%,student_mobile.ilike.%${search}%,student_email.ilike.%${search}%`
      );
    }

    if (lifecycle_status) {
      if (Array.isArray(lifecycle_status)) {
        query = query.in('lifecycle_status', lifecycle_status);
      } else {
        query = query.eq('lifecycle_status', lifecycle_status);
      }
    }

    if (institution_id) query = query.eq('institution_id', institution_id);
    if (degree_id) query = query.eq('degree_id', degree_id);
    if (department_id) query = query.eq('department_id', department_id);
    if (program_id) query = query.eq('program_id', program_id);
    if (semester_id) query = query.eq('semester_id', semester_id);
    if (section_id) query = query.eq('section_id', section_id);
    if (academic_year_id) query = query.eq('academic_year_id', academic_year_id);
    if (gender) query = query.eq('gender', gender);
    if (entry_type) query = query.eq('entry_type', entry_type);

    if (typeof is_profile_complete === 'boolean') {
      query = query.eq('is_profile_complete', is_profile_complete);
    }

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[learner-profile-service] Error listing learner profiles:', error);
      throw error;
    }

    return {
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Create new learner profile
   */
  static async createLearnerProfile(dto: CreateLearnerProfileDto): Promise<LearnerProfile> {
    const { data, error } = await createClientSupabaseClient()
      .from('learners_profiles')
      .insert({
        ...dto,
        lifecycle_status: dto.lifecycle_status || 'enquiry',
        is_profile_complete: dto.is_profile_complete || false,
        migration_source: 'direct', // Mark as directly created (not migrated)
      })
      .select()
      .single();

    if (error) {
      console.error('[learner-profile-service] Error creating learner profile:', error);
      throw error;
    }

    return data;
  }

  /**
   * Update learner profile
   */
  static async updateLearnerProfile(
    id: string,
    dto: UpdateLearnerProfileDto
  ): Promise<LearnerProfile> {
    const { data, error } = await createClientSupabaseClient()
      .from('learners_profiles')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[learner-profile-service] Error updating learner profile:', error);
      throw error;
    }

    return data;
  }

  /**
   * Delete learner profile (soft delete recommended)
   */
  static async deleteLearnerProfile(id: string): Promise<void> {
    const { error } = await createClientSupabaseClient().from('learners_profiles').delete().eq('id', id);

    if (error) {
      console.error('[learner-profile-service] Error deleting learner profile:', error);
      throw error;
    }
  }

  /**
   * Bulk delete learner profiles
   * Returns success and failed deletions for partial failure handling
   */
  static async bulkDeleteLearnerProfiles(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteLearnerProfile(id);
        success.push(id);
      } catch (error) {
        console.error(`[learner-profile-service] Error deleting learner ${id}:`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { success, failed };
  }

  // ============================================
  // LIFECYCLE STATUS MANAGEMENT
  // ============================================

  /**
   * Update lifecycle status with validation
   */
  static async updateLifecycleStatus(
    id: string,
    transition: StatusTransitionDto
  ): Promise<LearnerProfile> {
    // Get current profile
    const profile = await this.getLearnerProfile(id);
    if (!profile) {
      throw new Error(`Learner profile ${id} not found`);
    }

    // Validate transition
    const currentStatus = profile.lifecycle_status as LifecycleStatus;
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(transition.new_status)) {
      throw new Error(
        `Invalid status transition: ${currentStatus} → ${transition.new_status}. ` +
          `Allowed: ${allowedTransitions.join(', ')}`
      );
    }

    // Validate required fields for new status
    const requiredFields = REQUIRED_FIELDS_BY_STATUS[transition.new_status];
    const missingFields = requiredFields.filter((field) => !profile[field as keyof LearnerProfile]);

    if (missingFields.length > 0) {
      throw new Error(
        `Cannot transition to ${transition.new_status}. Missing required fields: ${missingFields.join(', ')}`
      );
    }

    // Update status
    return this.updateLearnerProfile(id, {
      lifecycle_status: transition.new_status,
    });
  }

  /**
   * Enroll learner (pending/approved → active)
   */
  static async enrollLearner(id: string, enrollment: EnrollmentDto): Promise<LearnerProfile> {
    // First update to active with enrollment details
    const profile = await this.updateLearnerProfile(id, {
      lifecycle_status: 'active',
      semester_id: enrollment.semester_id,
      section_id: enrollment.section_id,
      academic_year_id: enrollment.academic_year_id,
      regulation_id: enrollment.regulation_id,
      batch_id: enrollment.batch_id,
      roll_number: enrollment.roll_number,
      college_email: enrollment.college_email,
    });

    return profile;
  }

  /**
   * Graduate learner (active → graduated)
   */
  static async graduateLearner(id: string): Promise<LearnerProfile> {
    return this.updateLifecycleStatus(id, {
      new_status: 'graduated',
      reason: 'Successfully completed program',
    });
  }

  // ============================================
  // ANALYTICS & DASHBOARD
  // ============================================

  /**
   * Get lifecycle funnel analytics
   */
  static async getLifecycleFunnel(institutionId?: string): Promise<LearnerLifecycleFunnel> {
    let query = createClientSupabaseClient().from('learners_profiles').select('lifecycle_status', { count: 'exact' });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    // Get counts by status
    const statusCounts: Record<LifecycleStatus, number> = {
      enquiry: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      waitlisted: 0,
      active: 0,
      inactive: 0,
      exited: 0,
      graduated: 0,
      alumni: 0,
    };

    const { data } = await query;
    if (data) {
      data.forEach((row) => {
        const status = row.lifecycle_status as LifecycleStatus;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
    }

    // Calculate conversion rates
    const total_enquiries = statusCounts.enquiry + statusCounts.pending + statusCounts.approved + statusCounts.active + statusCounts.graduated + statusCounts.alumni;
    const total_applications = total_enquiries - statusCounts.enquiry;
    const total_approved = statusCounts.approved + statusCounts.active + statusCounts.graduated + statusCounts.alumni;
    const total_enrolled = statusCounts.active + statusCounts.graduated + statusCounts.alumni;
    const total_graduated = statusCounts.graduated + statusCounts.alumni;

    return {
      enquiries: statusCounts.enquiry,
      pending_applications: statusCounts.pending,
      approved_applications: statusCounts.approved,
      active_students: statusCounts.active,
      graduates: statusCounts.graduated,
      alumni: statusCounts.alumni,

      enquiry_to_application_rate: total_enquiries > 0 ? (total_applications / total_enquiries) * 100 : 0,
      application_to_approval_rate: total_applications > 0 ? (total_approved / total_applications) * 100 : 0,
      approval_to_enrollment_rate: total_approved > 0 ? (total_enrolled / total_approved) * 100 : 0,
      enrollment_to_graduation_rate: total_enrolled > 0 ? (total_graduated / total_enrolled) * 100 : 0,

      rejected: statusCounts.rejected,
      waitlisted: statusCounts.waitlisted,
      inactive: statusCounts.inactive,
      exited: statusCounts.exited,
    };
  }

  /**
   * Get dashboard statistics
   */
  static async getDashboardStats(institutionId?: string): Promise<LearnerDashboardStats> {
    // Get lifecycle funnel
    const lifecycle_funnel = await this.getLifecycleFunnel(institutionId);

    // Get overview stats
    let countQuery = createClientSupabaseClient()
      .from('learners_profiles')
      .select('lifecycle_status, is_profile_complete', { count: 'exact' });

    if (institutionId) {
      countQuery = countQuery.eq('institution_id', institutionId);
    }

    const { data: profiles, count: total_learners } = await countQuery;

    const by_status: Record<LifecycleStatus, number> = {
      enquiry: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      waitlisted: 0,
      active: 0,
      inactive: 0,
      exited: 0,
      graduated: 0,
      alumni: 0,
    };

    let completed_profiles = 0;

    profiles?.forEach((profile) => {
      const status = profile.lifecycle_status as LifecycleStatus;
      by_status[status] = (by_status[status] || 0) + 1;
      if (profile.is_profile_complete) completed_profiles++;
    });

    const profile_completion_rate =
      total_learners && total_learners > 0 ? (completed_profiles / total_learners) * 100 : 0;

    return {
      overview: {
        total_learners: total_learners || 0,
        by_status,
        profile_completion_rate,
      },
      lifecycle_funnel,
      registration_trends: [], // TODO: Implement
      institution_stats: [], // TODO: Implement
      department_stats: [], // TODO: Implement
      demographic_stats: {
        gender: [],
        entry_type: [],
        accommodation_type: [],
        age_groups: [],
      },
    };
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  /**
   * Bulk update learner profiles
   */
  static async bulkUpdateLearners(
    updates: Array<{ id: string } & UpdateLearnerProfileDto>
  ): Promise<{ success: string[]; failed: Array<{ id: string; error: string }> }> {
    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const update of updates) {
      try {
        const { id, ...dto } = update;
        await this.updateLearnerProfile(id, dto);
        success.push(id);
      } catch (error) {
        failed.push({
          id: update.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { success, failed };
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Generate application ID (JKKN-YYYY-####)
   */
  static async generateApplicationId(institutionId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JKKN-${year}-`;

    // Get count of applications this year
    const { count } = await createClientSupabaseClient()
      .from('learners_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .gte('created_at', `${year}-01-01`)
      .lt('created_at', `${year + 1}-01-01`);

    const nextNumber = (count || 0) + 1;
    const paddedNumber = String(nextNumber).padStart(4, '0');

    return `${prefix}${paddedNumber}`;
  }

  /**
   * Check if learner can transition to status
   */
  static canTransitionTo(currentStatus: LifecycleStatus, newStatus: LifecycleStatus): boolean {
    return STATUS_TRANSITIONS[currentStatus].includes(newStatus);
  }

  /**
   * Get missing required fields for status
   */
  static getMissingRequiredFields(
    profile: Partial<LearnerProfile>,
    targetStatus: LifecycleStatus
  ): string[] {
    const requiredFields = REQUIRED_FIELDS_BY_STATUS[targetStatus];
    return requiredFields.filter((field) => !profile[field as keyof LearnerProfile]);
  }
}
