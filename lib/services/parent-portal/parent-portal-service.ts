// lib/services/parent-portal/parent-portal-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ParentProfile,
  ParentLearnerLink,
  ParentCommunication,
  ParentActivityLog,
  ParentDashboardData,
  LearnerAttendanceSummary,
  LearnerFeeSummary,
  CreateParentProfileDto,
  UpdateParentProfileDto,
  LinkLearnerDto,
  CreateCommunicationDto,
  LogActivityDto,
  ParentProfileFilters,
  CommunicationFilters,
  ActivityLogFilters,
  OTPRequest,
  OTPVerification,
  OTPResponse,
  ParentAuthResult,
  ParentRegistrationData,
  RegistrationResult,
} from '@/types/parent-portal';

export class ParentPortalService {
  /**
   * SECURITY: Validate institution access
   * Ensures user has permission to access the requested institution's data
   * @throws Error if institution_id is invalid or user lacks access
   */
  private static async validateInstitutionAccess(
    institutionId: string
  ): Promise<void> {
    if (!institutionId || institutionId.trim() === '') {
      throw new Error('Institution ID is required');
    }

    const supabase: any = createClientSupabaseClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Check user's institution access
    const { data: access, error } = await supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (error || !access) {
      console.error('[parent-portal] Access denied:', { userId: user.id, institutionId });
      throw new Error('Access denied: Institution not accessible to user');
    }
  }

  /**
   * Sanitize search input to prevent SQL injection
   * Escapes wildcards and special characters used in ILIKE queries
   * @security CRITICAL - All user search inputs MUST pass through this
   */
  private static sanitizeSearch(input: string): string {
    if (!input) return '';
    // Escape SQL ILIKE wildcards (%) and single-character wildcards (_)
    // Also escape backslash to prevent escape sequence injection
    return input.replace(/[%_\\]/g, '\\$&');
  }

  // ============================================================================
  // PARENT PROFILE METHODS
  // ⚠️ WARNING: These methods reference 'parent_profiles' table which DOES NOT EXIST in DB
  // The actual DB uses 'parent_portal_access' table instead
  // These methods will FAIL at runtime until the schema is migrated
  // ============================================================================

  static async getParentProfile(userId: string, institutionId?: string): Promise<ParentProfile | null> {
    const supabase: any = createClientSupabaseClient();

    // SECURITY: Validate userId is provided
    if (!userId) {
      throw new Error('User ID is required');
    }

    let query = supabase
      .from('parent_profiles')
      .select(`
        *,
        institution:institutions(id, name, logo_url)
      `)
      .eq('user_id', userId);

    // SECURITY: Filter by institution_id if provided to prevent cross-institution access
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      console.error('[parent-portal] Error fetching parent profile:', error);
      throw new Error('Failed to fetch parent profile');
    }

    return data;
  }

  static async getParentProfileById(id: string, institutionId?: string): Promise<ParentProfile | null> {
    const supabase: any = createClientSupabaseClient();

    // SECURITY: Validate id is provided
    if (!id) {
      throw new Error('Profile ID is required');
    }

    let query = supabase
      .from('parent_profiles')
      .select(`
        *,
        institution:institutions(id, name, logo_url)
      `)
      .eq('id', id);

    // SECURITY: Filter by institution_id if provided to prevent cross-institution access
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      console.error('[parent-portal] Error fetching parent profile:', error);
      throw new Error('Failed to fetch parent profile');
    }

    return data;
  }

  static async getParentProfiles(filters: ParentProfileFilters) {
    const supabase: any = createClientSupabaseClient();
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('parent_profiles')
      .select(`
        *,
        institution:institutions(id, name, logo_url)
      `, { count: 'exact' });

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    if (filters.search) {
      // SECURITY FIX: Sanitize search to prevent SQL injection
      const sanitizedSearch = this.sanitizeSearch(filters.search);
      query = query.or(`name.ilike.%${sanitizedSearch}%,phone.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%`);
    }

    if (filters.is_verified !== undefined) {
      query = query.eq('is_verified', filters.is_verified);
    }

    if (filters.relationship) {
      query = query.eq('relationship', filters.relationship);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

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

  static async createParentProfile(input: CreateParentProfileDto): Promise<ParentProfile> {
    const supabase: any = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_profiles')
      .insert(input)
      .select(`
        *,
        institution:institutions(id, name, logo_url)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async updateParentProfile(
    id: string,
    input: UpdateParentProfileDto
  ): Promise<ParentProfile> {
    const supabase: any = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_profiles')
      .update(input)
      .eq('id', id)
      .select(`
        *,
        institution:institutions(id, name, logo_url)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async verifyParent(id: string): Promise<ParentProfile> {
    const supabase: any = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_profiles')
      .update({ is_verified: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // PARENT-LEARNER LINK METHODS
  // ⚠️ WARNING: These methods reference 'parent_learner_links' table which DOES NOT EXIST in DB
  // The actual DB stores learner_id directly in 'parent_portal_access' table (1:1 relationship)
  // These methods will FAIL at runtime until the schema is migrated
  // ============================================================================

  static async getLinkedLearners(parentId: string): Promise<ParentLearnerLink[]> {
    const supabase: any = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_learner_links')
      .select(`
        *,
        learner:learners_profiles(
          id, name, enrollment_number, photo_url,
          program_id, section_id, semester_id,
          program:programs(id, name, code),
          section:sections(id, name),
          semester:semesters(id, name)
        )
      `)
      .eq('parent_id', parentId)
      .order('is_primary', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async linkLearner(input: LinkLearnerDto): Promise<ParentLearnerLink> {
    const supabase: any = createClientSupabaseClient();

    // SECURITY: Validate that parent and learner belong to the same institution
    const [parentCheck, learnerCheck] = await Promise.all([
      supabase.from('parent_profiles').select('institution_id').eq('id', input.parent_id).single(),
      supabase.from('learners_profiles').select('institution_id').eq('id', input.learner_id).single()
    ]);

    if (parentCheck.error || learnerCheck.error) {
      throw new Error('Parent or learner not found');
    }

    if (parentCheck.data?.institution_id !== learnerCheck.data?.institution_id) {
      throw new Error('Parent and learner must belong to the same institution');
    }

    const { data, error } = await supabase
      .from('parent_learner_links')
      .insert(input)
      .select(`
        *,
        learner:learners_profiles(
          id, name, enrollment_number, photo_url,
          program:programs(id, name, code),
          section:sections(id, name)
        )
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async unlinkLearner(linkId: string): Promise<void> {
    const supabase: any = createClientSupabaseClient();
    const { error } = await supabase
      .from('parent_learner_links')
      .delete()
      .eq('id', linkId);

    if (error) throw error;
  }

  static async verifyLink(linkId: string, verifiedBy: string): Promise<ParentLearnerLink> {
    const supabase: any = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_learner_links')
      .update({
        verified_at: new Date().toISOString(),
        verified_by: verifiedBy,
      })
      .eq('id', linkId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async setPrimaryLink(linkId: string): Promise<ParentLearnerLink> {
    const supabase: any = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_learner_links')
      .update({ is_primary: true })
      .eq('id', linkId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // DASHBOARD METHODS
  // ============================================================================

  /**
   * Get parent dashboard data using server-side session validation
   * No parentId parameter needed - uses authenticated session
   */
  static async getDashboard(): Promise<ParentDashboardData> {
    // This now calls the API route which validates the session server-side
    const response = await fetch('/api/parent-portal/dashboard', {
      credentials: 'include', // Include httpOnly cookies
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch dashboard data');
    }

    return response.json();
  }

  static async getLearnerAttendance(learnerId: string): Promise<LearnerAttendanceSummary> {
    // SECURITY: Route through API endpoint which validates parent session
    // and verifies parent-learner relationship before returning data
    const response = await fetch(`/api/parent-portal/learner/${encodeURIComponent(learnerId)}/attendance`, {
      credentials: 'include', // Include httpOnly session cookie
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch attendance data');
    }

    return response.json();
  }

  static async getLearnerFees(learnerId: string): Promise<LearnerFeeSummary> {
    // SECURITY: Route through API endpoint which validates parent session
    // and verifies parent-learner relationship before returning data
    const response = await fetch(`/api/parent-portal/learner/${encodeURIComponent(learnerId)}/fees`, {
      credentials: 'include', // Include httpOnly session cookie
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch fee data');
    }

    return response.json();
  }

  // ============================================================================
  // COMMUNICATION METHODS
  // ============================================================================

  static async getCommunications(filters: CommunicationFilters) {
    const supabase: any = createClientSupabaseClient();
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // NOTE: sender_id has NO FK constraint to profiles table.
    // Cannot use PostgREST FK join syntax. Select raw columns only.
    let query = supabase
      .from('parent_communications')
      .select(`
        *,
        learner:learners_profiles(id, name, enrollment_number)
      `, { count: 'exact' });

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    if (filters.parent_id) {
      // FIXED: DB column is parent_id, not parent_access_id
      query = query.eq('parent_id', filters.parent_id);
    }

    if (filters.learner_id) {
      query = query.eq('learner_id', filters.learner_id);
    }

    if (filters.type) {
      // FIXED: DB column is type, not communication_type
      query = query.eq('type', filters.type);
    }

    if (filters.priority) {
      // FIXED: DB has priority column
      query = query.eq('priority', filters.priority);
    }

    if (filters.is_read !== undefined) {
      if (filters.is_read) {
        query = query.not('read_at', 'is', null);
      } else {
        query = query.is('read_at', null);
      }
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

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

  static async getCommunication(id: string): Promise<ParentCommunication | null> {
    const supabase: any = createClientSupabaseClient();
    // NOTE: sender_id has NO FK to profiles. Cannot join.
    const { data, error } = await supabase
      .from('parent_communications')
      .select(`
        *,
        learner:learners_profiles(id, name, enrollment_number)
      `)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async createCommunication(input: CreateCommunicationDto): Promise<ParentCommunication> {
    const supabase: any = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_communications')
      .insert({
        institution_id: input.institution_id,
        parent_id: input.parent_id || null, // FIXED: DB column is parent_id
        learner_id: input.learner_id,
        type: input.type, // FIXED: DB column is type
        subject: input.subject,
        content: input.content,
        priority: input.priority || 'normal', // FIXED: DB has priority column
        sender_id: input.sender_id || null, // FIXED: DB column is sender_id
        attachments: input.attachments || [],
      })
      .select(`
        *,
        sender:profiles!sender_id(id, name, avatar_url)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async markCommunicationRead(id: string): Promise<void> {
    const supabase: any = createClientSupabaseClient();
    const { error } = await supabase
      .from('parent_communications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  static async markAllCommunicationsRead(parentId: string): Promise<void> {
    const supabase: any = createClientSupabaseClient();
    const { error } = await supabase
      .from('parent_communications')
      .update({ read_at: new Date().toISOString() })
      .eq('parent_id', parentId)
      .is('read_at', null);

    if (error) throw error;
  }

  static async getUnreadCount(parentId: string): Promise<number> {
    const supabase: any = createClientSupabaseClient();
    const { count, error } = await supabase
      .from('parent_communications')
      .select('*', { count: 'exact', head: true })
      .eq('parent_id', parentId)
      .is('read_at', null);

    if (error) throw error;
    return count || 0;
  }

  // ============================================================================
  // ACTIVITY LOG METHODS
  // ⚠️ WARNING: These methods reference 'parent_activity_log' table which DOES NOT EXIST in DB
  // These methods will FAIL at runtime until the schema is migrated
  // ============================================================================

  static async getActivityLog(filters: ActivityLogFilters) {
    const supabase: any = createClientSupabaseClient();
    const { page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('parent_activity_log')
      .select('*', { count: 'exact' });

    if (filters.parent_id) {
      query = query.eq('parent_id', filters.parent_id);
    }

    if (filters.activity_type) {
      query = query.eq('activity_type', filters.activity_type);
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

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

  static async logActivity(input: LogActivityDto): Promise<ParentActivityLog> {
    const supabase: any = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_activity_log')
      .insert(input)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // OTP AUTHENTICATION METHODS
  // ============================================================================

  static async requestOTP(input: OTPRequest): Promise<OTPResponse> {
    // SECURITY: Call API route instead of RPC directly
    // API route handles rate limiting and other security checks
    const response = await fetch('/api/parent-portal/auth/request-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: input.phone,
        institution_id: input.institution_id,
      }),
      credentials: 'include', // Include cookies
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send OTP');
    }

    return response.json();
  }

  static async verifyOTP(input: OTPVerification): Promise<ParentAuthResult> {
    // SECURITY: Call API route instead of RPC directly
    // API route creates secure httpOnly session cookie
    const response = await fetch('/api/parent-portal/auth/verify-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: input.phone,
        otp: input.otp,
        institution_id: input.institution_id,
      }),
      credentials: 'include', // Include httpOnly cookies
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || 'Failed to verify OTP');
    }

    return response.json();
  }

  // ============================================================================
  // REGISTRATION METHODS
  // ============================================================================

  static async registerParent(input: ParentRegistrationData): Promise<RegistrationResult> {
    const supabase: any = createClientSupabaseClient();

    // SECURITY: Validate required fields
    if (!input.phone || !input.learner_enrollment_number || !input.institution_id) {
      return {
        success: false,
        message: 'Phone, enrollment number, and institution ID are required',
      };
    }

    // Sanitize phone number to prevent SQL injection
    const sanitizedPhone = input.phone.replace(/[^\d+]/g, '');
    if (sanitizedPhone !== input.phone) {
      return {
        success: false,
        message: 'Invalid phone number format',
      };
    }

    // First, find the learner by enrollment number
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('id, name, institution_id')
      .eq('enrollment_number', input.learner_enrollment_number)
      .eq('institution_id', input.institution_id)
      .single();

    if (learnerError || !learner) {
      return {
        success: false,
        message: 'Learner not found with the provided enrollment number',
      };
    }

    // Check if parent already exists with this phone
    const { data: existingParent } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('phone', input.phone)
      .eq('institution_id', input.institution_id)
      .single();

    if (existingParent) {
      // Check if already linked to this learner
      const { data: existingLink } = await supabase
        .from('parent_learner_links')
        .select('id')
        .eq('parent_id', existingParent.id)
        .eq('learner_id', learner.id)
        .single();

      if (existingLink) {
        return {
          success: false,
          message: 'You are already linked to this learner',
        };
      }

      // Link existing parent to new learner
      await this.linkLearner({
        parent_id: existingParent.id,
        learner_id: learner.id,
        relationship: input.relationship,
      });

      return {
        success: true,
        message: 'Learner added to your account',
        parent_id: existingParent.id,
        requires_verification: true,
      };
    }

    // Create new parent profile (user will be created during auth flow)
    // For now, return that registration needs to be completed after OTP verification
    return {
      success: true,
      message: 'Please verify your phone number to complete registration',
      requires_verification: true,
    };
  }

  static async completeRegistration(
    userId: string,
    input: ParentRegistrationData
  ): Promise<RegistrationResult> {
    const supabase: any = createClientSupabaseClient();

    // Find the learner
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('id')
      .eq('enrollment_number', input.learner_enrollment_number)
      .eq('institution_id', input.institution_id)
      .single();

    if (learnerError || !learner) {
      return {
        success: false,
        message: 'Learner not found',
      };
    }

    // Create parent profile
    const parent = await this.createParentProfile({
      user_id: userId,
      institution_id: input.institution_id,
      name: input.name,
      phone: input.phone,
      email: input.email,
      relationship: input.relationship,
    });

    // Link to learner
    await this.linkLearner({
      parent_id: parent.id,
      learner_id: learner.id,
      relationship: input.relationship,
      is_primary: true,
    });

    // Log activity
    await this.logActivity({
      parent_id: parent.id,
      activity_type: 'login',
      description: 'Account created and first login',
    });

    return {
      success: true,
      message: 'Registration completed successfully',
      parent_id: parent.id,
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  static async findParentByPhone(
    phone: string,
    institutionId: string
  ): Promise<ParentProfile | null> {
    const supabase: any = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_profiles')
      .select('*')
      .eq('phone', phone)
      .eq('institution_id', institutionId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async getLearnersByParent(parentId: string) {
    const links = await this.getLinkedLearners(parentId);
    return links.map((link) => link.learner).filter(Boolean);
  }
}
