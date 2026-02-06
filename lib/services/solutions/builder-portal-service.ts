// lib/services/solutions/builder-portal-service.ts
// Builder Portal Service - talent-facing operations for builders
// CRUD operations for builder's own profile, assignments, skills, and earnings

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  Builder,
  BuilderSkill,
  BuilderAssignment,
  SolutionPhase,
  AssignmentStatus,
  BuilderRole,
} from './types';

// ============================================
// TYPES
// ============================================

export interface BuilderWithDetails extends Builder {
  department?: {
    id: string;
    name: string;
    code: string;
  };
  skills?: BuilderSkill[];
  assignments_count?: number;
}

export interface BuilderAssignmentWithPhase extends BuilderAssignment {
  phase?: SolutionPhase & {
    solution?: {
      id: string;
      title: string;
      solution_code: string;
      client?: {
        id: string;
        name: string;
      };
    };
  };
}

export interface AvailablePhase extends SolutionPhase {
  solution?: {
    id: string;
    title: string;
    solution_code: string;
    client?: {
      id: string;
      name: string;
    };
  };
  required_skills?: string[];
  current_builders_count?: number;
}

export interface BuilderEarningsSummary {
  total_earnings: number;
  pending_earnings: number;
  paid_earnings: number;
  earnings_by_month: Array<{
    month: string;
    amount: number;
  }>;
  recent_earnings: Array<{
    id: string;
    amount: number;
    status: string;
    payment_id: string;
    created_at: string;
    phase_title?: string;
  }>;
}

export interface PortalOverview {
  builder: BuilderWithDetails;
  active_assignments: number;
  completed_assignments: number;
  pending_assignments: number;
  total_earnings: number;
  skills_count: number;
  available_phases_count: number;
  recent_activity: Array<{
    type: 'assignment' | 'earning' | 'skill';
    title: string;
    date: string;
    status?: string;
  }>;
}

// ============================================
// SERVICE CLASS
// ============================================

export class BuilderPortalService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================
  // PROFILE OPERATIONS
  // ============================================

  /**
   * Get builder profile by user ID (for logged-in user)
   */
  static async getBuilderByUserId(userId: string): Promise<BuilderWithDetails | null> {
    const { data, error } = await (this.supabase as any)
      .from('sh_builders')
      .select(`
        *,
        department:departments(id, department_name, department_code),
        skills:sh_builder_skills(*)
      `)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch builder profile: ${error.message}`);
    }

    return data as BuilderWithDetails;
  }

  /**
   * Get portal overview/dashboard data
   */
  static async getPortalOverview(builderId: string): Promise<PortalOverview> {
    // Fetch builder with details
    const { data: builder, error: builderError } = await (this.supabase as any)
      .from('sh_builders')
      .select(`
        *,
        department:departments(id, department_name, department_code),
        skills:sh_builder_skills(*)
      `)
      .eq('id', builderId)
      .single();

    if (builderError) {
      throw new Error(`Failed to fetch builder: ${builderError.message}`);
    }

    // Fetch assignment counts
    const { data: assignments, error: assignmentsError } = await (this.supabase as any)
      .from('sh_builder_assignments')
      .select('status')
      .eq('builder_id', builderId);

    if (assignmentsError) {
      throw new Error(`Failed to fetch assignments: ${assignmentsError.message}`);
    }

    const activeCount = assignments?.filter(a => a.status === 'active').length || 0;
    const completedCount = assignments?.filter(a => a.status === 'completed').length || 0;
    const pendingCount = assignments?.filter(a =>
      a.status === 'requested' || a.status === 'approved'
    ).length || 0;

    // Fetch available phases count
    const { count: availablePhasesCount } = await (this.supabase as any)
      .from('sh_solution_phases')
      .select('id', { count: 'exact', head: true })
      .in('status', ['prototype_building', 'revisions', 'deploying'])
      .is('owner_user_id', null);

    // Fetch recent activity (assignments and earnings)
    const { data: recentAssignments } = await (this.supabase as any)
      .from('sh_builder_assignments')
      .select(`
        id,
        status,
        created_at,
        phase:sh_solution_phases(title)
      `)
      .eq('builder_id', builderId)
      .order('created_at', { ascending: false })
      .limit(5);

    const recentActivity: PortalOverview['recent_activity'] = (recentAssignments || []).map(a => ({
      type: 'assignment' as const,
      title: (a.phase as { title?: string })?.title || 'Unknown Phase',
      date: a.created_at,
      status: a.status,
    }));

    return {
      builder: builder as BuilderWithDetails,
      active_assignments: activeCount,
      completed_assignments: completedCount,
      pending_assignments: pendingCount,
      total_earnings: builder?.total_earnings || 0,
      skills_count: builder?.skills?.length || 0,
      available_phases_count: availablePhasesCount || 0,
      recent_activity: recentActivity,
    };
  }

  // ============================================
  // ASSIGNMENT OPERATIONS
  // ============================================

  /**
   * Get my assignments with optional status filter
   */
  static async getMyAssignments(
    builderId: string,
    statusFilter?: AssignmentStatus
  ): Promise<BuilderAssignmentWithPhase[]> {
    let query = (this.supabase as any)
      .from('sh_builder_assignments')
      .select(`
        *,
        phase:sh_solution_phases(
          *,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        )
      `)
      .eq('builder_id', builderId)
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch assignments: ${error.message}`);
    }

    return (data || []) as BuilderAssignmentWithPhase[];
  }

  /**
   * Get available phases to claim
   */
  static async getAvailablePhases(builderId: string): Promise<AvailablePhase[]> {
    // Get builder's skills
    const { data: builderSkills } = await (this.supabase as any)
      .from('sh_builder_skills')
      .select('skill_name')
      .eq('builder_id', builderId);

    const skillNames = builderSkills?.map(s => s.skill_name) || [];

    // Get phases that are available for work (not assigned or need more builders)
    // Phases in prototype_building, revisions, or deploying status
    const { data: phases, error } = await (this.supabase as any)
      .from('sh_solution_phases')
      .select(`
        *,
        solution:sh_solutions(
          id,
          title,
          solution_code,
          client:sh_clients(id, name)
        )
      `)
      .in('status', ['prototype_building', 'revisions', 'deploying'])
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch available phases: ${error.message}`);
    }

    // Get existing assignments for the builder to exclude already claimed phases
    const { data: existingAssignments } = await (this.supabase as any)
      .from('sh_builder_assignments')
      .select('phase_id')
      .eq('builder_id', builderId)
      .in('status', ['requested', 'approved', 'active']);

    const assignedPhaseIds = new Set(existingAssignments?.map(a => a.phase_id) || []);

    // Filter out phases the builder is already assigned to
    const availablePhases = phases?.filter(p => !assignedPhaseIds.has(p.id)) || [];

    return availablePhases as AvailablePhase[];
  }

  /**
   * Claim a phase (self-claim workflow)
   */
  static async claimPhase(
    phaseId: string,
    builderId: string,
    role: BuilderRole = 'contributor'
  ): Promise<BuilderAssignment> {
    // Check if already assigned
    const { data: existing } = await (this.supabase as any)
      .from('sh_builder_assignments')
      .select('id')
      .eq('phase_id', phaseId)
      .eq('builder_id', builderId)
      .single();

    if (existing) {
      throw new Error('You are already assigned to this phase');
    }

    // Create assignment request
    const { data, error } = await (this.supabase as any)
      .from('sh_builder_assignments')
      .insert({
        phase_id: phaseId,
        builder_id: builderId,
        role: role,
        status: 'requested',
        requested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to claim phase: ${error.message}`);
    }

    return data as BuilderAssignment;
  }

  /**
   * Start working on a phase (move from approved to active)
   */
  static async startPhaseWork(assignmentId: string): Promise<BuilderAssignment> {
    const { data, error } = await (this.supabase as any)
      .from('sh_builder_assignments')
      .update({
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .eq('status', 'approved')
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Assignment not found or not in approved status');
      }
      throw new Error(`Failed to start phase work: ${error.message}`);
    }

    return data as BuilderAssignment;
  }

  /**
   * Complete phase work
   */
  static async completePhaseWork(assignmentId: string): Promise<BuilderAssignment> {
    const { data, error } = await (this.supabase as any)
      .from('sh_builder_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .eq('status', 'active')
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Assignment not found or not in active status');
      }
      throw new Error(`Failed to complete phase work: ${error.message}`);
    }

    return data as BuilderAssignment;
  }

  /**
   * Withdraw from a phase
   */
  static async withdrawFromPhase(assignmentId: string): Promise<BuilderAssignment> {
    const { data, error } = await (this.supabase as any)
      .from('sh_builder_assignments')
      .update({
        status: 'withdrawn',
      })
      .eq('id', assignmentId)
      .in('status', ['requested', 'approved', 'active'])
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Assignment not found or cannot be withdrawn');
      }
      throw new Error(`Failed to withdraw from phase: ${error.message}`);
    }

    return data as BuilderAssignment;
  }

  // ============================================
  // SKILLS OPERATIONS
  // ============================================

  /**
   * Get my skills
   */
  static async getMySkills(builderId: string): Promise<BuilderSkill[]> {
    const { data, error } = await (this.supabase as any)
      .from('sh_builder_skills')
      .select('*')
      .eq('builder_id', builderId)
      .order('skill_name', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch skills: ${error.message}`);
    }

    return (data || []) as BuilderSkill[];
  }

  /**
   * Add a skill to my profile
   */
  static async addMySkill(
    builderId: string,
    skillName: string,
    proficiencyLevel: number = 1
  ): Promise<BuilderSkill> {
    const { data, error } = await (this.supabase as any)
      .from('sh_builder_skills')
      .insert({
        builder_id: builderId,
        skill_name: skillName,
        proficiency_level: proficiencyLevel,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('You already have this skill');
      }
      throw new Error(`Failed to add skill: ${error.message}`);
    }

    return data as BuilderSkill;
  }

  /**
   * Update skill proficiency
   */
  static async updateMySkillProficiency(
    skillId: string,
    proficiencyLevel: number
  ): Promise<BuilderSkill> {
    if (proficiencyLevel < 1 || proficiencyLevel > 5) {
      throw new Error('Proficiency level must be between 1 and 5');
    }

    const { data, error } = await (this.supabase as any)
      .from('sh_builder_skills')
      .update({
        proficiency_level: proficiencyLevel,
      })
      .eq('id', skillId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Skill not found');
      }
      throw new Error(`Failed to update skill: ${error.message}`);
    }

    return data as BuilderSkill;
  }

  /**
   * Remove a skill from my profile
   */
  static async removeMySkill(skillId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('sh_builder_skills')
      .delete()
      .eq('id', skillId);

    if (error) {
      throw new Error(`Failed to remove skill: ${error.message}`);
    }
  }

  // ============================================
  // EARNINGS OPERATIONS
  // ============================================

  /**
   * Get my earnings summary
   */
  static async getMyEarnings(builderId: string): Promise<BuilderEarningsSummary> {
    // Get earnings from ledger
    const { data: earnings, error } = await (this.supabase as any)
      .from('sh_earnings_ledger')
      .select(`
        *,
        payment:sh_payments(
          id,
          payment_code,
          phase:sh_solution_phases(title)
        )
      `)
      .eq('builder_id', builderId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch earnings: ${error.message}`);
    }

    const earningsData = earnings || [];

    // Calculate totals
    const totalEarnings = earningsData.reduce((sum, e) => sum + (e.amount || 0), 0);
    const pendingEarnings = earningsData
      .filter(e => e.status === 'pending' || e.status === 'approved')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    const paidEarnings = earningsData
      .filter(e => e.status === 'paid')
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    // Group by month
    const earningsByMonth = new Map<string, number>();
    earningsData.forEach(e => {
      const month = new Date(e.created_at).toISOString().slice(0, 7);
      earningsByMonth.set(month, (earningsByMonth.get(month) || 0) + (e.amount || 0));
    });

    const earningsByMonthArray = Array.from(earningsByMonth.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 6);

    // Recent earnings
    const recentEarnings = earningsData.slice(0, 10).map(e => ({
      id: e.id,
      amount: e.amount,
      status: e.status,
      payment_id: e.payment_id,
      created_at: e.created_at,
      phase_title: (e.payment as { phase?: { title?: string } })?.phase?.title,
    }));

    return {
      total_earnings: totalEarnings,
      pending_earnings: pendingEarnings,
      paid_earnings: paidEarnings,
      earnings_by_month: earningsByMonthArray,
      recent_earnings: recentEarnings,
    };
  }
}

// Export singleton instance methods
export const builderPortalService = {
  getBuilderByUserId: BuilderPortalService.getBuilderByUserId.bind(BuilderPortalService),
  getPortalOverview: BuilderPortalService.getPortalOverview.bind(BuilderPortalService),
  getMyAssignments: BuilderPortalService.getMyAssignments.bind(BuilderPortalService),
  getAvailablePhases: BuilderPortalService.getAvailablePhases.bind(BuilderPortalService),
  claimPhase: BuilderPortalService.claimPhase.bind(BuilderPortalService),
  startPhaseWork: BuilderPortalService.startPhaseWork.bind(BuilderPortalService),
  completePhaseWork: BuilderPortalService.completePhaseWork.bind(BuilderPortalService),
  withdrawFromPhase: BuilderPortalService.withdrawFromPhase.bind(BuilderPortalService),
  getMySkills: BuilderPortalService.getMySkills.bind(BuilderPortalService),
  addMySkill: BuilderPortalService.addMySkill.bind(BuilderPortalService),
  updateMySkillProficiency: BuilderPortalService.updateMySkillProficiency.bind(BuilderPortalService),
  removeMySkill: BuilderPortalService.removeMySkill.bind(BuilderPortalService),
  getMyEarnings: BuilderPortalService.getMyEarnings.bind(BuilderPortalService),
};
