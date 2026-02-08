// lib/services/solutions/mou-service.ts
// CRUD operations for sh_solution_mous

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  SolutionMou,
  MouStatus,
  CreateMouInput,
  UpdateMouInput,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface MouWithSolution extends SolutionMou {
  solution?: {
    id: string;
    title: string;
    solution_code: string;
    client?: {
      id: string;
      name: string;
      contact_person: string | null;
    };
  };
}

export interface MouFilters extends PaginationParams {
  status?: MouStatus;
  solution_id?: string;
}

// ============================================
// CONSTANTS
// ============================================

export const MOU_STATUS_LABELS: Record<MouStatus, string> = {
  draft: 'Draft',
  pending_signatures: 'Pending Signatures',
  active: 'Active',
  expired: 'Expired',
  terminated: 'Terminated',
};

// ============================================
// SERVICE CLASS
// ============================================

export class MouService extends BaseService {
  /**
   * Get all MOUs with optional filters
   */
  static async list(
    filters?: MouFilters
  ): Promise<BaseListResponse<MouWithSolution>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_solution_mous')
      .select(
        `
        *,
        solution:sh_solutions(
          id,
          title,
          solution_code,
          client:sh_clients(id, name, contact_person)
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.solution_id) {
      query = query.eq('solution_id', filters.solution_id);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch MOUs: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as MouWithSolution[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single MOU by ID
   */
  static async getById(id: string): Promise<MouWithSolution | null> {
    const { data, error } = await (this.supabase as any).from('sh_solution_mous')
      .select(
        `
        *,
        solution:sh_solutions(
          id,
          title,
          solution_code,
          client:sh_clients(id, name, contact_person)
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch MOU: ${error.message}`);
    }

    return data as MouWithSolution;
  }

  /**
   * Get MOU by solution ID (one MOU per solution)
   */
  static async getBySolutionId(solutionId: string): Promise<MouWithSolution | null> {
    const { data, error } = await (this.supabase as any).from('sh_solution_mous')
      .select(
        `
        *,
        solution:sh_solutions(
          id,
          title,
          solution_code,
          client:sh_clients(id, name, contact_person)
        )
      `
      )
      .eq('solution_id', solutionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch MOU for solution: ${error.message}`);
    }

    return data as MouWithSolution | null;
  }

  /**
   * Create a new MOU
   */
  static async create(input: CreateMouInput): Promise<SolutionMou> {
    const { data, error } = await (this.supabase as any).from('sh_solution_mous')
      .insert({
        solution_id: input.solution_id,
        deal_value: input.deal_value,
        amc_value: input.amc_value,
        amc_duration_months: input.amc_duration_months,
        amc_start_date: input.amc_start_date,
        payment_terms: input.payment_terms,
        signed_date: input.signed_date,
        expiry_date: input.expiry_date,
        signatory_client: input.signatory_client,
        signatory_jkkn: input.signatory_jkkn,
        witness_1: input.witness_1,
        witness_2: input.witness_2,
        terms_and_conditions: input.terms_and_conditions,
        notes: input.notes,
        mou_document_url: input.mou_document_url,
        created_by: input.created_by,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create MOU: ${error.message}`);
    return data as SolutionMou;
  }

  /**
   * Update an existing MOU
   */
  static async update(id: string, input: UpdateMouInput): Promise<SolutionMou> {
    const { data, error } = await (this.supabase as any).from('sh_solution_mous')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update MOU: ${error.message}`);
    return data as SolutionMou;
  }

  /**
   * Update MOU status
   */
  static async updateStatus(id: string, status: MouStatus): Promise<SolutionMou> {
    const { data, error } = await (this.supabase as any).from('sh_solution_mous')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update MOU status: ${error.message}`);
    return data as SolutionMou;
  }

  /**
   * Delete an MOU
   */
  static async delete(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_solution_mous').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete MOU: ${error.message}`);
  }
}

// Export singleton instance methods
export const mouService = {
  list: MouService.list.bind(MouService),
  getById: MouService.getById.bind(MouService),
  getBySolutionId: MouService.getBySolutionId.bind(MouService),
  create: MouService.create.bind(MouService),
  update: MouService.update.bind(MouService),
  updateStatus: MouService.updateStatus.bind(MouService),
  delete: MouService.delete.bind(MouService),
};
