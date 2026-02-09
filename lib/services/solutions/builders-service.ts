// lib/services/solutions/builders-service.ts
// CRUD operations for sh_builders, sh_builder_skills, sh_builder_assignments

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  Builder,
  BuilderSkill,
  BuilderAssignment,
  AssignmentStatus,
  BuilderRole,
  CreateBuilderInput,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface BuilderWithDetails extends Builder {
  skills?: BuilderSkill[];
  assignments?: BuilderAssignmentWithPhase[];
  department?: {
    id: string;
    name: string;
    code: string;
    department_name?: string;
    department_code?: string;
  };
}

export interface BuilderAssignmentWithPhase extends BuilderAssignment {
  phase?: {
    id: string;
    title: string;
    phase_number: number;
    status: string;
    estimated_value?: number;
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
  builder?: {
    id: string;
    name: string;
    email: string | null;
  };
}

export interface BuilderFilters extends PaginationParams {
  department_id?: string;
  is_active?: boolean;
  has_skill?: string;
}

export interface UpdateBuilderInput {
  name?: string;
  email?: string;
  phone?: string;
  department_id?: string;
  is_active?: boolean;
  hourly_rate?: number;
  specialization?: string;
  availability_status?: string;
  bio?: string;
}

export interface AddSkillInput {
  builder_id: string;
  skill_name: string;
  proficiency_level?: number;
  assessed_date?: string;
}

export interface CreateAssignmentInput {
  phase_id: string;
  builder_id: string;
  role?: BuilderRole;
}

export interface ApprovalResult {
  approved: boolean;
  approver_type: 'self' | 'hod' | 'md';
  message: string;
}

// ============================================
// CONSTANTS
// ============================================

// Approval thresholds from spec
export const APPROVAL_THRESHOLDS = {
  SELF_CLAIM_MAX: 300000, // <= 3 Lakh - self-claim or HOD
  MD_REQUIRED_MIN: 300001, // > 3 Lakh - MD required
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

export class BuildersService extends BaseService {
  /**
   * Get all builders with optional filters and pagination
   */
  static async getBuilders(
    filters?: BuilderFilters
  ): Promise<BaseListResponse<BuilderWithDetails>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase.from('sh_builders')
      .select(
        `
        *,
        department:departments(id, name:department_name, code:department_code),
        skills:sh_builder_skills(*)
      `,
        { count: 'exact' }
      )
      .order('name', { ascending: true });

    // Apply filters
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

    if (error) {
      console.error('[buildersService] Query error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        fullError: error
      });
      throw new Error(`Failed to fetch builders: ${error.message}`);
    }

    // Filter by skill if needed (post-query filter)
    let result = (data || []) as BuilderWithDetails[];
    if (filters?.has_skill) {
      result = result.filter((builder: BuilderWithDetails) =>
        builder.skills?.some((skill: BuilderSkill) =>
          skill.skill_name.toLowerCase().includes(filters.has_skill!.toLowerCase())
        )
      );
    }

    const total = count || 0;
    return {
      data: result,
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single builder by ID with all related data
   */
  static async getBuilderById(id: string): Promise<BuilderWithDetails | null> {
    const { data, error } = await this.supabase.from('sh_builders')
      .select(
        `
        *,
        department:departments(id, name:department_name, code:department_code),
        skills:sh_builder_skills(*)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch builder: ${error.message}`);
    }

    // Get assignments with phase info
    const { data: assignments } = await this.supabase.from('sh_builder_assignments')
      .select(
        `
        *,
        phase:sh_solution_phases(
          id,
          title,
          phase_number,
          status,
          estimated_value,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        )
      `
      )
      .eq('builder_id', id)
      .order('created_at', { ascending: false });

    return {
      ...data,
      assignments: assignments || [],
    } as BuilderWithDetails;
  }

  /**
   * Get builder by user ID
   */
  static async getBuilderByUserId(userId: string): Promise<BuilderWithDetails | null> {
    const { data, error } = await this.supabase.from('sh_builders')
      .select(
        `
        *,
        department:departments(id, name:department_name, code:department_code),
        skills:sh_builder_skills(*)
      `
      )
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch builder: ${error.message}`);
    }

    return data as BuilderWithDetails;
  }

  /**
   * Create a new builder
   * Automatically resolves user_id by matching email against auth.users
   * and/or checking staff.auth_user_id. Builder code is auto-generated by DB trigger.
   */
  static async createBuilder(input: CreateBuilderInput): Promise<Builder> {
    // Resolve user_id if not explicitly provided
    let resolvedUserId = input.user_id || null;
    if (!resolvedUserId) {
      const { data: rpcResult } = await this.supabase.rpc('sh_resolve_user_id', {
        p_email: input.email || null,
        p_staff_id: input.staff_id || null,
      });
      if (rpcResult) {
        resolvedUserId = rpcResult as string;
      }
    }

    const { data, error } = await this.supabase.from('sh_builders')
      .insert({
        name: input.name,
        email: input.email,
        phone: input.phone,
        user_id: resolvedUserId,
        learner_id: input.learner_id,
        staff_id: input.staff_id,
        department_id: input.department_id,
        trained_date: input.trained_date || new Date().toISOString().split('T')[0],
        hourly_rate: input.hourly_rate,
        specialization: input.specialization,
        availability_status: input.availability_status || 'available',
        bio: input.bio,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create builder: ${error.message}`);
    return data as Builder;
  }

  /**
   * Search learners and staff who are not yet builders
   */
  static async searchPeople(
    search: string,
    limit = 20
  ): Promise<Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    department_id: string | null;
    department_name: string | null;
    type: 'learner' | 'staff';
    designation: string | null;
    roll_number: string | null;
  }>> {
    const escaped = escapeSearchString(search);
    const results: Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      department_id: string | null;
      department_name: string | null;
      type: 'learner' | 'staff';
      designation: string | null;
      roll_number: string | null;
    }> = [];

    // Get existing builder learner_ids and staff_ids to exclude
    const { data: existingBuilders } = await this.supabase.from('sh_builders')
      .select('learner_id, staff_id');
    const existingLearnerIds = new Set(
      (existingBuilders || [])
        .map((b: { learner_id: string | null }) => b.learner_id)
        .filter(Boolean)
    );
    const existingStaffIds = new Set(
      (existingBuilders || [])
        .map((b: { staff_id: string | null }) => b.staff_id)
        .filter(Boolean)
    );

    // Search learners
    const { data: learners } = await this.supabase.from('learners_profiles')
      .select('id, first_name, last_name, student_email, student_mobile, college_email, department_id, roll_number, department:departments(department_name)')
      .or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,roll_number.ilike.%${escaped}%`)
      .in('lifecycle_status', ['approved', 'active', 'graduated'])
      .limit(limit);

    if (learners) {
      for (const l of learners) {
        if (existingLearnerIds.has(l.id)) continue;
        const dept = l.department as { department_name?: string } | null;
        results.push({
          id: l.id,
          name: `${l.first_name || ''} ${l.last_name || ''}`.trim(),
          email: l.college_email || l.student_email || null,
          phone: l.student_mobile || null,
          department_id: l.department_id,
          department_name: dept?.department_name || null,
          type: 'learner',
          designation: null,
          roll_number: l.roll_number || null,
        });
      }
    }

    // Search staff
    const { data: staffMembers } = await this.supabase.from('staff')
      .select('id, first_name, last_name, email, institution_email, phone, department_id, designation, department:departments!fk_staff_department(department_name)')
      .or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%,designation.ilike.%${escaped}%`)
      .eq('is_active', true)
      .limit(limit);

    if (staffMembers) {
      for (const s of staffMembers) {
        if (existingStaffIds.has(s.id)) continue;
        const dept = s.department as { department_name?: string } | null;
        results.push({
          id: s.id,
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
          email: s.institution_email || s.email || null,
          phone: s.phone || null,
          department_id: s.department_id,
          department_name: dept?.department_name || null,
          type: 'staff',
          designation: s.designation || null,
          roll_number: null,
        });
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Update an existing builder
   */
  static async updateBuilder(id: string, input: UpdateBuilderInput): Promise<Builder> {
    const { data, error } = await this.supabase.from('sh_builders')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update builder: ${error.message}`);
    return data as Builder;
  }

  /**
   * Delete a builder
   */
  static async deleteBuilder(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_builders').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete builder: ${error.message}`);
  }

  // ============================================
  // SKILL MANAGEMENT
  // ============================================

  /**
   * Add a skill to a builder
   */
  static async addBuilderSkill(input: AddSkillInput): Promise<BuilderSkill> {
    const { data, error } = await this.supabase.from('sh_builder_skills')
      .insert({
        builder_id: input.builder_id,
        skill_name: input.skill_name,
        proficiency_level: input.proficiency_level || 1,
        assessed_date: input.assessed_date || new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add skill: ${error.message}`);
    return data as BuilderSkill;
  }

  /**
   * Update a builder skill proficiency
   */
  static async updateBuilderSkill(
    id: string,
    input: { proficiency_level: number }
  ): Promise<BuilderSkill> {
    const { data, error } = await this.supabase.from('sh_builder_skills')
      .update({ proficiency_level: input.proficiency_level })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update skill: ${error.message}`);
    return data as BuilderSkill;
  }

  /**
   * Remove a builder skill
   */
  static async removeBuilderSkill(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_builder_skills').delete().eq('id', id);

    if (error) throw new Error(`Failed to remove skill: ${error.message}`);
  }

  /**
   * Get skills for a builder
   */
  static async getBuilderSkills(builderId: string): Promise<BuilderSkill[]> {
    const { data, error } = await this.supabase.from('sh_builder_skills')
      .select('*')
      .eq('builder_id', builderId)
      .order('skill_name', { ascending: true });

    if (error) throw new Error(`Failed to fetch skills: ${error.message}`);
    return data as BuilderSkill[];
  }

  // ============================================
  // ASSIGNMENT MANAGEMENT
  // ============================================

  /**
   * Check if assignment needs approval and from whom
   */
  static async checkAssignmentApproval(phaseId: string): Promise<ApprovalResult> {
    const { data: phase, error } = await this.supabase.from('sh_solution_phases')
      .select('estimated_value')
      .eq('id', phaseId)
      .single();

    if (error) throw new Error(`Failed to check phase value: ${error.message}`);

    const value = phase?.estimated_value || 0;

    if (value <= APPROVAL_THRESHOLDS.SELF_CLAIM_MAX) {
      return {
        approved: true,
        approver_type: 'self',
        message: 'Assignment can be self-claimed or approved by HOD',
      };
    }

    return {
      approved: false,
      approver_type: 'md',
      message: `Assignment requires MD approval (value > 3L)`,
    };
  }

  /**
   * Request assignment to a phase
   */
  static async requestAssignment(input: CreateAssignmentInput): Promise<BuilderAssignment> {
    // Check approval requirements
    const approval = await this.checkAssignmentApproval(input.phase_id);

    const { data, error } = await this.supabase.from('sh_builder_assignments')
      .insert({
        phase_id: input.phase_id,
        builder_id: input.builder_id,
        role: input.role || 'contributor',
        status: approval.approved ? 'approved' : 'requested',
        requested_at: new Date().toISOString(),
        approved_at: approval.approved ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create assignment: ${error.message}`);
    return data as BuilderAssignment;
  }

  /**
   * Approve a pending assignment
   */
  static async approveAssignment(id: string, approverId: string): Promise<BuilderAssignment> {
    const { data, error } = await this.supabase.from('sh_builder_assignments')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: approverId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to approve assignment: ${error.message}`);
    return data as BuilderAssignment;
  }

  /**
   * Start working on an assignment
   */
  static async startAssignment(id: string): Promise<BuilderAssignment> {
    const { data, error } = await this.supabase.from('sh_builder_assignments')
      .update({
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to start assignment: ${error.message}`);
    return data as BuilderAssignment;
  }

  /**
   * Complete an assignment
   */
  static async completeAssignment(id: string): Promise<BuilderAssignment> {
    const { data, error } = await this.supabase.from('sh_builder_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to complete assignment: ${error.message}`);
    return data as BuilderAssignment;
  }

  /**
   * Withdraw from an assignment
   */
  static async withdrawAssignment(id: string): Promise<BuilderAssignment> {
    const { data, error } = await this.supabase.from('sh_builder_assignments')
      .update({
        status: 'withdrawn',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to withdraw assignment: ${error.message}`);
    return data as BuilderAssignment;
  }

  /**
   * Get assignments by status
   */
  static async getAssignmentsByStatus(
    status: AssignmentStatus
  ): Promise<BuilderAssignmentWithPhase[]> {
    const { data, error } = await this.supabase.from('sh_builder_assignments')
      .select(
        `
        *,
        builder:sh_builders(id, name, email),
        phase:sh_solution_phases(
          id,
          title,
          phase_number,
          estimated_value,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        )
      `
      )
      .eq('status', status)
      .order('requested_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch assignments: ${error.message}`);
    return data as BuilderAssignmentWithPhase[];
  }

  /**
   * Get pending assignment requests
   */
  static async getPendingAssignmentRequests(): Promise<BuilderAssignmentWithPhase[]> {
    return this.getAssignmentsByStatus('requested');
  }

  /**
   * Get available builders for a phase (not already assigned)
   */
  static async getAvailableBuildersForPhase(phaseId: string): Promise<BuilderWithDetails[]> {
    // Get builders already assigned to this phase
    const { data: existingAssignments } = await this.supabase.from('sh_builder_assignments')
      .select('builder_id')
      .eq('phase_id', phaseId)
      .in('status', ['requested', 'approved', 'active']);

    const assignedBuilderIds = existingAssignments?.map((a: { builder_id: string }) => a.builder_id) || [];

    // Get all active builders not assigned
    let query = this.supabase.from('sh_builders')
      .select(
        `
        *,
        department:departments(id, name:department_name, code:department_code),
        skills:sh_builder_skills(*)
      `
      )
      .eq('is_active', true)
      .order('name', { ascending: true });

    // Filter out assigned builders using .not('id', 'in', ...) instead of multiple .neq()
    if (assignedBuilderIds.length > 0) {
      query = query.not('id', 'in', `(${assignedBuilderIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch available builders: ${error.message}`);
    return data as BuilderWithDetails[];
  }

  /**
   * Get builder statistics
   */
  static async getBuilderStats(): Promise<{
    total: number;
    active: number;
    byDepartment: Record<string, number>;
    totalSkills: number;
    activeAssignments: number;
  }> {
    const { data: builders, error: buildersError } = await this.supabase.from('sh_builders')
      .select('id, is_active, department_id');

    if (buildersError) throw new Error(`Failed to fetch builder stats: ${buildersError.message}`);

    const { data: skills, error: skillsError } = await this.supabase.from('sh_builder_skills')
      .select('id');

    if (skillsError) throw new Error(`Failed to fetch skills count: ${skillsError.message}`);

    const { data: assignments, error: assignmentsError } = await this.supabase.from('sh_builder_assignments')
      .select('id')
      .eq('status', 'active');

    if (assignmentsError)
      throw new Error(`Failed to fetch assignments count: ${assignmentsError.message}`);

    const byDepartment: Record<string, number> = {};
    let active = 0;

    builders?.forEach((builder: { is_active: boolean; department_id: string | null }) => {
      if (builder.is_active) active++;
      if (builder.department_id) {
        byDepartment[builder.department_id] = (byDepartment[builder.department_id] || 0) + 1;
      }
    });

    return {
      total: builders?.length || 0,
      active,
      byDepartment,
      totalSkills: skills?.length || 0,
      activeAssignments: assignments?.length || 0,
    };
  }
}

// Export singleton instance methods
export const buildersService = {
  getBuilders: BuildersService.getBuilders.bind(BuildersService),
  getBuilderById: BuildersService.getBuilderById.bind(BuildersService),
  getBuilderByUserId: BuildersService.getBuilderByUserId.bind(BuildersService),
  createBuilder: BuildersService.createBuilder.bind(BuildersService),
  updateBuilder: BuildersService.updateBuilder.bind(BuildersService),
  deleteBuilder: BuildersService.deleteBuilder.bind(BuildersService),
  addBuilderSkill: BuildersService.addBuilderSkill.bind(BuildersService),
  updateBuilderSkill: BuildersService.updateBuilderSkill.bind(BuildersService),
  removeBuilderSkill: BuildersService.removeBuilderSkill.bind(BuildersService),
  getBuilderSkills: BuildersService.getBuilderSkills.bind(BuildersService),
  checkAssignmentApproval: BuildersService.checkAssignmentApproval.bind(BuildersService),
  requestAssignment: BuildersService.requestAssignment.bind(BuildersService),
  approveAssignment: BuildersService.approveAssignment.bind(BuildersService),
  startAssignment: BuildersService.startAssignment.bind(BuildersService),
  completeAssignment: BuildersService.completeAssignment.bind(BuildersService),
  withdrawAssignment: BuildersService.withdrawAssignment.bind(BuildersService),
  getAssignmentsByStatus: BuildersService.getAssignmentsByStatus.bind(BuildersService),
  getPendingAssignmentRequests: BuildersService.getPendingAssignmentRequests.bind(BuildersService),
  getAvailableBuildersForPhase: BuildersService.getAvailableBuildersForPhase.bind(BuildersService),
  getBuilderStats: BuildersService.getBuilderStats.bind(BuildersService),
  searchPeople: BuildersService.searchPeople.bind(BuildersService),
  APPROVAL_THRESHOLDS,
};
