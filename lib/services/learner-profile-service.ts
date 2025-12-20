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
// Updated: 2025-01-20 - Added created_by and updated_by tracking
// Purpose: Unified service for complete learner lifecycle management
// Replaces: AdmissionService + StudentService
// ============================================

export class LearnerProfileService {
  // ============================================
  // PROFILE COMPLETENESS & VALIDATION
  // ============================================

  /**
   * Calculate profile completeness based on 4 required fields
   * Updated: 2025-01-20 - New completeness criteria
   */
  private static calculateProfileCompleteness(
    profile: Partial<LearnerProfile>
  ): boolean {
    const requiredFields: (keyof LearnerProfile)[] = [
      'college_email',
      'academic_year_id',
      'semester_id',
      'section_id',
    ];

    // All required fields must be present and non-empty
    return requiredFields.every(
      (field) =>
        profile[field] !== null &&
        profile[field] !== undefined &&
        profile[field] !== ''
    );
  }

  /**
   * Validate college email domain
   */
  private static isValidCollegeEmail(email?: string): boolean {
    if (!email) return false;
    return email.toLowerCase().endsWith('@jkkn.ac.in');
  }

  /**
   * Check if profile should auto-activate and trigger user creation
   * Called after every update
   * Updated: 2025-01-20 - Auto-activation logic
   */
  private static async checkAndAutoActivate(
    id: string,
    updatedProfile: LearnerProfile
  ): Promise<LearnerProfile> {
    // Only auto-activate from pre-enrollment statuses
    const preEnrollmentStatuses: LifecycleStatus[] = ['enquiry', 'pending', 'approved'];

    if (!preEnrollmentStatuses.includes(updatedProfile.lifecycle_status as LifecycleStatus)) {
      return updatedProfile; // Already enrolled, no action
    }

    // Check if profile is complete
    const isComplete = this.calculateProfileCompleteness(updatedProfile);

    if (!isComplete) {
      return updatedProfile; // Not ready for activation
    }

    // Validate college email
    if (!this.isValidCollegeEmail(updatedProfile.college_email)) {
      console.warn(`[learner-profile-service] Invalid college email for ${id}`);
      return updatedProfile;
    }

    console.log(`[learner-profile-service] Auto-activating learner ${id}`);

    // Auto-transition to 'active'
    const supabase = createClientSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id;

    const { data: activatedProfile, error } = await supabase
      .from('learners_profiles')
      .update({
        lifecycle_status: 'active',
        is_profile_complete: true,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[learner-profile-service] Error auto-activating learner:', error);
      return updatedProfile;
    }

    // Trigger user creation
    await this.triggerUserCreation(id, activatedProfile);

    return activatedProfile;
  }

  /**
   * Trigger user account creation
   * Updated: 2025-01-20 - User creation trigger
   */
  private static async triggerUserCreation(
    learnerId: string,
    profile: LearnerProfile
  ): Promise<void> {
    if (!profile.college_email) {
      console.warn(`[learner-profile-service] No college email for ${learnerId}, skipping user creation`);
      return;
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/learners/complete-onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learner_id: learnerId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[learner-profile-service] User creation failed for ${learnerId}:`, errorData);
        // Non-blocking error - learner still activated
      } else {
        console.log(`[learner-profile-service] User account created for ${learnerId}`);
      }
    } catch (error) {
      console.error(`[learner-profile-service] Error calling user creation API:`, error);
      // Non-blocking error
    }
  }

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
        batch:batches(id, batch_name, batch_code),
        created_by_user:profiles!created_by(id, email, full_name),
        updated_by_user:profiles!updated_by(id, email, full_name)
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
    const supabase = createClientSupabaseClient();

    // Get current user ID
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id;

    const { data, error } = await supabase
      .from('learners_profiles')
      .insert({
        ...dto,
        lifecycle_status: dto.lifecycle_status || 'enquiry',
        is_profile_complete: dto.is_profile_complete || false,
        migration_source: 'direct', // Mark as directly created (not migrated)
        created_by: currentUserId,
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
   * Updated: 2025-01-20 - Added auto-activation check
   */
  static async updateLearnerProfile(
    id: string,
    dto: UpdateLearnerProfileDto
  ): Promise<LearnerProfile> {
    const supabase = createClientSupabaseClient();

    // Get current user ID
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id;

    const { data, error } = await supabase
      .from('learners_profiles')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[learner-profile-service] Error updating learner profile:', error);
      throw error;
    }

    // ✨ NEW: Check for auto-activation
    const finalProfile = await this.checkAndAutoActivate(id, data);

    return finalProfile;
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

  // ============================================
  // PROMOTION FEATURES
  // ============================================

  /**
   * Bulk promote learners to new semester/section
   * Updated: 2025-01-20 - Added promotion feature
   */
  static async bulkPromoteLearners(
    learnerIds: string[],
    semesterId: string,
    sectionId: string,
    academicYearId?: string,
    onProgress?: (
      current: number,
      total: number,
      success: string[],
      failed: { id: string; error: string }[]
    ) => void
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    const total = learnerIds.length;

    for (let i = 0; i < learnerIds.length; i++) {
      const learnerId = learnerIds[i];

      try {
        const updateData: UpdateLearnerProfileDto = {
          semester_id: semesterId,
          section_id: sectionId,
        };

        if (academicYearId) {
          updateData.academic_year_id = academicYearId;
        }

        await this.updateLearnerProfile(learnerId, updateData);
        success.push(learnerId);

        // Report progress
        if (onProgress) {
          onProgress(i + 1, total, success, failed);
        }
      } catch (error) {
        failed.push({
          id: learnerId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (onProgress) {
          onProgress(i + 1, total, success, failed);
        }
      }
    }

    return { success, failed };
  }

  /**
   * Disable user account (for 'exited' status)
   * Updated: 2025-01-20 - Account management helper
   */
  private static async disableUserAccount(email: string): Promise<void> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/users/manage-auth`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disable',
          email: email,
        }),
      });

      if (!response.ok) {
        console.error(`[learner-profile-service] Failed to disable account for ${email}`);
      }
    } catch (error) {
      console.error(`[learner-profile-service] Error disabling account:`, error);
    }
  }

  /**
   * Enable user account (when leaving 'exited' status)
   * Updated: 2025-01-20 - Account management helper
   */
  private static async enableUserAccount(email: string): Promise<void> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/users/manage-auth`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enable',
          email: email,
        }),
      });

      if (!response.ok) {
        console.error(`[learner-profile-service] Failed to enable account for ${email}`);
      }
    } catch (error) {
      console.error(`[learner-profile-service] Error enabling account:`, error);
    }
  }

  /**
   * Bulk update learner status with account management
   * Updated: 2025-01-20 - Status promotion feature
   */
  static async bulkUpdateStatus(
    learnerIds: string[],
    newStatus: LifecycleStatus,
    onProgress?: (
      current: number,
      total: number,
      success: string[],
      failed: { id: string; error: string }[]
    ) => void
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    const total = learnerIds.length;

    for (let i = 0; i < learnerIds.length; i++) {
      const learnerId = learnerIds[i];

      try {
        // Get current learner to check old status
        const currentLearner = await this.getLearnerProfile(learnerId);
        if (!currentLearner) {
          throw new Error('Learner not found');
        }

        const oldStatus = currentLearner.lifecycle_status;

        // Update status
        await this.updateLearnerProfile(learnerId, {
          lifecycle_status: newStatus,
        });

        // Handle account state changes
        if (currentLearner.college_email) {
          const isBecomingExited = newStatus === 'exited' && oldStatus !== 'exited';
          const isLeavingExited = newStatus !== 'exited' && oldStatus === 'exited';

          if (isBecomingExited) {
            await this.disableUserAccount(currentLearner.college_email);
          } else if (isLeavingExited) {
            await this.enableUserAccount(currentLearner.college_email);
          }
        }

        success.push(learnerId);

        if (onProgress) {
          onProgress(i + 1, total, success, failed);
        }
      } catch (error) {
        failed.push({
          id: learnerId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (onProgress) {
          onProgress(i + 1, total, success, failed);
        }
      }
    }

    return { success, failed };
  }

  /**
   * Get comprehensive dashboard statistics
   * All queries run in parallel for performance
   */
  static async getDashboardStats(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters
  ): Promise<import('@/types/learner-dashboard').LearnerDashboardStats> {
    const supabase = createClientSupabaseClient();

    try {
      // Build base query filters
      let baseQuery = supabase.from('learners_profiles').select('*', { count: 'exact' });

      // Apply filters
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        baseQuery = baseQuery.in('institution_id', filters.institutionIds);
      }

      if (filters.academicYearId) {
        baseQuery = baseQuery.eq('academic_year_id', filters.academicYearId);
      }

      if (filters.degreeId) {
        baseQuery = baseQuery.eq('degree_id', filters.degreeId);
      }

      if (filters.departmentId) {
        baseQuery = baseQuery.eq('department_id', filters.departmentId);
      }

      if (filters.programId) {
        baseQuery = baseQuery.eq('program_id', filters.programId);
      }

      if (filters.semesterId) {
        baseQuery = baseQuery.eq('semester_id', filters.semesterId);
      }

      if (filters.sectionId) {
        baseQuery = baseQuery.eq('section_id', filters.sectionId);
      }

      if (filters.lifecycleStatuses && filters.lifecycleStatuses.length > 0) {
        baseQuery = baseQuery.in('lifecycle_status', filters.lifecycleStatuses);
      }

      if (filters.isProfileComplete !== undefined) {
        baseQuery = baseQuery.eq('is_profile_complete', filters.isProfileComplete);
      }

      if (filters.gender) {
        baseQuery = baseQuery.eq('gender', filters.gender);
      }

      if (filters.dateRange) {
        baseQuery = baseQuery
          .gte('created_at', filters.dateRange.from.toISOString())
          .lte('created_at', filters.dateRange.to.toISOString());
      }

      // Run all queries in parallel
      const [
        allData,
        statusCounts,
        institutionData,
        departmentData,
        programData,
        semesterData,
        sectionData,
        genderData,
        academicYearData,
        enquiriesTrend,
        activationsTrend,
        graduationsTrend
      ] = await Promise.all([
        // 1. Get all data for complex calculations
        baseQuery,

        // 2. Count by status
        this.getCountByStatus(filters),

        // 3. Distribution queries
        this.getDistributionByInstitution(filters),
        this.getDistributionByDepartment(filters),
        this.getDistributionByProgram(filters),
        this.getDistributionBySemester(filters),
        this.getDistributionBySection(filters),
        this.getDistributionByGender(filters),
        this.getDistributionByAcademicYear(filters),

        // 4. Time series queries
        this.getEnquiriesTrend(filters),
        this.getActivationsTrend(filters),
        this.getGraduationsTrend(filters)
      ]);

      if (allData.error) throw allData.error;

      const profiles = allData.data || [];
      const totalCount = allData.count || 0;

      // Calculate overview counts
      const enquiriesCount = profiles.filter(p => p.lifecycle_status === 'enquiry').length;
      const pendingCount = profiles.filter(p => p.lifecycle_status === 'pending').length;
      const approvedCount = profiles.filter(p => p.lifecycle_status === 'approved').length;
      const activeCount = profiles.filter(p => p.lifecycle_status === 'active').length;
      const inactiveCount = profiles.filter(p => p.lifecycle_status === 'inactive').length;
      const graduatedCount = profiles.filter(p => p.lifecycle_status === 'graduated').length;
      const exitedCount = profiles.filter(p => p.lifecycle_status === 'exited').length;

      // Profile completion stats
      const completeProfiles = profiles.filter(p => p.is_profile_complete);
      const incompleteProfiles = profiles.filter(p => !p.is_profile_complete);
      const completionRate = totalCount > 0 ? (completeProfiles.length / totalCount) * 100 : 0;

      // Awaiting activation (complete but not active)
      const awaitingActivation = profiles.filter(
        p => p.is_profile_complete && ['enquiry', 'pending', 'approved'].includes(p.lifecycle_status)
      ).length;

      // Missing fields breakdown
      const missingCollegeEmail = profiles.filter(p => !p.college_email).length;
      const missingAcademicYear = profiles.filter(p => !p.academic_year_id).length;
      const missingSemester = profiles.filter(p => !p.semester_id).length;
      const missingSection = profiles.filter(p => !p.section_id).length;

      // Trends (last 7 and 30 days)
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      const newEnquiries7Days = profiles.filter(p => new Date(p.created_at) >= sevenDaysAgo).length;
      const newEnquiries30Days = profiles.filter(p => new Date(p.created_at) >= thirtyDaysAgo).length;
      const newEnquiries30To60Days = profiles.filter(
        p => new Date(p.created_at) >= sixtyDaysAgo && new Date(p.created_at) < thirtyDaysAgo
      ).length;

      const activations7Days = profiles.filter(
        p => p.lifecycle_status === 'active' && new Date(p.updated_at) >= sevenDaysAgo
      ).length;
      const activations30Days = profiles.filter(
        p => p.lifecycle_status === 'active' && new Date(p.updated_at) >= thirtyDaysAgo
      ).length;
      const activations30To60Days = profiles.filter(
        p => p.lifecycle_status === 'active' &&
        new Date(p.updated_at) >= sixtyDaysAgo &&
        new Date(p.updated_at) < thirtyDaysAgo
      ).length;

      // Calculate percentage changes
      const enquiries7DayChange = this.calculatePercentageChange(newEnquiries7Days, newEnquiries30Days - newEnquiries7Days);
      const enquiries30DayChange = this.calculatePercentageChange(newEnquiries30Days, newEnquiries30To60Days);
      const activations7DayChange = this.calculatePercentageChange(activations7Days, activations30Days - activations7Days);
      const activations30DayChange = this.calculatePercentageChange(activations30Days, activations30To60Days);

      // Conversion metrics
      const convertedToActive = profiles.filter(p => p.lifecycle_status === 'active').length;
      const conversionRate = enquiriesCount > 0 ? (convertedToActive / enquiriesCount) * 100 : 0;

      // Average time to activation (simplified - would need created_at vs status change tracking)
      const activeProfiles = profiles.filter(p => p.lifecycle_status === 'active');
      const avgTimeToActivation = activeProfiles.length > 0
        ? activeProfiles.reduce((sum, p) => {
            const created = new Date(p.created_at).getTime();
            const updated = new Date(p.updated_at).getTime();
            return sum + (updated - created) / (1000 * 60 * 60 * 24);
          }, 0) / activeProfiles.length
        : 0;

      const dropOffAtPending = pendingCount;
      const dropOffAtApproved = approvedCount;

      // Assemble final stats
      const stats: import('@/types/learner-dashboard').LearnerDashboardStats = {
        // Overview
        totalCount,
        enquiriesCount,
        pendingCount,
        approvedCount,
        activeCount,
        inactiveCount,
        graduatedCount,
        exitedCount,

        // Profile completion
        profileCompletion: {
          totalProfiles: totalCount,
          completeProfiles: completeProfiles.length,
          incompleteProfiles: incompleteProfiles.length,
          completionRate,
          awaitingActivation,
          missingCollegeEmail,
          missingAcademicYear,
          missingSemester,
          missingSection
        },

        // Trends
        newEnquiries7Days: {
          current: newEnquiries7Days,
          previous: newEnquiries30Days - newEnquiries7Days,
          change: enquiries7DayChange,
          trend: this.getTrend(enquiries7DayChange)
        },
        newEnquiries30Days: {
          current: newEnquiries30Days,
          previous: newEnquiries30To60Days,
          change: enquiries30DayChange,
          trend: this.getTrend(enquiries30DayChange)
        },
        activations7Days: {
          current: activations7Days,
          previous: activations30Days - activations7Days,
          change: activations7DayChange,
          trend: this.getTrend(activations7DayChange)
        },
        activations30Days: {
          current: activations30Days,
          previous: activations30To60Days,
          change: activations30DayChange,
          trend: this.getTrend(activations30DayChange)
        },

        // Conversion
        conversion: {
          totalEnquiries: enquiriesCount,
          convertedToActive,
          conversionRate,
          averageTimeToActivation: avgTimeToActivation,
          dropOffAtPending,
          dropOffAtApproved
        },

        // Distributions
        byStatus: statusCounts,
        byInstitution: institutionData,
        byDepartment: departmentData,
        byProgram: programData,
        bySemester: semesterData,
        bySection: sectionData,
        byGender: genderData,
        byAcademicYear: academicYearData,

        // Time series
        enquiriesByDate: enquiriesTrend,
        activationsByDate: activationsTrend,
        graduationsByDate: graduationsTrend,

        // Metadata
        generatedAt: new Date().toISOString(),
        filters
      };

      return stats;
    } catch (error) {
      console.error('[learner-profile-service] Error getting dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Helper: Calculate percentage change
   */
  private static calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Helper: Get trend direction
   */
  private static getTrend(change: number): 'up' | 'down' | 'stable' {
    if (change > 5) return 'up';
    if (change < -5) return 'down';
    return 'stable';
  }

  /**
   * Helper: Get count by status
   */
  private static async getCountByStatus(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters
  ): Promise<import('@/types/learner-dashboard').StatusCount[]> {
    const supabase = createClientSupabaseClient();

    let query = supabase.from('learners_profiles').select('lifecycle_status');

    // Apply same filters
    if (filters.institutionIds && filters.institutionIds.length > 0) {
      query = query.in('institution_id', filters.institutionIds);
    }
    // ... apply other filters

    const { data, error } = await query;
    if (error) throw error;

    const profiles = data || [];
    const total = profiles.length;

    const statusGroups = profiles.reduce((acc, p) => {
      acc[p.lifecycle_status] = (acc[p.lifecycle_status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusGroups).map(([status, count]): import('@/types/learner-dashboard').StatusCount => ({
      status: status as import('@/types/learner-profile').LifecycleStatus,
      count: count as number,
      percentage: total > 0 ? ((count as number) / total) * 100 : 0
    }));
  }

  /**
   * Helper: Get distribution by institution
   */
  private static async getDistributionByInstitution(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters
  ): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    const supabase = createClientSupabaseClient();

    let query = supabase
      .from('learners_profiles')
      .select('institution_id, institutions(institution_name)');

    if (filters.institutionIds && filters.institutionIds.length > 0) {
      query = query.in('institution_id', filters.institutionIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const profiles = data || [];
    const total = profiles.length;

    const groups = profiles.reduce((acc, p) => {
      if (p.institution_id) {
        if (!acc[p.institution_id]) {
          acc[p.institution_id] = {
            id: p.institution_id,
            name: (p.institutions as any)?.institution_name || 'Unknown',
            count: 0
          };
        }
        acc[p.institution_id].count++;
      }
      return acc;
    }, {} as Record<string, { id: string; name: string; count: number }>);

    return (Object.values(groups) as Array<{ id: string; name: string; count: number }>).map(
      (item): import('@/types/learner-dashboard').DistributionItem => ({
        id: item.id,
        name: item.name,
        count: item.count,
        percentage: total > 0 ? (item.count / total) * 100 : 0
      })
    );
  }

  // Similar helper methods for other distributions
  private static async getDistributionByDepartment(filters: import('@/types/learner-dashboard').LearnerDashboardFilters): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    // Similar implementation
    return [];
  }

  private static async getDistributionByProgram(filters: import('@/types/learner-dashboard').LearnerDashboardFilters): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    return [];
  }

  private static async getDistributionBySemester(filters: import('@/types/learner-dashboard').LearnerDashboardFilters): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    return [];
  }

  private static async getDistributionBySection(filters: import('@/types/learner-dashboard').LearnerDashboardFilters): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    return [];
  }

  private static async getDistributionByGender(filters: import('@/types/learner-dashboard').LearnerDashboardFilters): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    return [];
  }

  private static async getDistributionByAcademicYear(filters: import('@/types/learner-dashboard').LearnerDashboardFilters): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    return [];
  }

  private static async getEnquiriesTrend(filters: import('@/types/learner-dashboard').LearnerDashboardFilters): Promise<import('@/types/learner-dashboard').TimeSeriesDataPoint[]> {
    return [];
  }

  private static async getActivationsTrend(filters: import('@/types/learner-dashboard').LearnerDashboardFilters): Promise<import('@/types/learner-dashboard').TimeSeriesDataPoint[]> {
    return [];
  }

  private static async getGraduationsTrend(filters: import('@/types/learner-dashboard').LearnerDashboardFilters): Promise<import('@/types/learner-dashboard').TimeSeriesDataPoint[]> {
    return [];
  }
}
