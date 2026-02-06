// lib/services/solutions/solutions-service.ts
// CRUD operations for sh_solutions table

import { BaseService, type BaseFilters, type BaseListResponse } from '../base-service';
import type {
  Solution,
  SolutionType,
  SolutionStatus,
  CreateSolutionInput,
  PaginationParams,
  Client,
} from './types';

// ============================================
// TYPES
// ============================================

export interface SolutionWithClient extends Solution {
  client?: Client;
  department?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface SolutionFilters extends PaginationParams {
  solution_type?: SolutionType;
  status?: SolutionStatus;
  client_id?: string;
  lead_department_id?: string;
}

export interface UpdateSolutionInput {
  title?: string;
  problem_statement?: string;
  description?: string;
  status?: SolutionStatus;
  lead_department_id?: string;
  base_price?: number;
  hod_discount?: number;
  final_price?: number;
  started_date?: string;
  target_completion?: string;
  completed_date?: string;
}

export interface SolutionStats {
  total: number;
  bySolutionType: Record<SolutionType, number>;
  byStatus: Record<SolutionStatus, number>;
  totalValue: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeSearchString(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

// ============================================
// SERVICE CLASS
// ============================================

export class SolutionsService extends BaseService {
  /**
   * Calculate partner discount based on partner status
   */
  private static async getPartnerDiscount(clientId: string): Promise<number> {
    const { data: client, error } = await (this.supabase as any)
      .from('sh_clients')
      .select('partner_status, partner_discount')
      .eq('id', clientId)
      .single();

    if (error || !client) return 0;

    // Partner status auto-discount (50% for yi, alumni, mou, referral)
    let discount = 0;
    if (client.partner_status !== 'standard') {
      discount = 0.5;
    }

    // Use client's custom discount if higher
    if (client.partner_discount && client.partner_discount > discount) {
      discount = client.partner_discount;
    }

    return discount;
  }

  /**
   * Calculate final price with partner and HOD discount
   */
  private static async calculateFinalPrice(
    clientId: string,
    basePrice: number,
    hodDiscount: number = 0
  ): Promise<{ finalPrice: number; partnerDiscount: number }> {
    const partnerDiscount = await this.getPartnerDiscount(clientId);

    // Calculate HOD discount amount (0-10% from department's share)
    const priceAfterPartnerDiscount = basePrice * (1 - partnerDiscount);
    const hodDiscountAmount = priceAfterPartnerDiscount * (hodDiscount / 100);
    const finalPrice = priceAfterPartnerDiscount - hodDiscountAmount;

    return { finalPrice, partnerDiscount };
  }

  /**
   * Generate solution code in format: JKKN-SOL-YYYY-XXX
   */
  private static async generateSolutionCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JKKN-SOL-${year}-`;

    const { data, error } = await (this.supabase as any)
      .from('sh_solutions')
      .select('solution_code')
      .like('solution_code', `${prefix}%`)
      .order('solution_code', { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastCode = data[0].solution_code;
      const lastNumber = parseInt(lastCode.replace(prefix, ''), 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${String(nextNumber).padStart(3, '0')}`;
  }
  /**
   * Get all solutions with optional filters and pagination
   */
  static async getSolutions(
    filters?: SolutionFilters
  ): Promise<BaseListResponse<SolutionWithClient>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any)
      .from('sh_solutions')
      .select(
        `
        *,
        client:sh_clients(*),
        department:departments(id, name:department_name, code:department_code)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.solution_type) {
      query = query.eq('solution_type', filters.solution_type);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.client_id) {
      query = query.eq('client_id', filters.client_id);
    }

    if (filters?.lead_department_id) {
      query = query.eq('lead_department_id', filters.lead_department_id);
    }

    if (filters?.search) {
      const escaped = escapeSearchString(filters.search);
      query = query.or(`title.ilike.%${escaped}%,solution_code.ilike.%${escaped}%`);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch solutions: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as SolutionWithClient[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single solution by ID with related data
   */
  static async getSolutionById(id: string): Promise<SolutionWithClient | null> {
    const { data, error } = await (this.supabase as any)
      .from('sh_solutions')
      .select(
        `
        *,
        client:sh_clients(*),
        department:departments(id, name:department_name, code:department_code)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch solution: ${error.message}`);
    }

    return data as SolutionWithClient;
  }

  /**
   * Get solutions by client ID
   */
  static async getSolutionsByClientId(
    clientId: string,
    params?: PaginationParams
  ): Promise<BaseListResponse<SolutionWithClient>> {
    return this.getSolutions({ ...params, client_id: clientId });
  }

  /**
   * Get solutions by department ID
   */
  static async getSolutionsByDepartmentId(
    departmentId: string,
    params?: PaginationParams
  ): Promise<BaseListResponse<SolutionWithClient>> {
    return this.getSolutions({ ...params, lead_department_id: departmentId });
  }

  /**
   * Create a new solution
   */
  static async createSolution(input: CreateSolutionInput): Promise<Solution> {
    // Generate solution code
    const solutionCode = await this.generateSolutionCode();

    // Validate HOD discount (0-10%)
    const hodDiscount = Math.min(Math.max(input.hod_discount || 0, 0), 10);

    // Calculate final price if base price is provided
    let finalPrice = input.base_price;
    let partnerDiscount = 0;

    if (input.base_price) {
      const pricing = await this.calculateFinalPrice(input.client_id, input.base_price, hodDiscount);
      finalPrice = pricing.finalPrice;
      partnerDiscount = pricing.partnerDiscount;
    }

    const { data, error } = await (this.supabase as any)
      .from('sh_solutions')
      .insert({
        solution_code: solutionCode,
        client_id: input.client_id,
        solution_type: input.solution_type,
        title: input.title,
        problem_statement: input.problem_statement,
        description: input.description,
        lead_department_id: input.lead_department_id,
        base_price: input.base_price,
        partner_discount_applied: partnerDiscount,
        hod_discount: hodDiscount,
        final_price: finalPrice,
        started_date: input.started_date,
        target_completion: input.target_completion,
        created_by: input.created_by,
        status: 'active' as SolutionStatus,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create solution: ${error.message}`);
    return data as Solution;
  }

  /**
   * Update an existing solution
   */
  static async updateSolution(id: string, input: UpdateSolutionInput): Promise<Solution> {
    const updatedInput: Record<string, unknown> = { ...input };

    // Validate HOD discount if provided
    if (input.hod_discount !== undefined) {
      updatedInput.hod_discount = Math.min(Math.max(input.hod_discount, 0), 10);
    }

    // Recalculate final price if base_price or hod_discount is being updated
    if (input.base_price !== undefined || input.hod_discount !== undefined) {
      const { data: solution } = await (this.supabase as any)
        .from('sh_solutions')
        .select('client_id, base_price, hod_discount')
        .eq('id', id)
        .single();

      if (solution) {
        const basePrice = input.base_price ?? solution.base_price;
        const hodDiscount = input.hod_discount ?? solution.hod_discount ?? 0;

        if (basePrice) {
          const pricing = await this.calculateFinalPrice(solution.client_id, basePrice, hodDiscount);
          updatedInput.final_price = pricing.finalPrice;
        }
      }
    }

    const { data, error } = await (this.supabase as any)
      .from('sh_solutions')
      .update({
        ...updatedInput,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update solution: ${error.message}`);
    return data as Solution;
  }

  /**
   * Delete a solution
   */
  static async deleteSolution(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_solutions').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete solution: ${error.message}`);
  }

  /**
   * Get solution statistics
   */
  static async getSolutionStats(): Promise<SolutionStats> {
    const { data, error } = await (this.supabase as any)
      .from('sh_solutions')
      .select('solution_type, status, final_price');

    if (error) throw new Error(`Failed to fetch solution stats: ${error.message}`);

    const stats: SolutionStats = {
      total: data?.length || 0,
      bySolutionType: {
        software: 0,
        training: 0,
        content: 0,
      },
      byStatus: {
        active: 0,
        on_hold: 0,
        completed: 0,
        cancelled: 0,
        in_amc: 0,
      },
      totalValue: 0,
    };

    data?.forEach((solution) => {
      if (solution.solution_type) {
        stats.bySolutionType[solution.solution_type as SolutionType]++;
      }
      if (solution.status) {
        stats.byStatus[solution.status as SolutionStatus]++;
      }
      if (solution.final_price) {
        stats.totalValue += Number(solution.final_price);
      }
    });

    return stats;
  }

  /**
   * Update solution status
   */
  static async updateSolutionStatus(id: string, status: SolutionStatus): Promise<Solution> {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    // Set completion date if status is completed
    if (status === 'completed') {
      updateData.completed_date = new Date().toISOString().split('T')[0];
    }

    const { data, error } = await (this.supabase as any)
      .from('sh_solutions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update solution status: ${error.message}`);
    return data as Solution;
  }
}

// Export singleton instance methods
export const solutionsService = {
  getSolutions: SolutionsService.getSolutions.bind(SolutionsService),
  getSolutionById: SolutionsService.getSolutionById.bind(SolutionsService),
  getSolutionsByClientId: SolutionsService.getSolutionsByClientId.bind(SolutionsService),
  getSolutionsByDepartmentId: SolutionsService.getSolutionsByDepartmentId.bind(SolutionsService),
  createSolution: SolutionsService.createSolution.bind(SolutionsService),
  updateSolution: SolutionsService.updateSolution.bind(SolutionsService),
  deleteSolution: SolutionsService.deleteSolution.bind(SolutionsService),
  getSolutionStats: SolutionsService.getSolutionStats.bind(SolutionsService),
  updateSolutionStatus: SolutionsService.updateSolutionStatus.bind(SolutionsService),
};
