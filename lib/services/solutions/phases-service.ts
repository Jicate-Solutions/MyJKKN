// lib/services/solutions/phases-service.ts
// CRUD operations for sh_solution_phases and related tables

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  SolutionPhase,
  PhaseStatus,
  PrototypeIteration,
  BugReport,
  PhaseDeployment,
  ImplementationUser,
  BuilderAssignment,
  CreatePhaseInput,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface PhaseWithDetails extends SolutionPhase {
  solution?: {
    id: string;
    title: string;
    solution_code: string;
    client?: {
      id: string;
      name: string;
    };
  };
  assignments?: Array<
    BuilderAssignment & {
      builder?: {
        id: string;
        name: string;
        email: string | null;
      };
    }
  >;
  iterations?: PrototypeIteration[];
  deployments?: PhaseDeployment[];
}

export interface PhaseFilters extends PaginationParams {
  solution_id?: string;
  status?: PhaseStatus;
  owner_department_id?: string;
}

export interface UpdatePhaseInput {
  title?: string;
  description?: string;
  status?: PhaseStatus;
  owner_department_id?: string;
  estimated_value?: number;
  start_date?: string;
  due_date?: string;
  completion_date?: string;
  requirements_doc_url?: string;
  notes?: string;
}

export interface CreateIterationInput {
  phase_id: string;
  prototype_url: string;
  changes_made?: string;
  demo_date?: string;
}

export interface CreateBugReportInput {
  iteration_id: string;
  reported_by: string;
  description: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  screenshots_urls?: string[];
}

export interface CreateDeploymentInput {
  phase_id: string;
  environment: 'staging' | 'production';
  version?: string;
  vercel_url?: string;
  supabase_project_id?: string;
  custom_domain?: string;
  deployed_date: string;
  deployed_by: string;
}

// ============================================
// CONSTANTS
// ============================================

export const PHASE_STATUSES: Array<{ value: PhaseStatus; label: string; description: string }> = [
  { value: 'prospecting', label: 'Prospecting', description: 'Initial client identification' },
  { value: 'discovery', label: 'Discovery', description: 'Requirements gathering and analysis' },
  { value: 'prd_writing', label: 'PRD Writing', description: 'Creating product requirements document' },
  {
    value: 'prototype_building',
    label: 'Prototype Building',
    description: 'Building initial prototype',
  },
  { value: 'client_demo', label: 'Client Demo', description: 'Demonstrating prototype to client' },
  { value: 'revisions', label: 'Revisions', description: 'Making changes based on feedback' },
  { value: 'approved', label: 'Approved', description: 'Client has approved the prototype' },
  { value: 'deploying', label: 'Deploying', description: 'Deploying to production environment' },
  { value: 'training', label: 'Training', description: 'Training client users' },
  { value: 'live', label: 'Live', description: 'Application is live and in use' },
  { value: 'in_amc', label: 'In AMC', description: 'Under annual maintenance contract' },
  { value: 'completed', label: 'Completed', description: 'Phase is fully complete' },
  { value: 'on_hold', label: 'On Hold', description: 'Phase is temporarily paused' },
  { value: 'cancelled', label: 'Cancelled', description: 'Phase has been cancelled' },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeSearchString(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

// ============================================
// SERVICE CLASS
// ============================================

export class PhasesService extends BaseService {
  /**
   * Get all phases with optional filters and pagination
   */
  static async getPhases(filters?: PhaseFilters): Promise<BaseListResponse<PhaseWithDetails>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase.from('sh_solution_phases')
      .select(
        `
        *,
        solution:sh_solutions(
          id,
          title,
          solution_code,
          client:sh_clients(id, name)
        ),
        assignments:sh_builder_assignments(
          id,
          builder_id,
          role,
          status,
          builder:sh_builders(id, name, email)
        )
      `,
        { count: 'exact' }
      )
      .order('phase_number', { ascending: true });

    // Apply filters
    if (filters?.solution_id) {
      query = query.eq('solution_id', filters.solution_id);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.owner_department_id) {
      query = query.eq('owner_department_id', filters.owner_department_id);
    }

    if (filters?.search) {
      const escaped = escapeSearchString(filters.search);
      query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch phases: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as PhaseWithDetails[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single phase by ID with all related data
   */
  static async getPhaseById(id: string): Promise<PhaseWithDetails | null> {
    const { data, error } = await this.supabase.from('sh_solution_phases')
      .select(
        `
        *,
        solution:sh_solutions(
          id,
          title,
          solution_code,
          client:sh_clients(id, name)
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch phase: ${error.message}`);
    }

    // Get assignments with builder info
    const { data: assignments } = await this.supabase.from('sh_builder_assignments')
      .select(
        `
        *,
        builder:sh_builders(id, name, email)
      `
      )
      .eq('phase_id', id)
      .order('created_at', { ascending: false });

    // Get iterations
    const { data: iterations } = await this.supabase.from('sh_prototype_iterations')
      .select('*')
      .eq('phase_id', id)
      .order('version', { ascending: false });

    // Get deployments
    const { data: deployments } = await this.supabase.from('sh_phase_deployments')
      .select('*')
      .eq('phase_id', id)
      .order('deployed_date', { ascending: false });

    return {
      ...data,
      assignments: assignments || [],
      iterations: iterations || [],
      deployments: deployments || [],
    } as PhaseWithDetails;
  }

  /**
   * Get phases by solution ID
   */
  static async getPhasesBySolutionId(
    solutionId: string,
    params?: PaginationParams
  ): Promise<BaseListResponse<PhaseWithDetails>> {
    return this.getPhases({ ...params, solution_id: solutionId });
  }

  /**
   * Create a new phase
   */
  static async createPhase(input: CreatePhaseInput): Promise<SolutionPhase> {
    // Get next phase number if not provided
    let phaseNumber = input.phase_number;
    if (!phaseNumber) {
      phaseNumber = await this.getNextPhaseNumber(input.solution_id);
    }

    const { data, error } = await this.supabase.from('sh_solution_phases')
      .insert({
        solution_id: input.solution_id,
        phase_number: phaseNumber,
        title: input.title,
        description: input.description,
        owner_department_id: input.owner_department_id,
        estimated_value: input.estimated_value,
        start_date: input.start_date || null,
        due_date: input.due_date || null,
        status: 'prospecting' as PhaseStatus,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create phase: ${error.message}`);
    return data as SolutionPhase;
  }

  /**
   * Update an existing phase
   */
  static async updatePhase(id: string, input: UpdatePhaseInput): Promise<SolutionPhase> {
    const { data, error } = await this.supabase.from('sh_solution_phases')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update phase: ${error.message}`);
    return data as SolutionPhase;
  }

  /**
   * Delete a phase
   */
  static async deletePhase(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_solution_phases').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete phase: ${error.message}`);
  }

  /**
   * Get next available phase number for a solution
   */
  static async getNextPhaseNumber(solutionId: string): Promise<number> {
    const { data, error } = await this.supabase.from('sh_solution_phases')
      .select('phase_number')
      .eq('solution_id', solutionId)
      .order('phase_number', { ascending: false })
      .limit(1);

    if (error) throw new Error(`Failed to get next phase number: ${error.message}`);

    return data && data.length > 0 ? data[0].phase_number + 1 : 1;
  }

  /**
   * Update phase status
   */
  static async updatePhaseStatus(id: string, status: PhaseStatus): Promise<SolutionPhase> {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    // Set completion date if status is completed
    if (status === 'completed') {
      updateData.completion_date = new Date().toISOString().split('T')[0];
    }

    const { data, error } = await this.supabase.from('sh_solution_phases')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update phase status: ${error.message}`);
    return data as SolutionPhase;
  }

  /**
   * Get phase statistics
   */
  static async getPhaseStats(): Promise<{
    total: number;
    byStatus: Record<PhaseStatus, number>;
    totalValue: number;
  }> {
    const { data, error } = await this.supabase.from('sh_solution_phases')
      .select('status, estimated_value');

    if (error) throw new Error(`Failed to fetch phase stats: ${error.message}`);

    const allStatuses: PhaseStatus[] = [
      'prospecting',
      'discovery',
      'prd_writing',
      'prototype_building',
      'client_demo',
      'revisions',
      'approved',
      'deploying',
      'training',
      'live',
      'in_amc',
      'completed',
      'on_hold',
      'cancelled',
    ];

    const byStatus = allStatuses.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<PhaseStatus, number>);

    let totalValue = 0;

    data?.forEach((phase) => {
      if (phase.status) {
        byStatus[phase.status as PhaseStatus]++;
      }
      if (phase.estimated_value) {
        totalValue += Number(phase.estimated_value);
      }
    });

    return {
      total: data?.length || 0,
      byStatus,
      totalValue,
    };
  }

  // ============================================
  // ITERATION MANAGEMENT
  // ============================================

  /**
   * Create a new prototype iteration
   */
  static async createIteration(input: CreateIterationInput): Promise<PrototypeIteration> {
    // Get next version number
    const { data: existing } = await this.supabase.from('sh_prototype_iterations')
      .select('version')
      .eq('phase_id', input.phase_id)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;

    const { data, error } = await this.supabase.from('sh_prototype_iterations')
      .insert({
        phase_id: input.phase_id,
        version: nextVersion,
        prototype_url: input.prototype_url,
        changes_made: input.changes_made,
        demo_date: input.demo_date,
        client_approved: false,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create iteration: ${error.message}`);
    return data as PrototypeIteration;
  }

  /**
   * Update iteration (feedback, client approval)
   */
  static async updateIteration(
    id: string,
    input: Partial<Pick<PrototypeIteration, 'feedback' | 'client_approved'>>
  ): Promise<PrototypeIteration> {
    const { data, error } = await this.supabase.from('sh_prototype_iterations')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update iteration: ${error.message}`);
    return data as PrototypeIteration;
  }

  /**
   * Get iterations for a phase
   */
  static async getPhaseIterations(phaseId: string): Promise<PrototypeIteration[]> {
    const { data, error } = await this.supabase.from('sh_prototype_iterations')
      .select('*')
      .eq('phase_id', phaseId)
      .order('version', { ascending: false });

    if (error) throw new Error(`Failed to fetch iterations: ${error.message}`);
    return data as PrototypeIteration[];
  }

  // ============================================
  // BUG REPORT MANAGEMENT
  // ============================================

  /**
   * Create a bug report
   */
  static async createBugReport(input: CreateBugReportInput): Promise<BugReport> {
    const { data, error } = await this.supabase.from('sh_bug_reports')
      .insert({
        iteration_id: input.iteration_id,
        reported_by: input.reported_by,
        description: input.description,
        severity: input.severity || 'medium',
        screenshots_urls: input.screenshots_urls || [],
        status: 'open',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create bug report: ${error.message}`);
    return data as BugReport;
  }

  /**
   * Update bug report status
   */
  static async updateBugReport(
    id: string,
    input: Partial<Pick<BugReport, 'status' | 'resolved_by' | 'resolution_notes'>>
  ): Promise<BugReport> {
    const updateData: Record<string, unknown> = { ...input };
    if (input.status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase.from('sh_bug_reports')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update bug report: ${error.message}`);
    return data as BugReport;
  }

  /**
   * Get bug reports for an iteration
   */
  static async getIterationBugs(iterationId: string): Promise<BugReport[]> {
    const { data, error } = await this.supabase.from('sh_bug_reports')
      .select('*')
      .eq('iteration_id', iterationId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch bug reports: ${error.message}`);
    return data as BugReport[];
  }

  // ============================================
  // DEPLOYMENT MANAGEMENT
  // ============================================

  /**
   * Create a deployment record
   */
  static async createDeployment(input: CreateDeploymentInput): Promise<PhaseDeployment> {
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .insert({
        phase_id: input.phase_id,
        environment: input.environment,
        version: input.version,
        vercel_url: input.vercel_url,
        supabase_project_id: input.supabase_project_id,
        custom_domain: input.custom_domain,
        deployed_date: input.deployed_date,
        deployed_by: input.deployed_by,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create deployment: ${error.message}`);
    return data as PhaseDeployment;
  }

  /**
   * Get deployments for a phase
   */
  static async getPhaseDeployments(phaseId: string): Promise<PhaseDeployment[]> {
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .select('*')
      .eq('phase_id', phaseId)
      .order('deployed_date', { ascending: false });

    if (error) throw new Error(`Failed to fetch deployments: ${error.message}`);
    return data as PhaseDeployment[];
  }

  // ============================================
  // IMPLEMENTATION USER MANAGEMENT
  // ============================================

  /**
   * Add an implementation user
   */
  static async addImplementationUser(input: {
    phase_id: string;
    user_name: string;
    user_email?: string;
    trained_date?: string;
    notes?: string;
  }): Promise<ImplementationUser> {
    const { data, error } = await this.supabase.from('sh_implementation_users')
      .insert({
        phase_id: input.phase_id,
        user_name: input.user_name,
        user_email: input.user_email,
        trained_date: input.trained_date,
        usage_status: 'pending',
        notes: input.notes,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add implementation user: ${error.message}`);
    return data as ImplementationUser;
  }

  /**
   * Get implementation users for a phase
   */
  static async getPhaseImplementationUsers(phaseId: string): Promise<ImplementationUser[]> {
    const { data, error } = await this.supabase.from('sh_implementation_users')
      .select('*')
      .eq('phase_id', phaseId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch implementation users: ${error.message}`);
    return data as ImplementationUser[];
  }

  /**
   * Update implementation user status
   */
  static async updateImplementationUserStatus(
    id: string,
    status: 'pending' | 'active' | 'inactive'
  ): Promise<ImplementationUser> {
    const { data, error } = await this.supabase.from('sh_implementation_users')
      .update({ usage_status: status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update implementation user: ${error.message}`);
    return data as ImplementationUser;
  }
}

// Export singleton instance methods
export const phasesService = {
  getPhases: PhasesService.getPhases.bind(PhasesService),
  getPhaseById: PhasesService.getPhaseById.bind(PhasesService),
  getPhasesBySolutionId: PhasesService.getPhasesBySolutionId.bind(PhasesService),
  createPhase: PhasesService.createPhase.bind(PhasesService),
  updatePhase: PhasesService.updatePhase.bind(PhasesService),
  deletePhase: PhasesService.deletePhase.bind(PhasesService),
  getNextPhaseNumber: PhasesService.getNextPhaseNumber.bind(PhasesService),
  updatePhaseStatus: PhasesService.updatePhaseStatus.bind(PhasesService),
  getPhaseStats: PhasesService.getPhaseStats.bind(PhasesService),
  createIteration: PhasesService.createIteration.bind(PhasesService),
  updateIteration: PhasesService.updateIteration.bind(PhasesService),
  getPhaseIterations: PhasesService.getPhaseIterations.bind(PhasesService),
  createBugReport: PhasesService.createBugReport.bind(PhasesService),
  updateBugReport: PhasesService.updateBugReport.bind(PhasesService),
  getIterationBugs: PhasesService.getIterationBugs.bind(PhasesService),
  createDeployment: PhasesService.createDeployment.bind(PhasesService),
  getPhaseDeployments: PhasesService.getPhaseDeployments.bind(PhasesService),
  addImplementationUser: PhasesService.addImplementationUser.bind(PhasesService),
  getPhaseImplementationUsers: PhasesService.getPhaseImplementationUsers.bind(PhasesService),
  updateImplementationUserStatus: PhasesService.updateImplementationUserStatus.bind(PhasesService),
  PHASE_STATUSES,
};
