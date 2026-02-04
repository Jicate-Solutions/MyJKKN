// lib/services/solutions/iterations-service.ts
// CRUD operations for sh_prototype_iterations

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  PrototypeIteration,
  BugReport,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface IterationWithBugs extends PrototypeIteration {
  bugs?: BugReport[];
  phase?: {
    id: string;
    title: string;
    solution_id: string;
    solution?: {
      id: string;
      title: string;
      solution_code: string;
    };
  };
}

export interface IterationFilters extends PaginationParams {
  phase_id?: string;
  client_approved?: boolean;
}

export interface CreateIterationInput {
  phase_id: string;
  prototype_url: string;
  changes_made?: string;
  demo_date?: string;
}

export interface UpdateIterationInput {
  prototype_url?: string;
  changes_made?: string;
  feedback?: string;
  client_approved?: boolean;
  demo_date?: string;
}

// ============================================
// SERVICE CLASS
// ============================================

export class IterationsService extends BaseService {
  /**
   * Get all iterations with optional filters and pagination
   */
  static async getIterations(filters?: IterationFilters): Promise<BaseListResponse<IterationWithBugs>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_prototype_iterations')
      .select(
        `
        *,
        phase:sh_solution_phases(
          id,
          title,
          solution_id,
          solution:sh_solutions(id, title, solution_code)
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.phase_id) {
      query = query.eq('phase_id', filters.phase_id);
    }

    if (filters?.client_approved !== undefined) {
      query = query.eq('client_approved', filters.client_approved);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch iterations: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as IterationWithBugs[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single iteration by ID with bugs
   */
  static async getIterationById(id: string): Promise<IterationWithBugs | null> {
    const { data, error } = await (this.supabase as any).from('sh_prototype_iterations')
      .select(
        `
        *,
        phase:sh_solution_phases(
          id,
          title,
          solution_id,
          solution:sh_solutions(id, title, solution_code)
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch iteration: ${error.message}`);
    }

    // Get bugs for this iteration
    const { data: bugs } = await (this.supabase as any).from('sh_bug_reports')
      .select('*')
      .eq('iteration_id', id)
      .order('created_at', { ascending: false });

    return {
      ...data,
      bugs: bugs || [],
    } as IterationWithBugs;
  }

  /**
   * Get iterations by phase ID
   */
  static async getIterationsByPhase(phaseId: string): Promise<PrototypeIteration[]> {
    const { data, error } = await (this.supabase as any).from('sh_prototype_iterations')
      .select('*')
      .eq('phase_id', phaseId)
      .order('version', { ascending: false });

    if (error) throw new Error(`Failed to fetch iterations: ${error.message}`);
    return data as PrototypeIteration[];
  }

  /**
   * Create a new iteration
   */
  static async createIteration(input: CreateIterationInput): Promise<PrototypeIteration> {
    // Get next version number
    const nextVersion = await this.getNextVersionNumber(input.phase_id);

    const { data, error } = await (this.supabase as any).from('sh_prototype_iterations')
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

    // Update phase prototype URL
    await (this.supabase as any).from('sh_solution_phases')
      .update({
        prototype_url: input.prototype_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.phase_id);

    return data as PrototypeIteration;
  }

  /**
   * Update an iteration
   */
  static async updateIteration(id: string, input: UpdateIterationInput): Promise<PrototypeIteration> {
    const { data, error } = await (this.supabase as any).from('sh_prototype_iterations')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update iteration: ${error.message}`);
    return data as PrototypeIteration;
  }

  /**
   * Complete an iteration (mark as client approved)
   */
  static async completeIteration(id: string, feedback?: string): Promise<PrototypeIteration> {
    const { data, error } = await (this.supabase as any).from('sh_prototype_iterations')
      .update({
        client_approved: true,
        feedback: feedback,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to complete iteration: ${error.message}`);

    // Update phase status to approved if iteration is approved
    if (data?.phase_id) {
      await (this.supabase as any).from('sh_solution_phases')
        .update({
          status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.phase_id);
    }

    return data as PrototypeIteration;
  }

  /**
   * Delete an iteration
   */
  static async deleteIteration(id: string): Promise<void> {
    // First delete all bugs associated with this iteration
    await (this.supabase as any).from('sh_bug_reports')
      .delete()
      .eq('iteration_id', id);

    const { error } = await (this.supabase as any).from('sh_prototype_iterations')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete iteration: ${error.message}`);
  }

  /**
   * Get next version number for a phase
   */
  static async getNextVersionNumber(phaseId: string): Promise<number> {
    const { data, error } = await (this.supabase as any).from('sh_prototype_iterations')
      .select('version')
      .eq('phase_id', phaseId)
      .order('version', { ascending: false })
      .limit(1);

    if (error) throw new Error(`Failed to get next version number: ${error.message}`);
    return data && data.length > 0 ? data[0].version + 1 : 1;
  }

  /**
   * Get latest iteration for a phase
   */
  static async getLatestIteration(phaseId: string): Promise<PrototypeIteration | null> {
    const { data, error } = await (this.supabase as any).from('sh_prototype_iterations')
      .select('*')
      .eq('phase_id', phaseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to get latest iteration: ${error.message}`);
    return data as PrototypeIteration | null;
  }

  /**
   * Get iteration statistics
   */
  static async getIterationStats(): Promise<{
    total: number;
    approved: number;
    pending: number;
    averageVersionsPerPhase: number;
  }> {
    const { data, error } = await (this.supabase as any).from('sh_prototype_iterations')
      .select('phase_id, client_approved');

    if (error) throw new Error(`Failed to fetch iteration stats: ${error.message}`);

    const approved = data?.filter(i => i.client_approved).length || 0;
    const pending = data?.filter(i => !i.client_approved).length || 0;

    // Calculate unique phases
    const uniquePhases = new Set(data?.map(i => i.phase_id) || []);
    const averageVersionsPerPhase = uniquePhases.size > 0
      ? (data?.length || 0) / uniquePhases.size
      : 0;

    return {
      total: data?.length || 0,
      approved,
      pending,
      averageVersionsPerPhase: Math.round(averageVersionsPerPhase * 10) / 10,
    };
  }
}

// Export singleton instance methods
export const iterationsService = {
  getIterations: IterationsService.getIterations.bind(IterationsService),
  getIterationById: IterationsService.getIterationById.bind(IterationsService),
  getIterationsByPhase: IterationsService.getIterationsByPhase.bind(IterationsService),
  createIteration: IterationsService.createIteration.bind(IterationsService),
  updateIteration: IterationsService.updateIteration.bind(IterationsService),
  completeIteration: IterationsService.completeIteration.bind(IterationsService),
  deleteIteration: IterationsService.deleteIteration.bind(IterationsService),
  getNextVersionNumber: IterationsService.getNextVersionNumber.bind(IterationsService),
  getLatestIteration: IterationsService.getLatestIteration.bind(IterationsService),
  getIterationStats: IterationsService.getIterationStats.bind(IterationsService),
};
