// lib/services/parent-portal/parent-portal-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ParentProfile,
  ParentLearnerLink,
  ParentCommunication,
  ParentActivityLog,
  ParentDashboardData,
  LearnerDashboardData,
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
  // ============================================================================
  // PARENT PROFILE METHODS
  // ============================================================================

  static async getParentProfile(userId: string): Promise<ParentProfile | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_profiles')
      .select(`
        *,
        institution:institutions(id, name, logo_url)
      `)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async getParentProfileById(id: string): Promise<ParentProfile | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_profiles')
      .select(`
        *,
        institution:institutions(id, name, logo_url)
      `)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async getParentProfiles(filters: ParentProfileFilters = {}) {
    const supabase = createClientSupabaseClient();
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
      query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
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
    const supabase = createClientSupabaseClient();
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
    const supabase = createClientSupabaseClient();
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
    const supabase = createClientSupabaseClient();
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
  // ============================================================================

  static async getLinkedLearners(parentId: string): Promise<ParentLearnerLink[]> {
    const supabase = createClientSupabaseClient();
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
    const supabase = createClientSupabaseClient();
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
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('parent_learner_links')
      .delete()
      .eq('id', linkId);

    if (error) throw error;
  }

  static async verifyLink(linkId: string, verifiedBy: string): Promise<ParentLearnerLink> {
    const supabase = createClientSupabaseClient();
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
    const supabase = createClientSupabaseClient();
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

  static async getDashboard(parentId: string): Promise<ParentDashboardData> {
    const supabase = createClientSupabaseClient();

    // Use the database function for optimized query
    const { data, error } = await supabase.rpc('get_parent_dashboard', {
      p_parent_id: parentId,
    });

    if (error) throw error;

    // Get full learner data with summaries
    const learners = await this.getLinkedLearners(parentId);
    const learnersWithData: LearnerDashboardData[] = await Promise.all(
      learners.map(async (link) => {
        const [attendance, fees] = await Promise.all([
          this.getLearnerAttendance(link.learner_id),
          this.getLearnerFees(link.learner_id),
        ]);

        return {
          learner: link.learner!,
          link,
          attendance,
          fees,
          grades: {
            current_gpa: null,
            current_cgpa: null,
            recent_grades: [],
          },
          upcoming_events: [],
        };
      })
    );

    // Get recent activities
    const activities = await this.getActivityLog({ parent_id: parentId, limit: 10 });

    return {
      parent: data.parent,
      learners: learnersWithData,
      unread_messages: data.unread_messages,
      pending_surveys: data.pending_surveys || [],
      recent_activities: activities.data,
    };
  }

  static async getLearnerAttendance(learnerId: string): Promise<LearnerAttendanceSummary> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('get_learner_attendance_for_parent', {
      p_learner_id: learnerId,
      p_days: 30,
    });

    if (error) throw error;
    return data;
  }

  static async getLearnerFees(learnerId: string): Promise<LearnerFeeSummary> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('get_learner_fees_for_parent', {
      p_learner_id: learnerId,
    });

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // COMMUNICATION METHODS
  // ============================================================================

  static async getCommunications(filters: CommunicationFilters = {}) {
    const supabase = createClientSupabaseClient();
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('parent_communications')
      .select(`
        *,
        sender:users_profiles(id, name, avatar_url),
        learner:learners_profiles(id, name, enrollment_number)
      `, { count: 'exact' });

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    if (filters.parent_id) {
      query = query.eq('parent_id', filters.parent_id);
    }

    if (filters.learner_id) {
      query = query.eq('learner_id', filters.learner_id);
    }

    if (filters.type) {
      query = query.eq('type', filters.type);
    }

    if (filters.priority) {
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
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_communications')
      .select(`
        *,
        sender:users_profiles(id, name, avatar_url),
        learner:learners_profiles(id, name, enrollment_number)
      `)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async createCommunication(input: CreateCommunicationDto): Promise<ParentCommunication> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('parent_communications')
      .insert(input)
      .select(`
        *,
        sender:users_profiles(id, name, avatar_url)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async markCommunicationRead(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('parent_communications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  static async markAllCommunicationsRead(parentId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('parent_communications')
      .update({ read_at: new Date().toISOString() })
      .eq('parent_id', parentId)
      .is('read_at', null);

    if (error) throw error;
  }

  static async getUnreadCount(parentId: string): Promise<number> {
    const supabase = createClientSupabaseClient();
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
  // ============================================================================

  static async getActivityLog(filters: ActivityLogFilters = {}) {
    const supabase = createClientSupabaseClient();
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
    const supabase = createClientSupabaseClient();
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
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('send_parent_otp', {
      p_phone: input.phone,
      p_institution_id: input.institution_id,
    });

    if (error) throw error;
    return data;
  }

  static async verifyOTP(input: OTPVerification): Promise<ParentAuthResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('verify_parent_otp', {
      p_phone: input.phone,
      p_otp: input.otp,
      p_institution_id: input.institution_id,
    });

    if (error) throw error;

    if (data.success && data.parent_id) {
      // Log the login activity
      await this.logActivity({
        parent_id: data.parent_id,
        activity_type: 'login',
        description: 'Logged in via OTP',
      });
    }

    return data;
  }

  // ============================================================================
  // REGISTRATION METHODS
  // ============================================================================

  static async registerParent(input: ParentRegistrationData): Promise<RegistrationResult> {
    const supabase = createClientSupabaseClient();

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
    const supabase = createClientSupabaseClient();

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
    const supabase = createClientSupabaseClient();
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
