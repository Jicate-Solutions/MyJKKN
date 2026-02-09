// lib/services/solutions/cohort-service.ts
// CRUD operations for sh_cohort_members, sh_cohort_assignments

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  CohortMember,
  CohortAssignment,
  CohortTrack,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface CohortMemberWithDetails extends CohortMember {
  department?: {
    id: string;
    name: string;
    code: string;
  };
  assignments?: CohortAssignment[];
}

export interface CohortMemberFilters extends PaginationParams {
  level?: string;
  track?: CohortTrack;
  department_id?: string;
  is_active?: boolean;
}

export interface CreateCohortMemberInput {
  user_id?: string;
  name: string;
  email?: string;
  phone?: string;
  department_id?: string;
  level?: string;
  track?: CohortTrack;
}

export interface UpdateCohortMemberInput {
  name?: string;
  email?: string;
  phone?: string;
  department_id?: string;
  level?: string;
  track?: CohortTrack;
  is_active?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

export const COHORT_LEVELS = [
  { level: 'observer', title: 'Observer', description: 'New member, observing sessions' },
  { level: 'co_lead', title: 'Co-Lead', description: 'Can co-lead sessions with supervision' },
  { level: 'lead', title: 'Lead', description: 'Can lead standard sessions independently' },
  { level: 'master', title: 'Master Trainer', description: 'Can lead all sessions and train others' },
];

export const LEVEL_COLORS: Record<string, string> = {
  observer: 'bg-gray-100 text-gray-800',
  co_lead: 'bg-blue-100 text-blue-800',
  lead: 'bg-green-100 text-green-800',
  master: 'bg-purple-100 text-purple-800',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeSearchString(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

// ============================================
// SERVICE CLASS
// ============================================

export class CohortService extends BaseService {
  /**
   * Get all cohort members with optional filters
   */
  static async getCohortMembers(
    filters?: CohortMemberFilters
  ): Promise<BaseListResponse<CohortMemberWithDetails>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase.from('sh_cohort_members')
      .select(
        `
        *,
        department:departments(id, name:department_name, code:department_code)
      `,
        { count: 'exact' }
      )
      .order('name', { ascending: true });

    // Apply filters
    if (filters?.level !== undefined) {
      query = query.eq('level', filters.level);
    }

    if (filters?.track) {
      query = query.eq('track', filters.track);
    }

    if (filters?.department_id) {
      query = query.eq('department_id', filters.department_id);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    if (filters?.search) {
      const escaped = escapeSearchString(filters.search);
      query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch cohort members: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as CohortMemberWithDetails[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single cohort member by ID
   */
  static async getCohortMemberById(id: string): Promise<CohortMemberWithDetails | null> {
    const { data, error } = await this.supabase.from('sh_cohort_members')
      .select(
        `
        *,
        department:departments(id, name:department_name, code:department_code),
        assignments:sh_cohort_assignments(*)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch cohort member: ${error.message}`);
    }

    return data as CohortMemberWithDetails;
  }

  /**
   * Get cohort member by user ID
   */
  static async getCohortMemberByUserId(userId: string): Promise<CohortMemberWithDetails | null> {
    const { data, error } = await this.supabase.from('sh_cohort_members')
      .select(
        `
        *,
        department:departments(id, name:department_name, code:department_code)
      `
      )
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch cohort member: ${error.message}`);
    }

    return data as CohortMemberWithDetails;
  }

  /**
   * Create a new cohort member
   */
  static async createCohortMember(input: CreateCohortMemberInput): Promise<CohortMember> {
    const { data, error } = await this.supabase.from('sh_cohort_members')
      .insert({
        user_id: input.user_id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        department_id: input.department_id,
        level: input.level || 'observer',
        track: input.track,
        is_active: true,
        sessions_observed: 0,
        sessions_co_led: 0,
        sessions_led: 0,
        total_earnings: 0,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create cohort member: ${error.message}`);
    return data as CohortMember;
  }

  /**
   * Update a cohort member
   */
  static async updateCohortMember(
    id: string,
    input: UpdateCohortMemberInput
  ): Promise<CohortMember> {
    const { data, error } = await this.supabase.from('sh_cohort_members')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update cohort member: ${error.message}`);
    return data as CohortMember;
  }

  /**
   * Delete a cohort member
   */
  static async deleteCohortMember(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_cohort_members').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete cohort member: ${error.message}`);
  }

  /**
   * Level up a cohort member
   */
  static async levelUpCohortMember(id: string): Promise<CohortMember> {
    // Get current level
    const { data: member, error: fetchError } = await this.supabase.from('sh_cohort_members')
      .select('level')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error(`Failed to fetch cohort member: ${fetchError.message}`);
    if (!member) throw new Error('Cohort member not found');

    const currentLevel = member.level || 0;
    if (currentLevel >= 3) {
      throw new Error('Already at maximum level');
    }

    const { data, error } = await this.supabase.from('sh_cohort_members')
      .update({
        level: currentLevel + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to level up cohort member: ${error.message}`);
    return data as CohortMember;
  }

  /**
   * Update cohort member earnings
   */
  static async addEarnings(id: string, amount: number): Promise<CohortMember> {
    const { data: member, error: fetchError } = await this.supabase.from('sh_cohort_members')
      .select('total_earnings')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error(`Failed to fetch cohort member: ${fetchError.message}`);

    const currentEarnings = member?.total_earnings || 0;

    const { data, error } = await this.supabase.from('sh_cohort_members')
      .update({
        total_earnings: currentEarnings + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update earnings: ${error.message}`);
    return data as CohortMember;
  }

  /**
   * Get cohort member statistics
   */
  static async getCohortStats(): Promise<{
    total: number;
    byLevel: Record<string, number>;
    byTrack: Record<string, number>;
    activeMembers: number;
  }> {
    const { data, error } = await this.supabase.from('sh_cohort_members')
      .select('level, track, is_active');

    if (error) throw new Error(`Failed to fetch cohort stats: ${error.message}`);

    const stats = {
      total: data?.length || 0,
      byLevel: { observer: 0, co_lead: 0, lead: 0, master: 0 } as Record<string, number>,
      byTrack: { track_a: 0, track_b: 0, both: 0 } as Record<string, number>,
      activeMembers: 0,
    };

    data?.forEach((member) => {
      if (member.level) {
        stats.byLevel[member.level] = (stats.byLevel[member.level] || 0) + 1;
      }
      if (member.track) {
        stats.byTrack[member.track] = (stats.byTrack[member.track] || 0) + 1;
      }
      if (member.is_active) {
        stats.activeMembers++;
      }
    });

    return stats;
  }

  /**
   * Get level display info
   */
  static getLevelInfo(level: number): {
    title: string;
    description: string;
    color: string;
  } {
    const levelInfo = COHORT_LEVELS.find((l) => l.level === level);

    return {
      title: levelInfo?.title || 'Unknown',
      description: levelInfo?.description || '',
      color: LEVEL_COLORS[level] || 'bg-gray-100 text-gray-800',
    };
  }

  /**
   * Get track display label
   */
  static getTrackDisplayLabel(track: CohortTrack | null): string {
    if (!track) return 'Not specified';
    const labels: Record<CohortTrack, string> = {
      track_a: 'Track A (Community)',
      track_b: 'Track B (Corporate)',
      both: 'Both Tracks',
    };
    return labels[track];
  }

  /**
   * Get available sessions for a cohort member to claim
   */
  static async getAvailableSessionsForMember(
    memberId: string
  ): Promise<Array<{ id: string; title: string; session_date: string; program_id: string }>> {
    // Get member's track
    const { data: member } = await this.supabase.from('sh_cohort_members')
      .select('track')
      .eq('id', memberId)
      .single();

    if (!member) return [];

    // Get sessions that are scheduled and in the future
    const { data: sessions, error } = await this.supabase.from('sh_training_sessions')
      .select(
        `
        id,
        title,
        session_date,
        program_id,
        program:sh_training_programs(track)
      `
      )
      .eq('status', 'scheduled')
      .gte('session_date', new Date().toISOString().split('T')[0])
      .order('session_date', { ascending: true });

    if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);

    // Get member's existing assignments
    const { data: existingAssignments } = await this.supabase.from('sh_cohort_assignments')
      .select('session_id')
      .eq('cohort_member_id', memberId);

    const assignedSessionIds = new Set(existingAssignments?.map((a) => a.session_id) || []);

    return (
      sessions?.filter((session) => {
        // Skip if already assigned
        if (assignedSessionIds.has(session.id)) return false;

        // If member has a track, check if program matches
        if (member.track && member.track !== 'both') {
          const programData = Array.isArray(session.program) ? session.program[0] : session.program;
          const programTrack = programData?.track;
          if (programTrack && programTrack !== member.track) return false;
        }

        return true;
      }) || []
    );
  }

  /**
   * Get cohort assignment details
   */
  static async getAssignmentsByMemberId(memberId: string): Promise<CohortAssignment[]> {
    const { data, error } = await this.supabase.from('sh_cohort_assignments')
      .select('*')
      .eq('cohort_member_id', memberId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch assignments: ${error.message}`);
    return data as CohortAssignment[];
  }

  /**
   * Update cohort assignment (earnings, rating, feedback)
   */
  static async updateAssignment(
    id: string,
    input: {
      earnings?: number;
      rating?: number;
      feedback?: string;
    }
  ): Promise<CohortAssignment> {
    const { data, error } = await this.supabase.from('sh_cohort_assignments')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update assignment: ${error.message}`);
    return data as CohortAssignment;
  }
}

// Export singleton instance methods
export const cohortService = {
  getCohortMembers: CohortService.getCohortMembers.bind(CohortService),
  getCohortMemberById: CohortService.getCohortMemberById.bind(CohortService),
  getCohortMemberByUserId: CohortService.getCohortMemberByUserId.bind(CohortService),
  createCohortMember: CohortService.createCohortMember.bind(CohortService),
  updateCohortMember: CohortService.updateCohortMember.bind(CohortService),
  deleteCohortMember: CohortService.deleteCohortMember.bind(CohortService),
  levelUpCohortMember: CohortService.levelUpCohortMember.bind(CohortService),
  addEarnings: CohortService.addEarnings.bind(CohortService),
  getCohortStats: CohortService.getCohortStats.bind(CohortService),
  getLevelInfo: CohortService.getLevelInfo.bind(CohortService),
  getTrackDisplayLabel: CohortService.getTrackDisplayLabel.bind(CohortService),
  getAvailableSessionsForMember: CohortService.getAvailableSessionsForMember.bind(CohortService),
  getAssignmentsByMemberId: CohortService.getAssignmentsByMemberId.bind(CohortService),
  updateAssignment: CohortService.updateAssignment.bind(CohortService),
  COHORT_LEVELS,
  LEVEL_COLORS,
};
