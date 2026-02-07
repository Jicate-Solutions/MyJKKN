// lib/services/solutions/production-service.ts
// CRUD operations for sh_production_learners, sh_production_assignments

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  ProductionLearner,
  ProductionAssignment,
  ContentDivision,
  SkillLevel,
  ContentDeliverable,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface ProductionLearnerWithAssignments extends ProductionLearner {
  assignments?: Array<ProductionAssignment & { deliverable?: ContentDeliverable }>;
}

export interface ProductionAssignmentWithDetails extends ProductionAssignment {
  learner?: ProductionLearner;
  deliverable?: ContentDeliverable;
}

export interface ProductionLearnerFilters extends PaginationParams {
  division?: ContentDivision;
  skill_level?: SkillLevel;
  is_active?: boolean;
}

export interface CreateProductionLearnerInput {
  user_id?: string;
  name: string;
  email?: string;
  phone?: string;
  division?: ContentDivision;
  skill_level?: SkillLevel;
}

export interface UpdateProductionLearnerInput {
  name?: string;
  email?: string;
  phone?: string;
  division?: ContentDivision;
  skill_level?: SkillLevel;
  is_active?: boolean;
  availability_status?: string;
}

export interface CreateProductionAssignmentInput {
  deliverable_id: string;
  learner_id: string;
  role?: 'lead' | 'contributor' | 'reviewer';
  assigned_by?: string;
}

// ============================================
// CONSTANTS
// ============================================

const CONTENT_SELF_CLAIM_THRESHOLD = 50000; // <= 50K: self-claim/HOD

export function canSelfClaim(orderValue: number): boolean {
  return orderValue <= CONTENT_SELF_CLAIM_THRESHOLD;
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

export class ProductionService extends BaseService {
  // ============================================
  // LEARNER OPERATIONS
  // ============================================

  /**
   * Get all production learners with optional filters
   */
  static async getLearners(
    filters?: ProductionLearnerFilters
  ): Promise<BaseListResponse<ProductionLearnerWithAssignments>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_production_learners')
      .select(
        `
        *,
        assignments:sh_production_assignments(
          *,
          deliverable:sh_content_deliverables(*)
        )
      `,
        { count: 'exact' }
      )
      .order('name', { ascending: true });

    // Apply filters
    if (filters?.division) {
      query = query.eq('division', filters.division);
    }

    if (filters?.skill_level) {
      query = query.eq('skill_level', filters.skill_level);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
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

    if (error) throw new Error(`Failed to fetch production learners: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as ProductionLearnerWithAssignments[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single learner by ID
   */
  static async getLearnerById(id: string): Promise<ProductionLearnerWithAssignments | null> {
    const { data, error } = await (this.supabase as any).from('sh_production_learners')
      .select(
        `
        *,
        assignments:sh_production_assignments(
          *,
          deliverable:sh_content_deliverables(*)
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch production learner: ${error.message}`);
    }

    return data as ProductionLearnerWithAssignments;
  }

  /**
   * Get a single learner by user ID (efficient direct query)
   * Use this instead of fetching all learners and filtering
   */
  static async getLearnerByUserId(userId: string): Promise<ProductionLearnerWithAssignments | null> {
    const { data, error } = await (this.supabase as any).from('sh_production_learners')
      .select(
        `
        *,
        assignments:sh_production_assignments(
          *,
          deliverable:sh_content_deliverables(*)
        )
      `
      )
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // No learner found for this user
      throw new Error(`Failed to fetch production learner by user ID: ${error.message}`);
    }

    return data as ProductionLearnerWithAssignments;
  }

  /**
   * Get learners by division
   */
  static async getLearnersByDivision(
    division: ContentDivision
  ): Promise<ProductionLearnerWithAssignments[]> {
    const result = await this.getLearners({ division, status: 'active' });
    return result.data;
  }

  /**
   * Create a new production learner
   */
  static async createLearner(input: CreateProductionLearnerInput): Promise<ProductionLearner> {
    const { data, error } = await (this.supabase as any).from('sh_production_learners')
      .insert({
        user_id: input.user_id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        division: input.division,
        skill_level: input.skill_level ?? 'beginner',
        status: 'active',
        orders_completed: 0,
        total_earnings: 0,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create production learner: ${error.message}`);
    return data as ProductionLearner;
  }

  /**
   * Update a production learner
   */
  static async updateLearner(
    id: string,
    input: UpdateProductionLearnerInput
  ): Promise<ProductionLearner> {
    const { data, error } = await (this.supabase as any).from('sh_production_learners')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update production learner: ${error.message}`);
    return data as ProductionLearner;
  }

  /**
   * Delete a production learner
   */
  static async deleteLearner(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_production_learners').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete production learner: ${error.message}`);
  }

  /**
   * Get learner statistics
   */
  static async getLearnerStats(): Promise<{
    total: number;
    byDivision: Record<ContentDivision, number>;
    bySkillLevel: Record<SkillLevel, number>;
    active: number;
  }> {
    const { data, error } = await (this.supabase as any).from('sh_production_learners')
      .select('division, skill_level, status');

    if (error) throw new Error(`Failed to fetch learner stats: ${error.message}`);

    const stats = {
      total: data?.length || 0,
      byDivision: {
        video: 0,
        design: 0,
        writing: 0,
        animation: 0,
        social: 0,
        other: 0,
      } as Record<ContentDivision, number>,
      bySkillLevel: {
        beginner: 0,
        intermediate: 0,
        advanced: 0,
        expert: 0,
      } as Record<SkillLevel, number>,
      active: 0,
    };

    data?.forEach((learner) => {
      if (learner.division) {
        stats.byDivision[learner.division as ContentDivision]++;
      }
      if (learner.skill_level) {
        stats.bySkillLevel[learner.skill_level as SkillLevel]++;
      }
      if (learner.status === 'active') {
        stats.active++;
      }
    });

    return stats;
  }

  // ============================================
  // ASSIGNMENT OPERATIONS
  // ============================================

  /**
   * Create a production assignment
   */
  static async createAssignment(input: CreateProductionAssignmentInput): Promise<ProductionAssignment> {
    const { data, error } = await (this.supabase as any).from('sh_production_assignments')
      .insert({
        deliverable_id: input.deliverable_id,
        learner_id: input.learner_id,
        role: input.role ?? 'contributor',
        assigned_by: input.assigned_by,
        assigned_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create assignment: ${error.message}`);

    // Update deliverable status to in_progress
    await (this.supabase as any).from('sh_content_deliverables')
      .update({ status: 'in_progress' })
      .eq('id', input.deliverable_id);

    return data as ProductionAssignment;
  }

  /**
   * Self-claim a deliverable
   */
  static async claimDeliverable(
    deliverableId: string,
    learnerId: string
  ): Promise<ProductionAssignment> {
    return this.createAssignment({
      deliverable_id: deliverableId,
      learner_id: learnerId,
      role: 'contributor',
    });
  }

  /**
   * Complete an assignment
   */
  static async completeAssignment(
    assignmentId: string,
    earnings?: number,
    qualityRating?: number
  ): Promise<ProductionAssignment> {
    const { data, error } = await (this.supabase as any).from('sh_production_assignments')
      .update({
        completed_at: new Date().toISOString(),
        earnings,
        quality_rating: qualityRating,
      })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) throw new Error(`Failed to complete assignment: ${error.message}`);

    // Update learner stats
    if (data.learner_id) {
      const { data: learner } = await (this.supabase as any).from('sh_production_learners')
        .select('orders_completed, total_earnings')
        .eq('id', data.learner_id)
        .single();

      if (learner) {
        await (this.supabase as any).from('sh_production_learners')
          .update({
            orders_completed: (learner.orders_completed || 0) + 1,
            total_earnings: (learner.total_earnings || 0) + (earnings || 0),
          })
          .eq('id', data.learner_id);
      }
    }

    return data as ProductionAssignment;
  }

  /**
   * Get assignments by learner ID
   */
  static async getAssignmentsByLearnerId(
    learnerId: string
  ): Promise<ProductionAssignmentWithDetails[]> {
    const { data, error } = await (this.supabase as any).from('sh_production_assignments')
      .select(
        `
        *,
        deliverable:sh_content_deliverables(*)
      `
      )
      .eq('learner_id', learnerId)
      .order('assigned_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch assignments: ${error.message}`);
    return data as ProductionAssignmentWithDetails[];
  }

  /**
   * Get assignments by deliverable ID
   */
  static async getAssignmentsByDeliverableId(
    deliverableId: string
  ): Promise<ProductionAssignmentWithDetails[]> {
    const { data, error } = await (this.supabase as any).from('sh_production_assignments')
      .select(
        `
        *,
        learner:sh_production_learners(*)
      `
      )
      .eq('deliverable_id', deliverableId)
      .order('assigned_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch assignments: ${error.message}`);
    return data as ProductionAssignmentWithDetails[];
  }

  /**
   * Get available deliverables for a division (unclaimed)
   */
  static async getAvailableDeliverablesForDivision(
    division: ContentDivision
  ): Promise<ContentDeliverable[]> {
    // Get orders in this division
    const { data: orders, error: ordersError } = await (this.supabase as any).from('sh_content_orders')
      .select('id')
      .eq('division', division);

    if (ordersError) throw new Error(`Failed to fetch orders: ${ordersError.message}`);

    const orderIds = orders?.map((o) => o.id) || [];

    if (orderIds.length === 0) return [];

    // Get pending deliverables with no assignments
    const { data, error } = await (this.supabase as any).from('sh_content_deliverables')
      .select(
        `
        *,
        assignments:sh_production_assignments(id)
      `
      )
      .in('order_id', orderIds)
      .eq('status', 'pending');

    if (error) throw new Error(`Failed to fetch deliverables: ${error.message}`);

    // Filter out deliverables that already have assignments
    return (data || []).filter((d) => !d.assignments || d.assignments.length === 0) as ContentDeliverable[];
  }

  /**
   * Update learner earnings
   */
  static async addEarnings(learnerId: string, amount: number): Promise<ProductionLearner> {
    const { data: learner, error: fetchError } = await (this.supabase as any).from('sh_production_learners')
      .select('total_earnings')
      .eq('id', learnerId)
      .single();

    if (fetchError) throw new Error(`Failed to fetch learner: ${fetchError.message}`);

    const currentEarnings = learner?.total_earnings || 0;

    const { data, error } = await (this.supabase as any).from('sh_production_learners')
      .update({
        total_earnings: currentEarnings + amount,
      })
      .eq('id', learnerId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update earnings: ${error.message}`);
    return data as ProductionLearner;
  }

  /**
   * Update learner skill level
   */
  static async updateSkillLevel(learnerId: string, skillLevel: SkillLevel): Promise<ProductionLearner> {
    const { data, error } = await (this.supabase as any).from('sh_production_learners')
      .update({ skill_level: skillLevel })
      .eq('id', learnerId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update skill level: ${error.message}`);
    return data as ProductionLearner;
  }
}

// Export singleton instance methods
export const productionService = {
  getLearners: ProductionService.getLearners.bind(ProductionService),
  getLearnerById: ProductionService.getLearnerById.bind(ProductionService),
  getLearnerByUserId: ProductionService.getLearnerByUserId.bind(ProductionService),
  getLearnersByDivision: ProductionService.getLearnersByDivision.bind(ProductionService),
  createLearner: ProductionService.createLearner.bind(ProductionService),
  updateLearner: ProductionService.updateLearner.bind(ProductionService),
  deleteLearner: ProductionService.deleteLearner.bind(ProductionService),
  getLearnerStats: ProductionService.getLearnerStats.bind(ProductionService),
  createAssignment: ProductionService.createAssignment.bind(ProductionService),
  claimDeliverable: ProductionService.claimDeliverable.bind(ProductionService),
  completeAssignment: ProductionService.completeAssignment.bind(ProductionService),
  getAssignmentsByLearnerId: ProductionService.getAssignmentsByLearnerId.bind(ProductionService),
  getAssignmentsByDeliverableId: ProductionService.getAssignmentsByDeliverableId.bind(ProductionService),
  getAvailableDeliverablesForDivision: ProductionService.getAvailableDeliverablesForDivision.bind(ProductionService),
  addEarnings: ProductionService.addEarnings.bind(ProductionService),
  updateSkillLevel: ProductionService.updateSkillLevel.bind(ProductionService),
  canSelfClaim,
  CONTENT_SELF_CLAIM_THRESHOLD,
};
