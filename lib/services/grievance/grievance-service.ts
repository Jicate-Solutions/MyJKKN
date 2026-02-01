// lib/services/grievance/grievance-service.ts
// F004: Grievance Ticketing System - Service Layer

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  GrievanceCategory,
  GrievanceTicket,
  GrievanceComment,
  GrievanceHistory,
  GrievanceTicketFilters,
  GrievanceTicketListResponse,
  GrievanceDashboardStats,
  GrievanceSLAReport,
  CreateGrievanceCategoryDto,
  UpdateGrievanceCategoryDto,
  CreateGrievanceTicketDto,
  UpdateGrievanceTicketDto,
  CreateGrievanceCommentDto,
  GrievanceStatus,
  GrievanceAttachment
} from '@/types/grievance';

export class GrievanceService {
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // CATEGORY METHODS
  // ============================================================================

  /**
   * Get all categories for an institution (with tree structure)
   */
  static async getCategories(institutionId: string): Promise<GrievanceCategory[]> {
    const { data, error } = await this.supabase
      .from('grievance_categories')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('[GrievanceService] Error fetching categories:', error);
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }

    // Build tree structure
    const categories = data || [];
    const rootCategories = categories.filter(c => !c.parent_id);
    rootCategories.forEach(root => {
      root.children = categories.filter(c => c.parent_id === root.id);
    });

    return rootCategories as GrievanceCategory[];
  }

  /**
   * Get all categories (flat list)
   */
  static async getAllCategories(institutionId: string, includeInactive = false): Promise<GrievanceCategory[]> {
    let query = this.supabase
      .from('grievance_categories')
      .select('*')
      .eq('institution_id', institutionId)
      .order('sort_order');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GrievanceService] Error fetching all categories:', error);
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }

    return (data || []) as GrievanceCategory[];
  }

  /**
   * Get a single category by ID
   */
  static async getCategory(id: string, institutionId?: string): Promise<GrievanceCategory> {
    let query = this.supabase
      .from('grievance_categories')
      .select(`
        *,
        parent:grievance_categories!parent_id(id, name)
      `)
      .eq('id', id);

    // SECURITY: Filter by institution_id if provided to prevent cross-institution access
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error('[GrievanceService] Error fetching category:', error);
      // SECURITY: Don't expose internal error details
      if (error.code === 'PGRST116') {
        throw new Error('Category not found or access denied');
      }
      throw new Error('Failed to fetch category');
    }

    if (!data) {
      throw new Error('Category not found');
    }

    return data as GrievanceCategory;
  }

  /**
   * Create a new category
   */
  static async createCategory(categoryData: CreateGrievanceCategoryDto): Promise<GrievanceCategory> {
    const { data, error } = await this.supabase
      .from('grievance_categories')
      .insert(categoryData)
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error creating category:', error);
      throw new Error(`Failed to create category: ${error.message}`);
    }

    return data as GrievanceCategory;
  }

  /**
   * Update a category
   */
  static async updateCategory(id: string, categoryData: UpdateGrievanceCategoryDto): Promise<GrievanceCategory> {
    const { data, error } = await this.supabase
      .from('grievance_categories')
      .update(categoryData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error updating category:', error);
      throw new Error(`Failed to update category: ${error.message}`);
    }

    return data as GrievanceCategory;
  }

  /**
   * Delete a category (soft delete by setting is_active to false)
   */
  static async deleteCategory(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('grievance_categories')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[GrievanceService] Error deleting category:', error);
      throw new Error(`Failed to delete category: ${error.message}`);
    }
  }

  /**
   * Seed default categories for an institution
   */
  static async seedCategories(institutionId: string): Promise<void> {
    const { error } = await this.supabase.rpc('seed_grievance_categories', {
      p_institution_id: institutionId
    });

    if (error) {
      console.error('[GrievanceService] Error seeding categories:', error);
      throw new Error(`Failed to seed categories: ${error.message}`);
    }
  }

  // ============================================================================
  // TICKET METHODS
  // ============================================================================

  /**
   * Get tickets with filters and pagination
   */
  static async getTickets(filters: GrievanceTicketFilters = {}): Promise<GrievanceTicketListResponse> {
    let query = this.supabase
      .from('grievance_tickets')
      .select(`
        *,
        category:grievance_categories(id, name, default_sla_hours),
        assignee:users_profiles!assigned_to(id, full_name, email),
        department:departments(id, name),
        resolver:users_profiles!resolved_by(id, full_name)
      `, { count: 'exact' });

    // Apply filters
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.sla_status) {
      query = query.eq('sla_status', filters.sla_status);
    }
    if (filters.priority) {
      query = query.eq('priority', filters.priority);
    }
    if (filters.assigned_to) {
      query = query.eq('assigned_to', filters.assigned_to);
    }
    if (filters.category_id) {
      query = query.eq('category_id', filters.category_id);
    }
    if (filters.raised_by_type) {
      query = query.eq('raised_by_type', filters.raised_by_type);
    }
    if (filters.raised_by_id) {
      query = query.eq('raised_by_id', filters.raised_by_id);
    }
    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters.search) {
      // Sanitize search to prevent SQL injection
      const sanitizedSearch = filters.search.replace(/[%_]/g, '\\$&');
      query = query.or(`subject.ilike.%${sanitizedSearch}%,ticket_number.ilike.%${sanitizedSearch}%,description.ilike.%${sanitizedSearch}%`);
    }
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    // Apply sorting
    const sortBy = filters.sortBy || 'created_at';
    const sortDirection = filters.sortDirection || 'desc';
    query = query.order(sortBy, { ascending: sortDirection === 'asc' });

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[GrievanceService] Error fetching tickets:', error);
      throw new Error(`Failed to fetch tickets: ${error.message}`);
    }

    return {
      data: (data || []) as GrievanceTicket[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  /**
   * Get a single ticket by ID
   */
  static async getTicket(id: string, institutionId?: string): Promise<GrievanceTicket> {
    let query = this.supabase
      .from('grievance_tickets')
      .select(`
        *,
        category:grievance_categories(id, name, default_sla_hours),
        assignee:users_profiles!assigned_to(id, full_name, email),
        department:departments(id, name),
        resolver:users_profiles!resolved_by(id, full_name)
      `)
      .eq('id', id);

    // SECURITY: Filter by institution_id if provided to prevent cross-institution access
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error('[GrievanceService] Error fetching ticket:', error);
      // SECURITY: Don't expose internal error details
      if (error.code === 'PGRST116') {
        throw new Error('Ticket not found or access denied');
      }
      throw new Error('Failed to fetch ticket');
    }

    if (!data) {
      throw new Error('Ticket not found');
    }

    return data as GrievanceTicket;
  }

  /**
   * Get ticket by ticket number
   */
  static async getTicketByNumber(ticketNumber: string): Promise<GrievanceTicket> {
    const { data, error } = await this.supabase
      .from('grievance_tickets')
      .select(`
        *,
        category:grievance_categories(id, name, default_sla_hours),
        assignee:users_profiles!assigned_to(id, full_name, email),
        department:departments(id, name),
        resolver:users_profiles!resolved_by(id, full_name)
      `)
      .eq('ticket_number', ticketNumber)
      .single();

    if (error) {
      console.error('[GrievanceService] Error fetching ticket by number:', error);
      throw new Error(`Failed to fetch ticket: ${error.message}`);
    }

    return data as GrievanceTicket;
  }

  /**
   * Create a new ticket
   */
  static async createTicket(ticketData: CreateGrievanceTicketDto): Promise<GrievanceTicket> {
    // SECURITY: Validate institution_id is provided
    if (!ticketData.institution_id) {
      throw new Error('Institution ID is required');
    }

    // Get category to determine SLA - also verify it belongs to the same institution
    const { data: category, error: categoryError } = await this.supabase
      .from('grievance_categories')
      .select('default_sla_hours, institution_id')
      .eq('id', ticketData.category_id)
      .eq('institution_id', ticketData.institution_id)
      .single();

    if (categoryError || !category) {
      console.error('[GrievanceService] Error fetching category for SLA:', categoryError);
      throw new Error('Invalid category for this institution');
    }

    const slaHours = category?.default_sla_hours || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .from('grievance_tickets')
      .insert({
        ...ticketData,
        sla_hours: slaHours,
        sla_deadline: slaDeadline.toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error creating ticket:', error);
      throw new Error(`Failed to create ticket: ${error.message}`);
    }

    // Log history
    await this.logHistory(data.id, 'created', null, data.status);

    return data as GrievanceTicket;
  }

  /**
   * Update a ticket
   */
  static async updateTicket(id: string, ticketData: UpdateGrievanceTicketDto): Promise<GrievanceTicket> {
    // Get current ticket for history logging
    const { data: current } = await this.supabase
      .from('grievance_tickets')
      .select('status, priority, assigned_to')
      .eq('id', id)
      .single();

    const { data, error } = await this.supabase
      .from('grievance_tickets')
      .update(ticketData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error updating ticket:', error);
      throw new Error(`Failed to update ticket: ${error.message}`);
    }

    // Log history for status changes
    if (ticketData.status && current?.status !== ticketData.status) {
      await this.logHistory(id, 'status_changed', current?.status, ticketData.status);
    }
    if (ticketData.priority && current?.priority !== ticketData.priority) {
      await this.logHistory(id, 'priority_changed', current?.priority, ticketData.priority);
    }

    return data as GrievanceTicket;
  }

  /**
   * Assign a ticket
   */
  static async assignTicket(ticketId: string, assigneeId: string, departmentId?: string): Promise<GrievanceTicket> {
    const { data, error } = await this.supabase
      .from('grievance_tickets')
      .update({
        assigned_to: assigneeId,
        assigned_at: new Date().toISOString(),
        department_id: departmentId || null,
        status: 'in_progress' as GrievanceStatus
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error assigning ticket:', error);
      throw new Error(`Failed to assign ticket: ${error.message}`);
    }

    await this.logHistory(ticketId, 'assigned', null, assigneeId);
    await this.logHistory(ticketId, 'status_changed', 'open', 'in_progress');

    return data as GrievanceTicket;
  }

  /**
   * Resolve a ticket
   */
  static async resolveTicket(ticketId: string, resolution: string, resolvedBy: string): Promise<GrievanceTicket> {
    const { data, error } = await this.supabase
      .from('grievance_tickets')
      .update({
        status: 'resolved' as GrievanceStatus,
        resolution,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error resolving ticket:', error);
      throw new Error(`Failed to resolve ticket: ${error.message}`);
    }

    await this.logHistory(ticketId, 'resolved', null, resolution);

    return data as GrievanceTicket;
  }

  /**
   * Update ticket status
   */
  static async updateStatus(ticketId: string, status: GrievanceStatus, note?: string): Promise<GrievanceTicket> {
    const { data: current } = await this.supabase
      .from('grievance_tickets')
      .select('status')
      .eq('id', ticketId)
      .single();

    const { data, error } = await this.supabase
      .from('grievance_tickets')
      .update({ status })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error updating status:', error);
      throw new Error(`Failed to update status: ${error.message}`);
    }

    await this.logHistory(ticketId, 'status_changed', current?.status, status);

    if (note) {
      await this.addComment(ticketId, {
        author_name: 'System',
        author_type: 'system',
        content: note,
        is_internal: true
      });
    }

    return data as GrievanceTicket;
  }

  /**
   * Rate satisfaction
   */
  static async rateSatisfaction(ticketId: string, rating: number, feedback?: string): Promise<GrievanceTicket> {
    const { data, error } = await this.supabase
      .from('grievance_tickets')
      .update({
        satisfaction_rating: rating,
        satisfaction_feedback: feedback || null,
        status: 'closed' as GrievanceStatus
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error rating satisfaction:', error);
      throw new Error(`Failed to rate satisfaction: ${error.message}`);
    }

    await this.logHistory(ticketId, 'rated', null, `${rating}/5`);
    await this.logHistory(ticketId, 'status_changed', 'resolved', 'closed');

    return data as GrievanceTicket;
  }

  /**
   * Reopen a ticket
   */
  static async reopenTicket(ticketId: string, reason: string): Promise<GrievanceTicket> {
    const { data, error } = await this.supabase
      .from('grievance_tickets')
      .update({
        status: 'reopened' as GrievanceStatus,
        resolution: null,
        resolved_at: null,
        resolved_by: null,
        satisfaction_rating: null,
        satisfaction_feedback: null
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error reopening ticket:', error);
      throw new Error(`Failed to reopen ticket: ${error.message}`);
    }

    await this.logHistory(ticketId, 'reopened', null, reason);

    await this.addComment(ticketId, {
      author_name: 'System',
      author_type: 'system',
      content: `Ticket reopened: ${reason}`,
      is_internal: false
    });

    return data as GrievanceTicket;
  }

  // ============================================================================
  // COMMENT METHODS
  // ============================================================================

  /**
   * Get comments for a ticket
   */
  static async getComments(ticketId: string, includeInternal = false): Promise<GrievanceComment[]> {
    let query = this.supabase
      .from('grievance_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (!includeInternal) {
      query = query.eq('is_internal', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GrievanceService] Error fetching comments:', error);
      throw new Error(`Failed to fetch comments: ${error.message}`);
    }

    return (data || []) as GrievanceComment[];
  }

  /**
   * Add a comment to a ticket
   */
  static async addComment(ticketId: string, commentData: CreateGrievanceCommentDto): Promise<GrievanceComment> {
    const { data, error } = await this.supabase
      .from('grievance_comments')
      .insert({
        ticket_id: ticketId,
        ...commentData
      })
      .select()
      .single();

    if (error) {
      console.error('[GrievanceService] Error adding comment:', error);
      throw new Error(`Failed to add comment: ${error.message}`);
    }

    // Log history if not a system comment
    if (commentData.author_type !== 'system') {
      await this.logHistory(ticketId, 'commented', null, commentData.content.substring(0, 100));
    }

    return data as GrievanceComment;
  }

  // ============================================================================
  // HISTORY METHODS
  // ============================================================================

  /**
   * Get history for a ticket
   */
  static async getHistory(ticketId: string): Promise<GrievanceHistory[]> {
    const { data, error } = await this.supabase
      .from('grievance_history')
      .select(`
        *,
        performer:users_profiles!performed_by(id, full_name)
      `)
      .eq('ticket_id', ticketId)
      .order('performed_at', { ascending: false });

    if (error) {
      console.error('[GrievanceService] Error fetching history:', error);
      throw new Error(`Failed to fetch history: ${error.message}`);
    }

    return (data || []) as GrievanceHistory[];
  }

  /**
   * Log a history entry
   */
  private static async logHistory(
    ticketId: string,
    action: string,
    oldValue: string | null,
    newValue: string | null
  ): Promise<void> {
    const { data: user } = await this.supabase.auth.getUser();

    const { error } = await this.supabase
      .from('grievance_history')
      .insert({
        ticket_id: ticketId,
        action,
        old_value: oldValue,
        new_value: newValue,
        performed_by: user?.user?.id || null
      });

    if (error) {
      console.error('[GrievanceService] Error logging history:', error);
      // Don't throw - history logging shouldn't break the main operation
    }
  }

  // ============================================================================
  // DASHBOARD & REPORTING METHODS
  // ============================================================================

  /**
   * Get dashboard stats for an institution
   */
  static async getDashboardStats(institutionId: string): Promise<GrievanceDashboardStats> {
    const { data, error } = await this.supabase.rpc('get_grievance_sla_stats', {
      p_institution_id: institutionId
    });

    if (error) {
      console.error('[GrievanceService] Error fetching dashboard stats:', error);
      throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
    }

    return data as GrievanceDashboardStats;
  }

  /**
   * Get SLA compliance report
   */
  static async getSLAReport(
    institutionId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<GrievanceSLAReport> {
    // Get tickets within date range
    let query = this.supabase
      .from('grievance_tickets')
      .select(`
        id,
        category_id,
        priority,
        status,
        sla_hours,
        sla_deadline,
        sla_status,
        created_at,
        resolved_at,
        category:grievance_categories(name)
      `)
      .eq('institution_id', institutionId);

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GrievanceService] Error fetching SLA report:', error);
      throw new Error(`Failed to fetch SLA report: ${error.message}`);
    }

    const tickets = data || [];

    // Calculate metrics
    const totalTickets = tickets.length;
    const resolvedTickets = tickets.filter(t => t.resolved_at);
    const breachedTickets = tickets.filter(t => t.sla_status === 'breached');

    // Calculate resolution times
    const resolutionTimes = resolvedTickets.map(t => {
      const created = new Date(t.created_at).getTime();
      const resolved = new Date(t.resolved_at!).getTime();
      return (resolved - created) / (1000 * 60 * 60); // hours
    });
    const avgResolutionHours = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0;

    // Tickets resolved within SLA
    const resolvedWithinSLA = resolvedTickets.filter(t => {
      const resolved = new Date(t.resolved_at!).getTime();
      const deadline = new Date(t.sla_deadline).getTime();
      return resolved <= deadline;
    }).length;

    // By category
    const byCategory: Record<string, { total: number; within_sla: number; avg_hours: number }> = {};
    tickets.forEach(t => {
      const categoryName = (t.category as any)?.name || 'Unknown';
      if (!byCategory[categoryName]) {
        byCategory[categoryName] = { total: 0, within_sla: 0, avg_hours: 0 };
      }
      byCategory[categoryName].total++;

      if (t.resolved_at) {
        const resolved = new Date(t.resolved_at).getTime();
        const deadline = new Date(t.sla_deadline).getTime();
        if (resolved <= deadline) {
          byCategory[categoryName].within_sla++;
        }
      }
    });

    // By priority
    const byPriority: Record<string, { total: number; within_sla: number; breached: number }> = {
      low: { total: 0, within_sla: 0, breached: 0 },
      medium: { total: 0, within_sla: 0, breached: 0 },
      high: { total: 0, within_sla: 0, breached: 0 },
      urgent: { total: 0, within_sla: 0, breached: 0 }
    };
    tickets.forEach(t => {
      byPriority[t.priority].total++;
      if (t.sla_status === 'breached') {
        byPriority[t.priority].breached++;
      }
      if (t.resolved_at) {
        const resolved = new Date(t.resolved_at).getTime();
        const deadline = new Date(t.sla_deadline).getTime();
        if (resolved <= deadline) {
          byPriority[t.priority].within_sla++;
        }
      }
    });

    // By status
    const byStatus: Record<string, number> = {
      open: 0,
      in_progress: 0,
      pending_info: 0,
      resolved: 0,
      closed: 0,
      reopened: 0
    };
    tickets.forEach(t => {
      byStatus[t.status]++;
    });

    // SLA compliance rate
    const slaComplianceRate = resolvedTickets.length > 0
      ? (resolvedWithinSLA / resolvedTickets.length) * 100
      : 100;

    return {
      total_tickets: totalTickets,
      resolved_within_sla: resolvedWithinSLA,
      breached: breachedTickets.length,
      avg_resolution_hours: Math.round(avgResolutionHours * 10) / 10,
      by_category: byCategory,
      by_priority: byPriority as any,
      by_status: byStatus as any,
      sla_compliance_rate: Math.round(slaComplianceRate * 10) / 10,
      trend: [] // Would need separate query for trend data
    };
  }

  /**
   * Get my tickets (for current user)
   */
  static async getMyTickets(filters: GrievanceTicketFilters = {}): Promise<GrievanceTicketListResponse> {
    const { data: user } = await this.supabase.auth.getUser();
    if (!user?.user?.id) {
      throw new Error('User not authenticated');
    }

    // Get tickets raised by this user
    return this.getTickets({
      ...filters,
      raised_by_id: user.user.id
    });
  }

  /**
   * Get assigned tickets (for staff)
   */
  static async getAssignedTickets(filters: GrievanceTicketFilters = {}): Promise<GrievanceTicketListResponse> {
    const { data: user } = await this.supabase.auth.getUser();
    if (!user?.user?.id) {
      throw new Error('User not authenticated');
    }

    return this.getTickets({
      ...filters,
      assigned_to: user.user.id
    });
  }
}
