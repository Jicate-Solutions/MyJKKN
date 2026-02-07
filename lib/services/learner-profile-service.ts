import { createClientSupabaseClient } from '@/lib/supabase/client';
import { trackUsage } from '@/lib/utils/track-usage';
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
import type {
  LearnerProfileWithRelations,
  LearnerProfileWithAcademic,
  UserProfile,
  LearnerStatsRow,
} from '@/types/learner-profile-queries';

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
   * Updated: 2025-01-21 - Added user creation status return
   *
   * Auto-activation: Only from 'approved' → 'active'
   * User creation: Any 'active' status with complete profile
   */
  private static async checkAndAutoActivate(
    id: string,
    updatedProfile: LearnerProfile
  ): Promise<{ profile: LearnerProfile; userCreation?: { success: boolean; message: string } }> {
    const isComplete = this.calculateProfileCompleteness(updatedProfile);
    const hasValidEmail = this.isValidCollegeEmail(updatedProfile.college_email);

    // ============================================
    // PART 1: Auto-activation (ONLY from 'approved' status)
    // ============================================
    if (updatedProfile.lifecycle_status === 'approved') {
      // Check if profile is ready for auto-activation
      if (!isComplete || !hasValidEmail) {
        console.log(`[learner-profile-service] Profile not ready for auto-activation: ${id}`);
        return { profile: updatedProfile };
      }

      console.log(`[learner-profile-service] Auto-activating learner from approved: ${id}`);

      // Auto-transition to 'active'
      const supabase = createClientSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;

      const updateQuery: any = supabase.from('learners_profiles');
      const { data: activatedProfile, error } = await updateQuery
        .update({
          lifecycle_status: 'active' as LifecycleStatus,
          is_profile_complete: true,
          updated_at: new Date().toISOString(),
          updated_by: currentUserId,
        })
        .eq('id', id)
        .select()
        .single() as { data: LearnerProfile | null; error: any };

      if (error) {
        console.error('[learner-profile-service] Error auto-activating learner:', error);
        return { profile: updatedProfile };
      }

      // Update profile reference for Part 2
      updatedProfile = activatedProfile;
    }

    // ============================================
    // PART 2: User creation (for ANY 'active' status)
    // ============================================
    let userCreationResult;
    if (updatedProfile.lifecycle_status === 'active') {
      // Check if ready for user creation
      if (isComplete && hasValidEmail) {
        console.log(`[learner-profile-service] Triggering user creation for active learner: ${id}`);
        userCreationResult = await this.triggerUserCreation(id, updatedProfile);
      } else {
        console.log(`[learner-profile-service] Active learner not ready for user creation: ${id}`);
      }
    }

    return { profile: updatedProfile, userCreation: userCreationResult };
  }

  /**
   * Trigger user account creation or reactivation
   * Updated: 2025-01-22 - Check for existing user and reactivate instead of creating duplicate
   * Updated: 2025-01-21 - Added toast notification for user creation
   */
  private static async triggerUserCreation(
    learnerId: string,
    profile: LearnerProfile
  ): Promise<{ success: boolean; message: string }> {
    if (!profile.college_email) {
      console.warn(`[learner-profile-service] No college email for ${learnerId}, skipping user creation`);
      return { success: false, message: 'No college email provided' };
    }

    const supabase = createClientSupabaseClient();

    try {
      // First, check if a user profile already exists for this email
      const { data: existingProfile, error: profileCheckError } = (await supabase
        .from('profiles')
        .select('id, is_active, email')
        .eq('email', profile.college_email)
        .maybeSingle()) as { data: UserProfile | null; error: any };

      if (profileCheckError) {
        console.error('[learner-profile-service] Error checking for existing profile:', profileCheckError);
        // Continue to user creation attempt
      }

      // If profile already exists, reactivate it instead of creating a new one
      if (existingProfile) {
        console.log(`[learner-profile-service] User profile already exists for ${profile.college_email}`);

        // Check if it's already active
        if (existingProfile.is_active) {
          console.log(`[learner-profile-service] User profile already active for ${profile.college_email}`);
          return {
            success: true,
            message: `User account already active for ${profile.first_name} ${profile.last_name || ''}`
          };
        }

        // Reactivate the existing profile
        const updateQuery: any = supabase.from('profiles');
        const { error: updateError } = await updateQuery
          .update({ is_active: true })
          .eq('id', existingProfile.id);

        if (updateError) {
          console.error('[learner-profile-service] Error reactivating profile:', updateError);
          return { success: false, message: 'Failed to reactivate user account' };
        }

        console.log(`[learner-profile-service] Reactivated user account for ${profile.college_email}`);
        return {
          success: true,
          message: `User account reactivated for ${profile.first_name} ${profile.last_name || ''} (${profile.college_email})`
        };
      }

      // No existing profile - create a new user account
      console.log(`[learner-profile-service] Creating new user account for ${profile.college_email}`);
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/learners/complete-onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learner_id: learnerId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[learner-profile-service] User creation failed for ${learnerId}:`, errorData);
        return { success: false, message: errorData.error || 'User creation failed' };
      } else {
        const result = await response.json();
        console.log(`[learner-profile-service] User account created for ${learnerId}`);
        return {
          success: true,
          message: `User account created successfully for ${profile.first_name} ${profile.last_name || ''} (${profile.college_email})`
        };
      }
    } catch (error) {
      console.error(`[learner-profile-service] Error in triggerUserCreation:`, error);
      return { success: false, message: 'Error connecting to user creation service' };
    }
  }

  /**
   * Sync profile with learner data (ENHANCED)
   * Updated: 2026-01-28 - Fixed email sync and added comprehensive field sync
   *
   * Syncs the following fields from learner to profile:
   * - email (from college_email)
   * - role (always 'student')
   * - is_active (based on lifecycle_status)
   * - learner_id (link to learner record)
   * - institution_id, department_id (organizational context)
   *
   * Lookup Strategy:
   * 1. Try to find profile by email (learnerProfile.college_email)
   * 2. If not found, try by learner_id link (handles email changes)
   * 3. If still not found, skip sync (no profile exists yet)
   */
  private static async syncProfileStatus(
    learnerId: string,
    learnerProfile: LearnerProfile
  ): Promise<void> {
    // Only sync if learner has college_email (no email = no user profile)
    if (!learnerProfile.college_email) {
      console.log(`[learner-profile-service] No college email for ${learnerId}, skipping profile sync`);
      return;
    }

    const supabase = createClientSupabaseClient();

    try {
      // STEP 1: Find profile by email (NEW email after update)
      let profile: UserProfile | null = null;
      let lookupMethod = '';

      const { data: profileByEmail, error: emailError } = (await supabase
        .from('profiles')
        .select('id, email, role, is_active, learner_id, institution_id, department_id')
        .eq('email', learnerProfile.college_email)
        .maybeSingle()) as { data: UserProfile | null; error: any };

      if (emailError) {
        console.error('[learner-profile-service] Error finding profile by email:', emailError);
        return;
      }

      if (profileByEmail) {
        profile = profileByEmail;
        lookupMethod = 'email';
      } else {
        // STEP 2: Fallback - Find profile by learner_id (handles email changes)
        console.log(`[learner-profile-service] Profile not found by email ${learnerProfile.college_email}, trying learner_id lookup`);

        const { data: profileByLearnerId, error: learnerIdError } = (await supabase
          .from('profiles')
          .select('id, email, role, is_active, learner_id, institution_id, department_id')
          .eq('learner_id', learnerId)
          .maybeSingle()) as { data: UserProfile | null; error: any };

        if (learnerIdError) {
          console.error('[learner-profile-service] Error finding profile by learner_id:', learnerIdError);
          return;
        }

        if (profileByLearnerId) {
          profile = profileByLearnerId;
          lookupMethod = 'learner_id';
        }
      }

      // STEP 3: If no profile found by either method, skip sync
      if (!profile) {
        console.log(`[learner-profile-service] No profile found for learner ${learnerId} (email: ${learnerProfile.college_email}), skipping sync`);
        return;
      }

      // STEP 4: Determine what needs to be updated
      const updates: Record<string, any> = {};

      // Check email (handles email changes from old -> new)
      if (profile.email !== learnerProfile.college_email) {
        updates.email = learnerProfile.college_email;
        console.log(`[learner-profile-service] Email change detected: ${profile.email} → ${learnerProfile.college_email}`);
      }

      // Role check removed - roles are now managed via user_roles table (multi-role support)

      // Check is_active (based on lifecycle_status)
      const shouldBeActive = learnerProfile.lifecycle_status === 'active';
      if (profile.is_active !== shouldBeActive) {
        updates.is_active = shouldBeActive;
        console.log(`[learner-profile-service] Status sync needed: is_active=${profile.is_active} → ${shouldBeActive} (lifecycle_status: ${learnerProfile.lifecycle_status})`);
      }

      // Check learner_id link (ensure profile is linked to learner)
      const profileAny = profile as any;
      if (!profileAny.learner_id || profileAny.learner_id !== learnerId) {
        updates.learner_id = learnerId;
        console.log(`[learner-profile-service] Learner link needed: ${profileAny.learner_id || 'null'} → ${learnerId}`);
      }

      // Check institution_id
      if (learnerProfile.institution_id && profileAny.institution_id !== learnerProfile.institution_id) {
        updates.institution_id = learnerProfile.institution_id;
      }

      // Check department_id
      if (learnerProfile.department_id && profileAny.department_id !== learnerProfile.department_id) {
        updates.department_id = learnerProfile.department_id;
      }

      // STEP 5: Apply updates if any changes needed
      if (Object.keys(updates).length > 0) {
        console.log(`[learner-profile-service] Syncing profile (found by ${lookupMethod}):`, {
          profileId: profile.id,
          learnerId,
          changes: Object.keys(updates),
          updates
        });

        const updateQuery: any = supabase.from('profiles');
        const { error: updateError } = await updateQuery
          .update({
            ...updates,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id);

        if (updateError) {
          console.error('[learner-profile-service] Error updating profile:', updateError);
        } else {
          console.log(`[learner-profile-service] ✓ Successfully synced ${Object.keys(updates).length} field(s) for profile ${profile.id}`);
        }
      } else {
        console.log(`[learner-profile-service] ✓ Profile already in sync (found by ${lookupMethod}), no updates needed`);
      }
    } catch (error) {
      console.error('[learner-profile-service] Error in syncProfileStatus:', error);
      // Don't throw - profile sync is not critical for learner update
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

    // Type assertion: migration_source is stored as string but should be typed as MigrationSource
    return data as LearnerProfile;
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

    // Type assertion: migration_source is stored as string but should be typed as MigrationSource
    return data as LearnerProfile | null;
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
      ids,
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
    if (ids && ids.length > 0) {
      query = query.in('id', ids);
    }

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
      // Type assertion: migration_source is stored as string but should be typed as MigrationSource
      data: (data || []) as LearnerProfile[],
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

    const insertQuery: any = supabase.from('learners_profiles');
    const { data, error } = await insertQuery
      .insert({
        ...dto,
        lifecycle_status: (dto.lifecycle_status || 'enquiry') as LifecycleStatus,
        is_profile_complete: dto.is_profile_complete || false,
        migration_source: 'direct' as const, // Mark as directly created (not migrated)
        created_by: currentUserId,
      })
      .select()
      .single() as { data: LearnerProfile | null; error: any };

    if (error) {
      console.error('[learner-profile-service] Error creating learner profile:', error);
      throw error;
    }

    trackUsage({ module: 'learners', feature: 'create_learner_profile', eventType: 'create' });
    return data;
  }

  /**
   * Update learner profile
   * Updated: 2025-01-21 - Calculate is_profile_complete before auto-activation check
   */
  static async updateLearnerProfile(
    id: string,
    dto: UpdateLearnerProfileDto
  ): Promise<LearnerProfile> {
    const supabase = createClientSupabaseClient();

    // Get current user ID
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id;

    // Validate college_email uniqueness before update (prevents cryptic DB constraint errors)
    if (dto.college_email) {
      const { data: existingLearner } = await supabase
        .from('learners_profiles')
        .select('id, first_name, last_name')
        .eq('college_email', dto.college_email)
        .neq('id', id)
        .maybeSingle() as { data: any; error: any };

      if (existingLearner) {
        throw new Error(
          `Email "${dto.college_email}" is already assigned to another learner: ${existingLearner.first_name} ${existingLearner.last_name || ''}`.trim()
        );
      }

      // Also check profiles table for non-pre-registered profiles with this email
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, full_name, learner_id')
        .eq('email', dto.college_email)
        .eq('is_pre_registered', false)
        .maybeSingle() as { data: any; error: any };

      // Only block if the profile belongs to a DIFFERENT learner
      if (existingProfile && existingProfile.learner_id !== id) {
        throw new Error(
          `Email "${dto.college_email}" is already in use by another user${existingProfile.full_name ? ': ' + existingProfile.full_name : ''}`
        );
      }
    }

    // First update with provided DTO
    const updateQuery: any = supabase.from('learners_profiles');
    const { data: updatedData, error: updateError } = await updateQuery
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId,
      })
      .eq('id', id)
      .select()
      .single() as { data: LearnerProfile | null; error: any };

    if (updateError || !updatedData) {
      console.error('[learner-profile-service] Error updating learner profile:', updateError);
      throw updateError || new Error('No data returned from update');
    }

    // Calculate profile completeness
    const isComplete = this.calculateProfileCompleteness(updatedData);

    // Update is_profile_complete flag if it changed
    if (updatedData.is_profile_complete !== isComplete) {
      const flagUpdateQuery: any = supabase.from('learners_profiles');
      const { data: profileWithFlag, error: flagError } = await flagUpdateQuery
        .update({
          is_profile_complete: isComplete,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single() as { data: LearnerProfile | null; error: any };

      if (flagError) {
        console.error('[learner-profile-service] Error updating is_profile_complete flag:', flagError);
        // Continue with original data, not a critical error
      } else {
        updatedData.is_profile_complete = isComplete;
      }
    }

    // Check for auto-activation and user creation
    const result = await this.checkAndAutoActivate(id, updatedData);

    // Sync profile is_active status based on lifecycle_status
    // This ensures user can only log in when learner status is 'active'
    await this.syncProfileStatus(id, result.profile);

    // Store user creation result in metadata (will be used by mutation hook)
    if (result.userCreation) {
      // @ts-expect-error - Temporary storage for toast notification
      result.profile._userCreation = result.userCreation;
    }

    return result.profile;
  }

  /**
   * Delete learner profile and associated user profile
   * Also deletes the user's auth account if a profile exists
   */
  static async deleteLearnerProfile(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    try {
      // First, get the learner to find out if they have a college_email
      const learner = await this.getLearnerProfile(id);

      // If learner doesn't exist, return early (already deleted)
      if (!learner) {
        console.log(`[learner-profile-service] Learner ${id} not found - may already be deleted`);
        return;
      }

      // If there is a college_email, try to delete the associated profile
      if (learner.college_email) {
        try {
          // Find the profile associated with the college_email
          const { data: profile, error: profileError } = (await supabase
            .from('profiles')
            .select('id')
            .eq('email', learner.college_email)
            .maybeSingle()) as { data: { id: string } | null; error: any };

          if (!profileError && profile) {
            // Delete the profile using the API endpoint (which handles auth table deletion too)
            const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
            const response = await fetch(`${baseUrl}/api/users/${profile.id}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json'
              }
            });

            if (!response.ok) {
              console.warn(
                `[learner-profile-service] Failed to delete user profile for learner ${id}:`,
                await response.text()
              );
            } else {
              console.log(
                `[learner-profile-service] Successfully deleted user for learner with email ${learner.college_email}`
              );
            }
          }
        } catch (profileError) {
          console.warn(
            '[learner-profile-service] Error finding or deleting learner user profile:',
            profileError
          );
          // Continue with learner deletion even if profile deletion fails
        }
      }

      // Delete the learner record
      const { error } = await supabase
        .from('learners_profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      console.log(`[learner-profile-service] Successfully deleted learner record: ${id}`);
    } catch (error) {
      console.error('[learner-profile-service] Error deleting learner record:', error);
      throw error; // Re-throw to let calling component handle the error toast
    }
  }

  /**
   * Bulk delete learner profiles
   * Returns success and failed deletions for partial failure handling
   * @param ids - Array of learner profile IDs to delete
   * @param onProgress - Optional callback to report progress (current, total, currentId)
   */
  static async bulkDeleteLearnerProfiles(
    ids: string[],
    onProgress?: (current: number, total: number, currentId: string) => void
  ): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];

      // Report progress
      if (onProgress) {
        onProgress(i + 1, ids.length, id);
      }

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

    trackUsage({ module: 'learners', feature: 'enroll_learner', eventType: 'update' });
    return profile;
  }

  /**
   * Graduate learner (active → graduated)
   */
  static async graduateLearner(id: string): Promise<LearnerProfile> {
    const result = await this.updateLifecycleStatus(id, {
      new_status: 'graduated',
      reason: 'Successfully completed program',
    });
    trackUsage({ module: 'learners', feature: 'graduate_learner', eventType: 'update' });
    return result;
  }

  // ============================================
  // ANALYTICS & DASHBOARD
  // ============================================

  /**
   * Get lifecycle funnel analytics
   */
  static async getLifecycleFunnel(institutionId?: string): Promise<LearnerLifecycleFunnel> {
    let query = createClientSupabaseClient()
      .from('learners_profiles')
      .select('lifecycle_status', { count: 'exact' });

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
      (data as { lifecycle_status: LifecycleStatus }[]).forEach((row) => {
        const status = row.lifecycle_status;
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

    trackUsage({ module: 'learners', feature: 'bulk_promote_learners', eventType: 'update', metadata: { total: learnerIds.length, success: success.length, failed: failed.length } });
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
   *
   * @param filters - Dashboard filters
   * @param supabaseClient - Optional Supabase client (for server-side usage)
   */
  static async getDashboardStats(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').LearnerDashboardStats> {
    const supabase = supabaseClient || createClientSupabaseClient();

    try {
      // Build base query filters
      // NOTE: Supabase default limit is 1000 rows. For analytics, we need all records.
      let baseQuery = supabase
        .from('learners_profiles')
        .select('*', { count: 'exact' });

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

      // REMOVED: lifecycle_status filter from base COUNT query
      // This is now handled by the optimized RPC function get_learners_count_by_status
      // Keeping this here was causing enum type errors

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

      // OPTIMIZED: Use COUNT query instead of fetching all records
      // This prevents timeout errors when there are thousands of records
      const { count: totalCount, error: countError } = await baseQuery;

      if (countError) throw countError;

      console.log('[learners/analytics] Total count from query:', totalCount);

      // Run all queries in parallel with error resilience
      // Each query wrapped in try-catch so one failure doesn't break the entire dashboard
      const safeQuery = async (fn: Promise<any>, defaultValue: any, name: string) => {
        try {
          return await fn;
        } catch (error) {
          console.error(`[learners/analytics] Error in ${name}:`, error);
          return defaultValue;
        }
      };

      const [
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
        graduationsTrend,
        stateData,
        districtData,
        ageData,
        religionData,
        communityData,
        entryTypeData,
        accommodationData,
        completionTiers,
        hierarchicalInstitutionsData
      ] = await Promise.all([
        // 1. Count by status (OPTIMIZED: RPC function)
        safeQuery(this.getCountByStatus(filters, supabase), [], 'getCountByStatus'),

        // 2. Distribution queries (OPTIMIZED: RPC functions)
        safeQuery(this.getDistributionByInstitution(filters, supabase), [], 'getDistributionByInstitution'),
        safeQuery(this.getDistributionByDepartment(filters, supabase), [], 'getDistributionByDepartment'),
        safeQuery(this.getDistributionByProgram(filters, supabase), [], 'getDistributionByProgram'),
        safeQuery(this.getDistributionBySemester(filters, supabase), [], 'getDistributionBySemester'),
        safeQuery(this.getDistributionBySection(filters, supabase), [], 'getDistributionBySection'),
        safeQuery(this.getDistributionByGender(filters, supabase), [], 'getDistributionByGender'),
        safeQuery(this.getDistributionByAcademicYear(filters, supabase), [], 'getDistributionByAcademicYear'),

        // 3. Time series queries
        safeQuery(this.getEnquiriesTrend(filters, supabase), [], 'getEnquiriesTrend'),
        safeQuery(this.getActivationsTrend(filters, supabase), [], 'getActivationsTrend'),
        safeQuery(this.getGraduationsTrend(filters, supabase), [], 'getGraduationsTrend'),

        // 4. Geographic distributions
        safeQuery(this.getDistributionByState(filters, supabase), [], 'getDistributionByState'),
        safeQuery(this.getDistributionByDistrict(filters, supabase), [], 'getDistributionByDistrict'),

        // 5. Demographic distributions
        safeQuery(this.getDistributionByAge(filters, supabase), [], 'getDistributionByAge'),
        safeQuery(this.getDistributionByReligion(filters, supabase), [], 'getDistributionByReligion'),
        safeQuery(this.getDistributionByCommunity(filters, supabase), [], 'getDistributionByCommunity'),
        safeQuery(this.getDistributionByEntryType(filters, supabase), [], 'getDistributionByEntryType'),
        safeQuery(this.getDistributionByAccommodationType(filters, supabase), [], 'getDistributionByAccommodationType'),

        // 6. Profile completion tiers
        safeQuery(this.getProfileCompletionTiers(filters, supabase), { excellent: 0, good: 0, needsWork: 0, critical: 0 }, 'getProfileCompletionTiers'),

        // 7. Hierarchical organizational data (for Organizational tab)
        safeQuery(this.getHierarchicalInstitutions(filters, supabase), [], 'getHierarchicalInstitutions')
      ]);

      // DEBUG: Log counts by status
      console.log('[learners/analytics] Total count:', totalCount);

      // Calculate overview counts from statusCounts query instead of limited profiles array
      // This fixes the issue where only 1000 profiles were being fetched
      const enquiriesCount = statusCounts.find(s => s.status === 'enquiry')?.count || 0;
      const pendingCount = statusCounts.find(s => s.status === 'pending')?.count || 0;
      const approvedCount = statusCounts.find(s => s.status === 'approved')?.count || 0;
      const activeCount = statusCounts.find(s => s.status === 'active')?.count || 0;
      const inactiveCount = statusCounts.find(s => s.status === 'inactive')?.count || 0;
      const graduatedCount = statusCounts.find(s => s.status === 'graduated')?.count || 0;
      const exitedCount = statusCounts.find(s => s.status === 'exited')?.count || 0;

      // DEBUG: Log status breakdown
      console.log('[learners/analytics] Status breakdown from statusCounts:', {
        enquiriesCount,
        pendingCount,
        approvedCount,
        activeCount,
        totalFromCounts: enquiriesCount + pendingCount + approvedCount + activeCount + inactiveCount + graduatedCount + exitedCount
      });

      // Profile completion stats - Use server-side counts to avoid 1000-row limit
      // Get complete profiles count
      let completeQuery = supabase.from('learners_profiles').select('*', { count: 'exact', head: true });
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        completeQuery = completeQuery.in('institution_id', filters.institutionIds);
      }
      completeQuery = completeQuery.eq('is_profile_complete', true);
      const { count: completeProfilesCount } = await completeQuery;

      // Get incomplete profiles count
      let incompleteQuery = supabase.from('learners_profiles').select('*', { count: 'exact', head: true });
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        incompleteQuery = incompleteQuery.in('institution_id', filters.institutionIds);
      }
      incompleteQuery = incompleteQuery.eq('is_profile_complete', false);
      const { count: incompleteProfilesCount } = await incompleteQuery;

      const completionRate = totalCount > 0 ? ((completeProfilesCount || 0) / totalCount) * 100 : 0;

      // Awaiting activation - show approved count (learners approved and ready to be activated)
      const awaitingActivation = approvedCount;

      // Missing fields breakdown - Use server-side counts
      let missingEmailQuery = supabase.from('learners_profiles').select('*', { count: 'exact', head: true });
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        missingEmailQuery = missingEmailQuery.in('institution_id', filters.institutionIds);
      }
      missingEmailQuery = missingEmailQuery.or('college_email.is.null,college_email.eq.');
      const { count: missingCollegeEmail } = await missingEmailQuery;

      let missingYearQuery = supabase.from('learners_profiles').select('*', { count: 'exact', head: true });
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        missingYearQuery = missingYearQuery.in('institution_id', filters.institutionIds);
      }
      missingYearQuery = missingYearQuery.is('academic_year_id', null);
      const { count: missingAcademicYear } = await missingYearQuery;

      let missingSemQuery = supabase.from('learners_profiles').select('*', { count: 'exact', head: true });
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        missingSemQuery = missingSemQuery.in('institution_id', filters.institutionIds);
      }
      missingSemQuery = missingSemQuery.is('semester_id', null);
      const { count: missingSemester } = await missingSemQuery;

      let missingSectionQuery = supabase.from('learners_profiles').select('*', { count: 'exact', head: true });
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        missingSectionQuery = missingSectionQuery.in('institution_id', filters.institutionIds);
      }
      missingSectionQuery = missingSectionQuery.is('section_id', null);
      const { count: missingSection } = await missingSectionQuery;

      // DEBUG: Log profile completion counts
      console.log('[learners/analytics] Profile completion stats:', {
        totalCount,
        completeProfilesCount: completeProfilesCount || 0,
        incompleteProfilesCount: incompleteProfilesCount || 0,
        completionRate: completionRate.toFixed(2) + '%',
        missingCollegeEmail: missingCollegeEmail || 0,
        missingAcademicYear: missingAcademicYear || 0,
        missingSemester: missingSemester || 0,
        missingSection: missingSection || 0
      });

      // Trends (last 7 and 30 days) - Use server-side COUNT queries
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // New enquiries counts
      const newEnquiries7Days = await this.getCountByDateRange(filters, sevenDaysAgo, now, 'created_at', undefined, supabase);
      const newEnquiries30Days = await this.getCountByDateRange(filters, thirtyDaysAgo, now, 'created_at', undefined, supabase);
      const newEnquiries30To60Days = await this.getCountByDateRange(filters, sixtyDaysAgo, thirtyDaysAgo, 'created_at', undefined, supabase);

      // Active learner counts (by updated_at)
      const activations7Days = await this.getCountByDateRange(filters, sevenDaysAgo, now, 'updated_at', 'active', supabase);
      const activations30Days = await this.getCountByDateRange(filters, thirtyDaysAgo, now, 'updated_at', 'active', supabase);
      const activations30To60Days = await this.getCountByDateRange(filters, sixtyDaysAgo, thirtyDaysAgo, 'updated_at', 'active', supabase);

      // Calculate percentage changes
      const enquiries7DayChange = this.calculatePercentageChange(newEnquiries7Days, newEnquiries30Days - newEnquiries7Days);
      const enquiries30DayChange = this.calculatePercentageChange(newEnquiries30Days, newEnquiries30To60Days);
      const activations7DayChange = this.calculatePercentageChange(activations7Days, activations30Days - activations7Days);
      const activations30DayChange = this.calculatePercentageChange(activations30Days, activations30To60Days);

      // Conversion metrics - FUNNEL MODEL
      // Fixed: 2026-01-06 - Changed from comparing activeCount to current enquiries (which gave 69,933%)
      // to a proper funnel model where we measure % of ALL learners who reached active/graduated status
      // This matches the funnel chart logic and gives meaningful business metrics
      const convertedToActive = activeCount + graduatedCount; // Successful outcomes (active + graduated)
      const totalLearnersInFunnel = totalCount; // All learners who entered the system
      const conversionRate = totalLearnersInFunnel > 0 ? (convertedToActive / totalLearnersInFunnel) * 100 : 0;

      // Average time to activation - calculated using SQL for performance
      // Query active profiles and calculate average difference between created_at and updated_at
      let avgTimeToActivationQuery = supabase
        .from('learners_profiles')
        .select('created_at, updated_at')
        .eq('lifecycle_status', 'active');

      // Apply all the same filters
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        avgTimeToActivationQuery = avgTimeToActivationQuery.in('institution_id', filters.institutionIds);
      }
      if (filters.academicYearId) {
        avgTimeToActivationQuery = avgTimeToActivationQuery.eq('academic_year_id', filters.academicYearId);
      }
      if (filters.degreeId) {
        avgTimeToActivationQuery = avgTimeToActivationQuery.eq('degree_id', filters.degreeId);
      }
      if (filters.departmentId) {
        avgTimeToActivationQuery = avgTimeToActivationQuery.eq('department_id', filters.departmentId);
      }
      if (filters.programId) {
        avgTimeToActivationQuery = avgTimeToActivationQuery.eq('program_id', filters.programId);
      }
      if (filters.semesterId) {
        avgTimeToActivationQuery = avgTimeToActivationQuery.eq('semester_id', filters.semesterId);
      }
      if (filters.sectionId) {
        avgTimeToActivationQuery = avgTimeToActivationQuery.eq('section_id', filters.sectionId);
      }

      // Fetch sample of active profiles (limit to 1000 for performance)
      const { data: activeSampleData } = await avgTimeToActivationQuery.limit(1000);
      const activeProfilesSample = activeSampleData || [];

      const avgTimeToActivation = activeProfilesSample.length > 0
        ? activeProfilesSample.reduce((sum, p) => {
            const created = new Date(p.created_at).getTime();
            const updated = new Date(p.updated_at).getTime();
            return sum + (updated - created) / (1000 * 60 * 60 * 24);
          }, 0) / activeProfilesSample.length
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
          completeProfiles: completeProfilesCount || 0,
          incompleteProfiles: incompleteProfilesCount || 0,
          completionRate,
          awaitingActivation,
          missingCollegeEmail: missingCollegeEmail || 0,
          missingAcademicYear: missingAcademicYear || 0,
          missingSemester: missingSemester || 0,
          missingSection: missingSection || 0,
          // Completion tiers from getProfileCompletionTiers
          excellent: completionTiers.excellent || 0,
          good: completionTiers.good || 0,
          needsWork: completionTiers.needsWork || 0,
          critical: completionTiers.critical || 0,
        },

        // Trends
        newEnquiries7Days: {
          current: newEnquiries7Days,
          previous: newEnquiries30Days - newEnquiries7Days,
          change: enquiries7DayChange,
          trend: this.getTrend(enquiries7DayChange)
        },
        newEnquiries30Days: {
          current: enquiriesCount + pendingCount, // Show enquiry + pending statuses as "Total Enquiries"
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
          totalEnquiries: totalLearnersInFunnel, // Total learners in funnel (all statuses)
          convertedToActive, // Active + Graduated count
          conversionRate, // (Active + Graduated) / Total * 100
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

        // Hierarchical organizational data (for Organizational tab)
        hierarchicalInstitutions: hierarchicalInstitutionsData,

        // Geographic distributions
        byState: stateData,
        byDistrict: districtData,

        // Demographic distributions
        byAge: ageData,
        byReligion: religionData,
        byCommunity: communityData,
        byEntryType: entryTypeData,
        byAccommodationType: accommodationData,

        // Profile completion tiers
        profileCompletionTiers: completionTiers,

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
   * Helper: Get count by date range
   * Uses server-side COUNT query for performance
   */
  private static async getCountByDateRange(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    fromDate: Date,
    toDate: Date,
    dateField: 'created_at' | 'updated_at' = 'created_at',
    status?: import('@/types/learner-profile').LifecycleStatus,
    supabaseClient?: any
  ): Promise<number> {
    const supabase = supabaseClient || createClientSupabaseClient();

    let query = supabase
      .from('learners_profiles')
      .select('*', { count: 'exact', head: true });

    // Apply filters
    if (filters.institutionIds && filters.institutionIds.length > 0) {
      query = query.in('institution_id', filters.institutionIds);
    }

    if (filters.academicYearId) {
      query = query.eq('academic_year_id', filters.academicYearId);
    }

    if (filters.degreeId) {
      query = query.eq('degree_id', filters.degreeId);
    }

    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }

    if (filters.programId) {
      query = query.eq('program_id', filters.programId);
    }

    if (filters.semesterId) {
      query = query.eq('semester_id', filters.semesterId);
    }

    if (filters.sectionId) {
      query = query.eq('section_id', filters.sectionId);
    }

    if (status) {
      query = query.eq('lifecycle_status', status);
    }

    // Apply date range filter
    query = query
      .gte(dateField, fromDate.toISOString())
      .lt(dateField, toDate.toISOString());

    const { count, error } = await query;

    if (error) {
      console.error(`[learners/analytics] Error getting count by date range:`, error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Helper: Fetch ALL records with chunked pagination
   * Overcomes Supabase's 1000-row default limit
   *
   * @param tableName - The Supabase table to query
   * @param selectClause - What columns to select (e.g., 'gender' or 'state, districts(district_name)')
   * @param filters - Dashboard filters to apply
   * @returns Array of all matching records
   */
  private static async fetchAllRecordsChunked(
    tableName: string,
    selectClause: string,
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<any[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    let allRecords: any[] = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from(tableName)
        .select(selectClause);

      // Apply all common filters
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        query = query.in('institution_id', filters.institutionIds);
      }

      if (filters.academicYearId) {
        query = query.eq('academic_year_id', filters.academicYearId);
      }

      if (filters.degreeId) {
        query = query.eq('degree_id', filters.degreeId);
      }

      if (filters.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }

      if (filters.programId) {
        query = query.eq('program_id', filters.programId);
      }

      if (filters.semesterId) {
        query = query.eq('semester_id', filters.semesterId);
      }

      if (filters.sectionId) {
        query = query.eq('section_id', filters.sectionId);
      }

      // REMOVED: lifecycle_status filter from chunked queries
      // Methods that need status filtering should use optimized RPC functions instead
      // Keeping this here was causing enum type errors with text array comparison

      if (filters.isProfileComplete !== undefined) {
        query = query.eq('is_profile_complete', filters.isProfileComplete);
      }

      if (filters.gender) {
        query = query.eq('gender', filters.gender);
      }

      if (filters.dateRange) {
        query = query
          .gte('created_at', filters.dateRange.from.toISOString())
          .lte('created_at', filters.dateRange.to.toISOString());
      }

      // Fetch in chunks
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        console.error(`[learners/analytics] Error fetching ${tableName}:`, error);
        throw error;
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allRecords = allRecords.concat(data);
        offset += limit;

        // If we got fewer than limit records, we've reached the end
        if (data.length < limit) {
          hasMore = false;
        }
      }
    }

    return allRecords;
  }

  /**
   * Helper: Get count by status
   * OPTIMIZED: Single GROUP BY query instead of 7 separate queries
   */
  private static async getCountByStatus(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').StatusCount[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    try {
      // OPTIMIZED: Use single RPC call with GROUP BY instead of 7 parallel COUNT queries
      const { data, error } = await supabase.rpc('get_learners_count_by_status', {
        filter_institution_ids: filters.institutionIds || null,
        filter_academic_year_id: filters.academicYearId || null,
        filter_degree_id: filters.degreeId || null,
        filter_department_id: filters.departmentId || null,
        filter_program_id: filters.programId || null,
        filter_semester_id: filters.semesterId || null,
        filter_section_id: filters.sectionId || null,
        filter_lifecycle_statuses: filters.lifecycleStatuses || null,
        filter_gender: filters.gender || null,
        filter_is_profile_complete: filters.isProfileComplete ?? null,
        filter_date_from: filters.dateRange?.from?.toISOString() || null,
        filter_date_to: filters.dateRange?.to?.toISOString() || null
      });

      if (error) {
        console.error('[learners/analytics] Error in getCountByStatus:', error);
        throw error;
      }

      // Ensure all lifecycle statuses are represented (even with 0 count)
      const lifecycleStatuses: import('@/types/learner-profile').LifecycleStatus[] = [
        'enquiry', 'pending', 'approved', 'active', 'inactive', 'graduated', 'exited'
      ];

      const statusCounts = lifecycleStatuses.map((status) => {
        const found = (data || []).find((item: any) => item.status === status);
        return {
          status: status as import('@/types/learner-profile').LifecycleStatus,
          count: found ? Number(found.count) : 0,
          percentage: found ? Number(found.percentage) : 0
        };
      });

      console.log('[learners/analytics] Status counts (RPC optimized):', statusCounts);

      return statusCounts;
    } catch (error) {
      console.error('[learners/analytics] Error in getCountByStatus:', error);
      // Return zero counts for all statuses on error
      return [
        { status: 'enquiry', count: 0, percentage: 0 },
        { status: 'pending', count: 0, percentage: 0 },
        { status: 'approved', count: 0, percentage: 0 },
        { status: 'active', count: 0, percentage: 0 },
        { status: 'inactive', count: 0, percentage: 0 },
        { status: 'graduated', count: 0, percentage: 0 },
        { status: 'exited', count: 0, percentage: 0 }
      ];
    }
  }

  /**
   * Helper: Get distribution by institution
   * OPTIMIZED: Uses GROUP BY aggregation
   */
  private static async getDistributionByInstitution(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    // OPTIMIZED: Use database RPC function instead of fetching 10,000 rows
    const { data, error } = await supabase.rpc('get_learners_distribution_by_institution', {
      filter_institution_ids: filters.institutionIds || null,
      filter_academic_year_id: filters.academicYearId || null,
      filter_degree_id: filters.degreeId || null,
      filter_department_id: filters.departmentId || null,
      filter_program_id: filters.programId || null,
      filter_semester_id: filters.semesterId || null,
      filter_section_id: filters.sectionId || null,
      filter_lifecycle_statuses: filters.lifecycleStatuses || null,
      filter_gender: filters.gender || null,
      filter_is_profile_complete: filters.isProfileComplete ?? null,
      filter_date_from: filters.dateRange?.from?.toISOString() || null,
      filter_date_to: filters.dateRange?.to?.toISOString() || null
    });

    if (error) {
      console.error('[learners/analytics] Error in getDistributionByInstitution:', error);
      throw error;
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      count: Number(item.count),
      percentage: Number(item.percentage)
    }));
  }

  // Similar helper methods for other distributions
  private static async getDistributionByDepartment(filters: import('@/types/learner-dashboard').LearnerDashboardFilters, supabaseClient?: any): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    // OPTIMIZED: Use database RPC function instead of fetching 10,000 rows
    const { data, error } = await supabase.rpc('get_learners_distribution_by_department', {
      filter_institution_ids: filters.institutionIds || null,
      filter_academic_year_id: filters.academicYearId || null,
      filter_degree_id: filters.degreeId || null,
      filter_department_id: filters.departmentId || null,
      filter_program_id: filters.programId || null,
      filter_semester_id: filters.semesterId || null,
      filter_section_id: filters.sectionId || null,
      filter_lifecycle_statuses: filters.lifecycleStatuses || null,
      filter_gender: filters.gender || null,
      filter_is_profile_complete: filters.isProfileComplete ?? null,
      filter_date_from: filters.dateRange?.from?.toISOString() || null,
      filter_date_to: filters.dateRange?.to?.toISOString() || null
    });

    if (error) {
      console.error('[learners/analytics] Error in getDistributionByDepartment:', error);
      throw error;
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      count: Number(item.count),
      percentage: Number(item.percentage)
    }));
  }

  private static async getDistributionByProgram(filters: import('@/types/learner-dashboard').LearnerDashboardFilters, supabaseClient?: any): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    // OPTIMIZED: Use database RPC function instead of fetching 10,000 rows
    const { data, error } = await supabase.rpc('get_learners_distribution_by_program', {
      filter_institution_ids: filters.institutionIds || null,
      filter_academic_year_id: filters.academicYearId || null,
      filter_degree_id: filters.degreeId || null,
      filter_department_id: filters.departmentId || null,
      filter_program_id: filters.programId || null,
      filter_semester_id: filters.semesterId || null,
      filter_section_id: filters.sectionId || null,
      filter_lifecycle_statuses: filters.lifecycleStatuses || null,
      filter_gender: filters.gender || null,
      filter_is_profile_complete: filters.isProfileComplete ?? null,
      filter_date_from: filters.dateRange?.from?.toISOString() || null,
      filter_date_to: filters.dateRange?.to?.toISOString() || null
    });

    if (error) {
      console.error('[learners/analytics] Error in getDistributionByProgram:', error);
      throw error;
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      count: Number(item.count),
      percentage: Number(item.percentage)
    }));
  }

  private static async getDistributionBySemester(filters: import('@/types/learner-dashboard').LearnerDashboardFilters, supabaseClient?: any): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    let query = supabase
      .from('learners_profiles')
      .select('semester_id, semesters(semester_name)');

    if (filters.semesterId) {
      query = query.eq('semester_id', filters.semesterId);
    }

    // Apply range to fetch up to 10,000 records
    query = query.range(0, 9999);

    const { data, error } = await query;
    if (error) throw error;

    const profiles = (data as LearnerStatsRow[]) || [];
    const total = profiles.length;

    const groups = profiles.reduce((acc, p) => {
      if (p.semester_id) {
        if (!acc[p.semester_id]) {
          acc[p.semester_id] = {
            id: p.semester_id,
            name: (p.semesters as any)?.semester_name || 'Unknown',
            count: 0
          };
        }
        acc[p.semester_id].count++;
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

  private static async getDistributionBySection(filters: import('@/types/learner-dashboard').LearnerDashboardFilters, supabaseClient?: any): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    let query = supabase
      .from('learners_profiles')
      .select('section_id, sections(section_name)');

    if (filters.sectionId) {
      query = query.eq('section_id', filters.sectionId);
    }

    // Apply range to fetch up to 10,000 records
    query = query.range(0, 9999);

    const { data, error } = (await query) as { data: any[] | null; error: any };
    if (error) throw error;

    const profiles = data || [];
    const total = profiles.length;

    const groups = profiles.reduce((acc, p) => {
      if (p.section_id) {
        if (!acc[p.section_id]) {
          acc[p.section_id] = {
            id: p.section_id,
            name: (p.sections as any)?.section_name || 'Unknown',
            count: 0
          };
        }
        acc[p.section_id].count++;
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

  private static async getDistributionByGender(filters: import('@/types/learner-dashboard').LearnerDashboardFilters, supabaseClient?: any): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    // OPTIMIZED: Use database RPC function instead of fetching and chunking records
    const { data, error } = await supabase.rpc('get_learners_distribution_by_gender', {
      filter_institution_ids: filters.institutionIds || null,
      filter_academic_year_id: filters.academicYearId || null,
      filter_degree_id: filters.degreeId || null,
      filter_department_id: filters.departmentId || null,
      filter_program_id: filters.programId || null,
      filter_semester_id: filters.semesterId || null,
      filter_section_id: filters.sectionId || null,
      filter_lifecycle_statuses: filters.lifecycleStatuses || null,
      filter_gender: filters.gender || null,
      filter_is_profile_complete: filters.isProfileComplete ?? null,
      filter_date_from: filters.dateRange?.from?.toISOString() || null,
      filter_date_to: filters.dateRange?.to?.toISOString() || null
    });

    if (error) {
      console.error('[learners/analytics] Error in getDistributionByGender:', error);
      throw error;
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      count: Number(item.count),
      percentage: Number(item.percentage)
    }));
  }

  private static async getDistributionByAcademicYear(filters: import('@/types/learner-dashboard').LearnerDashboardFilters, supabaseClient?: any): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    let query = supabase
      .from('learners_profiles')
      .select('academic_year_id, academic_years(academic_year_name)');

    if (filters.academicYearId) {
      query = query.eq('academic_year_id', filters.academicYearId);
    }

    const { data, error } = (await query) as { data: any[] | null; error: any };
    if (error) throw error;

    const profiles = data || [];
    const total = profiles.length;

    const groups = profiles.reduce((acc, p) => {
      if (p.academic_year_id) {
        if (!acc[p.academic_year_id]) {
          acc[p.academic_year_id] = {
            id: p.academic_year_id,
            name: (p.academic_years as any)?.academic_year_name || 'Unknown',
            count: 0
          };
        }
        acc[p.academic_year_id].count++;
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

  private static async getEnquiriesTrend(filters: import('@/types/learner-dashboard').LearnerDashboardFilters, supabaseClient?: any): Promise<import('@/types/learner-dashboard').TimeSeriesDataPoint[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    // Note: Apply lifecycle_status='enquiry' as an additional filter
    const enquiryFilters = { ...filters, lifecycleStatuses: ['enquiry'] } as import('@/types/learner-dashboard').LearnerDashboardFilters;
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'created_at', enquiryFilters, supabaseClient);

    // Group by date
    const groupedByDate = profiles.reduce((acc, p) => {
      const date = new Date(p.created_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Convert to time series format
    return Object.entries(groupedByDate)
      .map(([date, count]): import('@/types/learner-dashboard').TimeSeriesDataPoint => ({
        date,
        count: count as number,
        label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private static async getActivationsTrend(filters: import('@/types/learner-dashboard').LearnerDashboardFilters, supabaseClient?: any): Promise<import('@/types/learner-dashboard').TimeSeriesDataPoint[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    // Note: Apply lifecycle_status='active' as an additional filter
    const activeFilters = { ...filters, lifecycleStatuses: ['active'] } as import('@/types/learner-dashboard').LearnerDashboardFilters;
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'updated_at', activeFilters, supabaseClient);

    // Group by date
    const groupedByDate = profiles.reduce((acc, p) => {
      const date = new Date(p.updated_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Convert to time series format
    return Object.entries(groupedByDate)
      .map(([date, count]): import('@/types/learner-dashboard').TimeSeriesDataPoint => ({
        date,
        count: count as number,
        label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private static async getGraduationsTrend(filters: import('@/types/learner-dashboard').LearnerDashboardFilters, supabaseClient?: any): Promise<import('@/types/learner-dashboard').TimeSeriesDataPoint[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    // Note: Apply lifecycle_status='graduated' as an additional filter
    const graduatedFilters = { ...filters, lifecycleStatuses: ['graduated'] } as import('@/types/learner-dashboard').LearnerDashboardFilters;
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'updated_at', graduatedFilters, supabaseClient);

    // Group by date
    const groupedByDate = profiles.reduce((acc, p) => {
      const date = new Date(p.updated_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Convert to time series format
    return Object.entries(groupedByDate)
      .map(([date, count]): import('@/types/learner-dashboard').TimeSeriesDataPoint => ({
        date,
        count: count as number,
        label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // ============================================
  // GEOGRAPHIC DISTRIBUTIONS
  // ============================================

  private static async getDistributionByState(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'permanent_address_state', filters, supabaseClient);
    const total = profiles.length;

    // Group by state
    const groups = profiles.reduce((acc, p) => {
      const state = p.permanent_address_state;
      if (state) {
        if (!acc[state]) {
          acc[state] = {
            id: state,
            name: state,
            count: 0
          };
        }
        acc[state].count++;
      }
      return acc;
    }, {} as Record<string, { id: string; name: string; count: number }>);

    // Convert to array and calculate percentages
    return (Object.values(groups) as Array<{ id: string; name: string; count: number }>)
      .map((item): import('@/types/learner-dashboard').DistributionItem => ({
        id: item.id,
        name: item.name,
        count: item.count,
        percentage: total > 0 ? (item.count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count) // Sort by count descending
      .slice(0, 20); // Top 20 states
  }

  private static async getDistributionByDistrict(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'permanent_address_district', filters, supabaseClient);
    const total = profiles.length;

    // Group by district
    const groups = profiles.reduce((acc, p) => {
      const district = p.permanent_address_district;
      if (district) {
        if (!acc[district]) {
          acc[district] = {
            id: district,
            name: district,
            count: 0
          };
        }
        acc[district].count++;
      }
      return acc;
    }, {} as Record<string, { id: string; name: string; count: number }>);

    // Convert to array and calculate percentages
    return (Object.values(groups) as Array<{ id: string; name: string; count: number }>)
      .map((item): import('@/types/learner-dashboard').DistributionItem => ({
        id: item.id,
        name: item.name,
        count: item.count,
        percentage: total > 0 ? (item.count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count) // Sort by count descending
      .slice(0, 20); // Top 20 districts
  }

  // ============================================
  // DEMOGRAPHIC DISTRIBUTIONS
  // ============================================

  private static async getDistributionByAge(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'date_of_birth', filters, supabaseClient);
    const total = profiles.length;

    // Calculate age groups
    const now = new Date();
    const ageGroups = {
      '<18': 0,
      '18-20': 0,
      '21-23': 0,
      '24-26': 0,
      '27+': 0
    };

    profiles.forEach((p) => {
      if (p.date_of_birth) {
        const birthDate = new Date(p.date_of_birth);
        const age = now.getFullYear() - birthDate.getFullYear();

        if (age < 18) {
          ageGroups['<18']++;
        } else if (age <= 20) {
          ageGroups['18-20']++;
        } else if (age <= 23) {
          ageGroups['21-23']++;
        } else if (age <= 26) {
          ageGroups['24-26']++;
        } else {
          ageGroups['27+']++;
        }
      }
    });

    return Object.entries(ageGroups).map(([age, count]): import('@/types/learner-dashboard').DistributionItem => ({
      id: age,
      name: age + ' years',
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }));
  }

  private static async getDistributionByReligion(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'religion', filters, supabaseClient);
    const total = profiles.length;

    // Group by religion
    const groups = profiles.reduce((acc, p) => {
      const religion = p.religion;
      if (religion) {
        if (!acc[religion]) {
          acc[religion] = {
            id: religion,
            name: religion,
            count: 0
          };
        }
        acc[religion].count++;
      }
      return acc;
    }, {} as Record<string, { id: string; name: string; count: number }>);

    return (Object.values(groups) as Array<{ id: string; name: string; count: number }>)
      .map((item): import('@/types/learner-dashboard').DistributionItem => ({
        id: item.id,
        name: item.name,
        count: item.count,
        percentage: total > 0 ? (item.count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  private static async getDistributionByCommunity(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'community', filters, supabaseClient);
    const total = profiles.length;

    // Group by community
    const groups = profiles.reduce((acc, p) => {
      const community = p.community;
      if (community) {
        if (!acc[community]) {
          acc[community] = {
            id: community,
            name: community,
            count: 0
          };
        }
        acc[community].count++;
      }
      return acc;
    }, {} as Record<string, { id: string; name: string; count: number }>);

    return (Object.values(groups) as Array<{ id: string; name: string; count: number }>)
      .map((item): import('@/types/learner-dashboard').DistributionItem => ({
        id: item.id,
        name: item.name,
        count: item.count,
        percentage: total > 0 ? (item.count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  private static async getDistributionByEntryType(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'entry_type', filters, supabaseClient);
    const total = profiles.length;

    // Group by entry type
    const groups = profiles.reduce((acc, p) => {
      const entryType = p.entry_type;
      if (entryType) {
        if (!acc[entryType]) {
          acc[entryType] = {
            id: entryType,
            name: entryType,
            count: 0
          };
        }
        acc[entryType].count++;
      }
      return acc;
    }, {} as Record<string, { id: string; name: string; count: number }>);

    return (Object.values(groups) as Array<{ id: string; name: string; count: number }>)
      .map((item): import('@/types/learner-dashboard').DistributionItem => ({
        id: item.id,
        name: item.name,
        count: item.count,
        percentage: total > 0 ? (item.count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  private static async getDistributionByAccommodationType(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').DistributionItem[]> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    const profiles = await this.fetchAllRecordsChunked('learners_profiles', 'accommodation_type', filters, supabaseClient);
    const total = profiles.length;

    // Group by accommodation type
    const groups = profiles.reduce((acc, p) => {
      const accType = p.accommodation_type;
      if (accType) {
        if (!acc[accType]) {
          acc[accType] = {
            id: accType,
            name: accType,
            count: 0
          };
        }
        acc[accType].count++;
      }
      return acc;
    }, {} as Record<string, { id: string; name: string; count: number }>);

    return (Object.values(groups) as Array<{ id: string; name: string; count: number }>)
      .map((item): import('@/types/learner-dashboard').DistributionItem => ({
        id: item.id,
        name: item.name,
        count: item.count,
        percentage: total > 0 ? (item.count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  // ============================================
  // PROFILE COMPLETION TIERS
  // ============================================

  private static async getProfileCompletionTiers(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<{
    excellent: number;
    good: number;
    needsWork: number;
    critical: number;
  }> {
    // Fetch ALL records with chunked pagination (fixes 1000-row limit)
    const profiles = await this.fetchAllRecordsChunked(
      'learners_profiles',
      'is_profile_complete, college_email, academic_year_id, semester_id, section_id',
      filters,
      supabaseClient
    );

    // Categorize profiles into completion tiers
    const tiers = {
      excellent: 0, // 100% complete (all 4 required fields)
      good: 0, // 3 out of 4 fields (75%)
      needsWork: 0, // 2 out of 4 fields (50%)
      critical: 0 // 0-1 out of 4 fields (<50%)
    };

    profiles.forEach((p) => {
      // Count how many required fields are filled
      let filledFields = 0;
      if (p.college_email) filledFields++;
      if (p.academic_year_id) filledFields++;
      if (p.semester_id) filledFields++;
      if (p.section_id) filledFields++;

      if (filledFields === 4) {
        tiers.excellent++;
      } else if (filledFields === 3) {
        tiers.good++;
      } else if (filledFields === 2) {
        tiers.needsWork++;
      } else {
        tiers.critical++;
      }
    });

    return tiers;
  }

  /**
   * Helper: Get hierarchical institution data
   * Returns institution → degree → department → program → semester → section hierarchy
   * Fetches all learner records to build accurate hierarchy
   */
  private static async getHierarchicalInstitutions(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<import('@/types/learner-dashboard').HierarchicalInstitution[]> {
    const supabase = supabaseClient || createClientSupabaseClient();

    console.log('[learners/analytics] Fetching hierarchical institution data...');

    // Strategy: Fetch ALL learner profiles in chunks to build accurate counts
    // This is necessary because Supabase limits queries to 1000 rows by default

    let allProfiles: any[] = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('learners_profiles')
        .select(`
          institution_id,
          institutions!inner(id, name),
          degree_id,
          degrees(id, degree_name, institution_id),
          department_id,
          departments(id, department_name),
          program_id,
          programs(id, program_name),
          semester_id,
          semesters(id, semester_name),
          section_id,
          sections(id, section_name)
        `)
        .not('institution_id', 'is', null);

      // Apply institution filter if provided
      if (filters.institutionIds && filters.institutionIds.length > 0) {
        query = query.in('institution_id', filters.institutionIds);
      }

      // Fetch in chunks
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        console.error('[learners/analytics] Error fetching hierarchical data:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allProfiles = allProfiles.concat(data);
        offset += limit;

        // If we got fewer than limit records, we've reached the end
        if (data.length < limit) {
          hasMore = false;
        }
      }

      console.log(`[learners/analytics] Fetched ${allProfiles.length} profiles so far...`);
    }

    console.log(`[learners/analytics] Total profiles fetched: ${allProfiles.length}`);

    // Build hierarchy from all fetched records
    return this.buildHierarchyFromRecords(allProfiles);
  }

  /**
   * Build hierarchy from individual records
   */
  private static buildHierarchyFromRecords(records: any[]): import('@/types/learner-dashboard').HierarchicalInstitution[] {
    const institutionMap = new Map<string, import('@/types/learner-dashboard').HierarchicalInstitution>();

    // First pass: Count all learners per institution (including those with mismatched degrees)
    records.forEach((profile) => {
      if (!profile.institution_id || !profile.institutions) return;

      const instId = profile.institution_id;
      const instName = (profile.institutions as any)?.name || 'Unknown Institution';

      if (!institutionMap.has(instId)) {
        institutionMap.set(instId, {
          id: instId,
          name: instName,
          count: 0,
          degrees: []
        });
      }
      const institution = institutionMap.get(instId)!;
      institution.count++;
    });

    // Second pass: Build hierarchy, but skip records where degree doesn't belong to institution
    records.forEach((profile) => {
      if (!profile.institution_id || !profile.institutions) return;
      if (!profile.degree_id || !profile.degrees) return;

      const instId = profile.institution_id;
      const institution = institutionMap.get(instId);
      if (!institution) return;

      const degreeId = profile.degree_id;
      const degreeName = (profile.degrees as any)?.degree_name || 'Unknown Degree';

      // IMPORTANT: Skip if degree doesn't exist or if degree belongs to different institution
      // This handles data integrity issues where learners have degrees from wrong institutions
      const degreeInstitutionId = (profile.degrees as any)?.institution_id;
      if (degreeInstitutionId && degreeInstitutionId !== instId) {
        console.warn(`[learners/analytics] Data integrity issue: Learner has degree from different institution. ` +
          `Learner institution: ${instId}, Degree institution: ${degreeInstitutionId}`);
        return; // Skip this record for hierarchy building
      }

      let degree = institution.degrees.find(d => d.id === degreeId);
      if (!degree) {
        degree = {
          id: degreeId,
          name: degreeName,
          count: 0,
          departments: []
        };
        institution.degrees.push(degree);
      }
      degree.count++;

      if (!profile.department_id || !profile.departments) return;

      const deptId = profile.department_id;
      const deptName = (profile.departments as any)?.department_name || 'Unknown Department';

      let department = degree.departments.find(d => d.id === deptId);
      if (!department) {
        department = {
          id: deptId,
          name: deptName,
          count: 0,
          programs: []
        };
        degree.departments.push(department);
      }
      department.count++;

      if (!profile.program_id || !profile.programs) return;

      const progId = profile.program_id;
      const progName = (profile.programs as any)?.program_name || 'Unknown Program';

      let program = department.programs.find(p => p.id === progId);
      if (!program) {
        program = {
          id: progId,
          name: progName,
          count: 0,
          semesters: []
        };
        department.programs.push(program);
      }
      program.count++;

      if (!profile.semester_id || !profile.semesters) return;

      const semId = profile.semester_id;
      const semName = (profile.semesters as any)?.semester_name || 'Unknown Semester';

      let semester = program.semesters.find(s => s.id === semId);
      if (!semester) {
        semester = {
          id: semId,
          name: semName,
          count: 0,
          sections: []
        };
        program.semesters.push(semester);
      }
      semester.count++;

      if (!profile.section_id || !profile.sections) return;

      const sectId = profile.section_id;
      const sectName = (profile.sections as any)?.section_name || 'Unknown Section';

      let section = semester.sections.find(s => s.id === sectId);
      if (!section) {
        section = {
          id: sectId,
          name: sectName,
          count: 0
        };
        semester.sections.push(section);
      }
      section.count++;
    });

    return Array.from(institutionMap.values()).sort((a, b) => b.count - a.count);
  }
}
