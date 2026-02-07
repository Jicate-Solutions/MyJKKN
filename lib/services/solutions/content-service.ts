// lib/services/solutions/content-service.ts
// CRUD operations for sh_content_orders, sh_content_deliverables

import { BaseService, type BaseListResponse } from '../base-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  ContentOrder,
  ContentDeliverable,
  ContentOrderType,
  ContentDivision,
  DeliverableStatus,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface ContentOrderWithSolution extends ContentOrder {
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

export interface ContentDeliverableWithDetails extends ContentDeliverable {
  order?: ContentOrder;
  assignments?: Array<{
    id: string;
    learner_id: string;
    role: string;
    learner?: {
      id: string;
      name: string;
      division: ContentDivision | null;
    };
  }>;
}

export interface ContentOrderFilters extends PaginationParams {
  division?: ContentDivision;
  order_type?: ContentOrderType;
  solution_id?: string;
}

export interface DeliverableFilters extends PaginationParams {
  order_id?: string;
  status?: DeliverableStatus;
  assigned_learner_id?: string;
}

export interface CreateContentOrderInput {
  solution_id: string;
  order_type?: ContentOrderType;
  quantity?: number;
  brand_guidelines_url?: string;
  division?: ContentDivision;
  due_date?: string;
  revision_rounds?: number;
}

export interface UpdateContentOrderInput {
  order_type?: ContentOrderType;
  quantity?: number;
  brand_guidelines_url?: string;
  division?: ContentDivision;
  due_date?: string;
  revision_rounds?: number;
}

export interface CreateDeliverableInput {
  order_id: string;
  title: string;
  file_url?: string;
  file_format?: string;
  notes?: string;
}

export interface UpdateDeliverableInput {
  title?: string;
  file_url?: string;
  file_format?: string;
  status?: DeliverableStatus;
  notes?: string;
}

// ============================================
// CONSTANTS
// ============================================

// Approval thresholds from spec
const CONTENT_SELF_CLAIM_THRESHOLD = 50000; // <= 50K: self-claim/HOD
const REVISION_FLAG_THRESHOLD = 3; // >3 revisions flags to MD

export function getApprovalLevel(amount: number): 'self' | 'hod' | 'md' {
  return amount <= CONTENT_SELF_CLAIM_THRESHOLD ? 'self' : 'md';
}

export function shouldFlagToMD(revisionCount: number): boolean {
  return revisionCount > REVISION_FLAG_THRESHOLD;
}

// ============================================
// SERVICE CLASS
// ============================================

export class ContentService extends BaseService {
  // ============================================
  // ORDER OPERATIONS
  // ============================================

  /**
   * Get all content orders with optional filters
   */
  static async getOrders(
    filters?: ContentOrderFilters
  ): Promise<BaseListResponse<ContentOrderWithSolution>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_content_orders')
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
    if (filters?.division) {
      query = query.eq('division', filters.division);
    }

    if (filters?.order_type) {
      query = query.eq('order_type', filters.order_type);
    }

    if (filters?.solution_id) {
      query = query.eq('solution_id', filters.solution_id);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch content orders: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as ContentOrderWithSolution[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single order by ID
   */
  static async getOrderById(id: string): Promise<ContentOrderWithSolution | null> {
    const { data, error } = await (this.supabase as any).from('sh_content_orders')
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
      throw new Error(`Failed to fetch content order: ${error.message}`);
    }

    return data as ContentOrderWithSolution;
  }

  /**
   * Get order by solution ID
   */
  static async getOrderBySolutionId(solutionId: string): Promise<ContentOrderWithSolution | null> {
    const { data, error } = await (this.supabase as any).from('sh_content_orders')
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
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch content order: ${error.message}`);
    }

    return data as ContentOrderWithSolution;
  }

  /**
   * Create a new content order
   */
  static async createOrder(input: CreateContentOrderInput): Promise<ContentOrder> {
    const { data, error } = await (this.supabase as any).from('sh_content_orders')
      .insert({
        solution_id: input.solution_id,
        order_type: input.order_type,
        quantity: input.quantity ?? 1,
        brand_guidelines_url: input.brand_guidelines_url,
        division: input.division,
        due_date: input.due_date,
        revision_rounds: input.revision_rounds ?? 2,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create content order: ${error.message}`);
    return data as ContentOrder;
  }

  /**
   * Update a content order
   */
  static async updateOrder(id: string, input: UpdateContentOrderInput): Promise<ContentOrder> {
    const { data, error } = await (this.supabase as any).from('sh_content_orders')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update content order: ${error.message}`);
    return data as ContentOrder;
  }

  /**
   * Delete a content order
   */
  static async deleteOrder(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_content_orders').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete content order: ${error.message}`);
  }

  /**
   * Get orders by division (for queue view)
   */
  static async getOrdersByDivision(
    division: ContentDivision
  ): Promise<ContentOrderWithSolution[]> {
    const result = await this.getOrders({ division });
    return result.data;
  }

  /**
   * Get content order statistics using SQL aggregation (efficient)
   * Uses COUNT with GROUP BY instead of fetching all rows
   */
  static async getOrderStats(): Promise<{
    total: number;
    byDivision: Record<ContentDivision, number>;
    byType: Record<ContentOrderType, number>;
  }> {
    // Initialize stats structure
    const stats = {
      total: 0,
      byDivision: {
        video: 0,
        design: 0,
        writing: 0,
        animation: 0,
        social: 0,
        other: 0,
      } as Record<ContentDivision, number>,
      byType: {
        video: 0,
        graphic: 0,
        document: 0,
        presentation: 0,
        animation: 0,
        social_media: 0,
        other: 0,
      } as Record<ContentOrderType, number>,
    };

    // Get total count
    const { count: totalCount, error: countError } = await (this.supabase as any).from('sh_content_orders')
      .select('id', { count: 'exact', head: true });

    if (countError) throw new Error(`Failed to fetch order count: ${countError.message}`);
    stats.total = totalCount || 0;

    // Get counts by division using RPC or grouped query
    // Supabase JS client doesn't support GROUP BY directly, so we use a workaround
    // Fetch distinct divisions with their counts
    const validDivisions: ContentDivision[] = ['video', 'design', 'writing', 'animation', 'social', 'other'];
    const validOrderTypes: ContentOrderType[] = ['video', 'graphic', 'document', 'presentation', 'animation', 'social_media', 'other'];

    // Parallel fetch counts for each division
    const divisionPromises = validDivisions.map(async (division) => {
      const { count, error } = await (this.supabase as any).from('sh_content_orders')
        .select('id', { count: 'exact', head: true })
        .eq('division', division);
      if (error) throw new Error(`Failed to fetch division count: ${error.message}`);
      return { division, count: count || 0 };
    });

    // Parallel fetch counts for each order type
    const typePromises = validOrderTypes.map(async (orderType) => {
      const { count, error } = await (this.supabase as any).from('sh_content_orders')
        .select('id', { count: 'exact', head: true })
        .eq('order_type', orderType);
      if (error) throw new Error(`Failed to fetch order type count: ${error.message}`);
      return { orderType, count: count || 0 };
    });

    // Execute all counts in parallel
    const [divisionResults, typeResults] = await Promise.all([
      Promise.all(divisionPromises),
      Promise.all(typePromises),
    ]);

    // Populate stats from results
    divisionResults.forEach(({ division, count }) => {
      stats.byDivision[division] = count;
    });

    typeResults.forEach(({ orderType, count }) => {
      stats.byType[orderType] = count;
    });

    return stats;
  }

  // ============================================
  // DELIVERABLE OPERATIONS
  // ============================================

  /**
   * Get all deliverables with optional filters
   */
  static async getDeliverables(
    filters?: DeliverableFilters
  ): Promise<BaseListResponse<ContentDeliverableWithDetails>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_content_deliverables')
      .select(
        `
        *,
        order:sh_content_orders(*),
        assignments:sh_production_assignments(
          id,
          learner_id,
          role,
          learner:sh_production_learners(id, name, division)
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.order_id) {
      query = query.eq('order_id', filters.order_id);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch deliverables: ${error.message}`);

    // Filter by assigned learner if specified (post-query)
    // NOTE: This is a workaround - ideally this filter should be in the query
    let result = data || [];
    let filteredTotal = count || 0;

    if (filters?.assigned_learner_id) {
      result = result.filter((d) =>
        d.assignments?.some((a: { learner_id: string }) => a.learner_id === filters.assigned_learner_id)
      );
      // When post-filtering, we can only report the filtered count for this page
      // The total becomes inaccurate - this is a known limitation of post-query filtering
      filteredTotal = result.length;
    }

    return {
      data: result as ContentDeliverableWithDetails[],
      metadata: {
        total: filteredTotal,
        page,
        limit,
        totalPages: filteredTotal > 0 ? Math.ceil(filteredTotal / limit) : 0,
      },
    };
  }

  /**
   * Get a single deliverable by ID
   */
  static async getDeliverableById(id: string): Promise<ContentDeliverableWithDetails | null> {
    const { data, error } = await (this.supabase as any).from('sh_content_deliverables')
      .select(
        `
        *,
        order:sh_content_orders(*),
        assignments:sh_production_assignments(
          id,
          learner_id,
          role,
          learner:sh_production_learners(id, name, division)
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch deliverable: ${error.message}`);
    }

    return data as ContentDeliverableWithDetails;
  }

  /**
   * Get deliverables by order ID
   */
  static async getDeliverablesByOrderId(orderId: string): Promise<ContentDeliverableWithDetails[]> {
    const result = await this.getDeliverables({ order_id: orderId });
    return result.data;
  }

  /**
   * Create a new deliverable
   */
  static async createDeliverable(input: CreateDeliverableInput): Promise<ContentDeliverable> {
    const { data, error } = await (this.supabase as any).from('sh_content_deliverables')
      .insert({
        order_id: input.order_id,
        title: input.title,
        file_url: input.file_url,
        file_format: input.file_format,
        notes: input.notes,
        status: 'pending' as DeliverableStatus,
        revision_count: 0,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create deliverable: ${error.message}`);
    return data as ContentDeliverable;
  }

  /**
   * Update a deliverable
   */
  static async updateDeliverable(
    id: string,
    input: UpdateDeliverableInput
  ): Promise<ContentDeliverable> {
    const { data, error } = await (this.supabase as any).from('sh_content_deliverables')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update deliverable: ${error.message}`);
    return data as ContentDeliverable;
  }

  /**
   * Delete a deliverable
   */
  static async deleteDeliverable(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_content_deliverables').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete deliverable: ${error.message}`);
  }

  /**
   * Request revision (increments revision count)
   */
  static async requestRevision(id: string, notes?: string): Promise<ContentDeliverable> {
    // Get current deliverable
    const { data: current, error: fetchError } = await (this.supabase as any).from('sh_content_deliverables')
      .select('revision_count')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error(`Failed to fetch deliverable: ${fetchError.message}`);

    const newRevisionCount = (current?.revision_count || 0) + 1;

    const { data, error } = await (this.supabase as any).from('sh_content_deliverables')
      .update({
        status: 'revision' as DeliverableStatus,
        revision_count: newRevisionCount,
        notes: notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to request revision: ${error.message}`);

    // Flag to MD if revision count exceeds threshold
    if (shouldFlagToMD(newRevisionCount)) {
      logger.warn('solutions/content', `Deliverable ${id} has ${newRevisionCount} revisions - flagging to MD`);
    }

    return data as ContentDeliverable;
  }

  /**
   * Approve deliverable (client approval)
   */
  static async approveDeliverable(id: string, approvedBy: string): Promise<ContentDeliverable> {
    const { data, error } = await (this.supabase as any).from('sh_content_deliverables')
      .update({
        status: 'approved' as DeliverableStatus,
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to approve deliverable: ${error.message}`);
    return data as ContentDeliverable;
  }

  /**
   * Reject deliverable
   */
  static async rejectDeliverable(id: string, notes?: string): Promise<ContentDeliverable> {
    const { data, error } = await (this.supabase as any).from('sh_content_deliverables')
      .update({
        status: 'rejected' as DeliverableStatus,
        notes: notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to reject deliverable: ${error.message}`);
    return data as ContentDeliverable;
  }

  /**
   * Submit deliverable for review
   */
  static async submitForReview(
    id: string,
    fileUrl: string,
    fileType?: string
  ): Promise<ContentDeliverable> {
    const { data, error } = await (this.supabase as any).from('sh_content_deliverables')
      .update({
        status: 'review' as DeliverableStatus,
        file_url: fileUrl,
        file_type: fileType,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to submit for review: ${error.message}`);
    return data as ContentDeliverable;
  }

  /**
   * Get deliverable statistics
   */
  static async getDeliverableStats(orderId?: string): Promise<{
    total: number;
    byStatus: Record<DeliverableStatus, number>;
    flaggedForMD: number;
  }> {
    let query = (this.supabase as any).from('sh_content_deliverables')
      .select('status, revision_count');

    if (orderId) {
      query = query.eq('order_id', orderId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch deliverable stats: ${error.message}`);

    const stats = {
      total: data?.length || 0,
      byStatus: {
        pending: 0,
        in_progress: 0,
        review: 0,
        revision: 0,
        approved: 0,
        delivered: 0,
        rejected: 0,
      } as Record<DeliverableStatus, number>,
      flaggedForMD: 0,
    };

    // Valid status values for safe counting
    const validStatuses: DeliverableStatus[] = ['pending', 'in_progress', 'review', 'revision', 'approved', 'delivered', 'rejected'];

    data?.forEach((deliverable) => {
      if (deliverable.status && validStatuses.includes(deliverable.status as DeliverableStatus)) {
        stats.byStatus[deliverable.status as DeliverableStatus]++;
      }
      if (shouldFlagToMD(deliverable.revision_count)) {
        stats.flaggedForMD++;
      }
    });

    return stats;
  }
}

// Export singleton instance methods
export const contentService = {
  getOrders: ContentService.getOrders.bind(ContentService),
  getOrderById: ContentService.getOrderById.bind(ContentService),
  getOrderBySolutionId: ContentService.getOrderBySolutionId.bind(ContentService),
  createOrder: ContentService.createOrder.bind(ContentService),
  updateOrder: ContentService.updateOrder.bind(ContentService),
  deleteOrder: ContentService.deleteOrder.bind(ContentService),
  getOrdersByDivision: ContentService.getOrdersByDivision.bind(ContentService),
  getOrderStats: ContentService.getOrderStats.bind(ContentService),
  getDeliverables: ContentService.getDeliverables.bind(ContentService),
  getDeliverableById: ContentService.getDeliverableById.bind(ContentService),
  getDeliverablesByOrderId: ContentService.getDeliverablesByOrderId.bind(ContentService),
  createDeliverable: ContentService.createDeliverable.bind(ContentService),
  updateDeliverable: ContentService.updateDeliverable.bind(ContentService),
  deleteDeliverable: ContentService.deleteDeliverable.bind(ContentService),
  requestRevision: ContentService.requestRevision.bind(ContentService),
  approveDeliverable: ContentService.approveDeliverable.bind(ContentService),
  rejectDeliverable: ContentService.rejectDeliverable.bind(ContentService),
  submitForReview: ContentService.submitForReview.bind(ContentService),
  getDeliverableStats: ContentService.getDeliverableStats.bind(ContentService),
  getApprovalLevel,
  shouldFlagToMD,
  CONTENT_SELF_CLAIM_THRESHOLD,
  REVISION_FLAG_THRESHOLD,
};
