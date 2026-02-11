// lib/services/learners-council/issue-service.ts
// LC-006: Issue Management - Service Layer
// Wraps the existing Grievance module with LC-specific views

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  GrievanceTicket,
  GrievanceStatus,
  GrievancePriority
} from '@/types/grievance';

/** Kanban board data structure */
export interface KanbanBoard {
  columns: {
    id: GrievanceStatus;
    title: string;
    items: GrievanceTicket[];
  }[];
}

/** Issue stats summary */
export interface LCIssueStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  by_category: { category_name: string; count: number }[];
  by_priority: Record<string, number>;
  resolved_this_month: number;
}

export class LCIssueService {
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // ISSUE QUERY METHODS
  // ============================================================================

  /**
   * Get LC-related issues (grievance tickets) with optional filters
   * Supports pagination
   */
  static async getLCIssues(filters: {
    status?: string;
    assigned_to?: string;
    institution_id?: string;
    priority?: string;
    category_id?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    data: GrievanceTicket[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    let query = (this.supabase as any)
      .from('grievance_tickets')
      .select(`
        *,
        category:grievance_categories!category_id(id, name),
        assignee:profiles!assigned_to(id, full_name, email, avatar_url)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.assigned_to) {
      query = query.eq('assigned_to', filters.assigned_to);
    }
    if (filters.priority) {
      query = query.eq('priority', filters.priority);
    }
    if (filters.category_id) {
      query = query.eq('category_id', filters.category_id);
    }
    if (filters.search) {
      const sanitized = filters.search.replace(/[%_\\]/g, '\\$&');
      query = query.or(`subject.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[lc/issues] Error fetching issues:', error);
      throw new Error(`Failed to fetch issues: ${error.message}`);
    }

    const total = count || 0;

    return {
      data: (data || []) as GrievanceTicket[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get a single issue by ID with full details
   */
  static async getIssueById(id: string): Promise<GrievanceTicket> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_tickets')
      .select(`
        *,
        category:grievance_categories!category_id(id, name, description),
        assignee:profiles!assigned_to(id, full_name, email, avatar_url),
        resolver:profiles!resolved_by(id, full_name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[lc/issues] Error fetching issue:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Issue not found');
      }
      throw new Error(`Failed to fetch issue: ${error.message}`);
    }

    return data as GrievanceTicket;
  }

  // ============================================================================
  // ISSUE MUTATION METHODS
  // ============================================================================

  /**
   * Create an LC issue (grievance ticket with LC category)
   */
  static async createLCIssue(
    data: {
      institution_id: string;
      subject: string;
      description: string;
      category: string;
      priority: string;
    },
    userId: string
  ): Promise<GrievanceTicket> {
    // Look up category ID by name (or use provided category as id)
    let categoryId = data.category;

    // Attempt to find category by name first
    const { data: categoryData } = await (this.supabase as any)
      .from('grievance_categories')
      .select('id')
      .eq('institution_id', data.institution_id)
      .eq('name', data.category)
      .maybeSingle();

    if (categoryData) {
      categoryId = categoryData.id;
    }

    // Get user profile for raiser info
    const { data: profile } = await (this.supabase as any)
      .from('profiles')
      .select('full_name, email, role')
      .eq('id', userId)
      .single();

    const { data: ticket, error } = await (this.supabase as any)
      .from('grievance_tickets')
      .insert({
        institution_id: data.institution_id,
        category_id: categoryId,
        subject: data.subject,
        description: data.description,
        priority: data.priority as GrievancePriority,
        status: 'open' as GrievanceStatus,
        raised_by_type: (profile?.role === 'student' ? 'learner' : profile?.role || 'learner') as 'learner' | 'parent' | 'staff' | 'alumni',
        raised_by_id: userId,
        raised_by_name: profile?.full_name || 'Unknown',
        raised_by_email: profile?.email || null,
        sla_hours: 72, // Default 72h SLA for LC issues
        sla_deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        sla_status: 'on_track',
        attachments: [],
        metadata: { source: 'learners_council' }
      })
      .select(`
        *,
        category:grievance_categories!category_id(id, name),
        assignee:profiles!assigned_to(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) {
      console.error('[lc/issues] Error creating issue:', error);
      throw new Error(`Failed to create issue: ${error.message}`);
    }

    return ticket as GrievanceTicket;
  }

  /**
   * Assign an issue to an LC member
   */
  static async assignIssue(issueId: string, assigneeId: string): Promise<GrievanceTicket> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_tickets')
      .update({
        assigned_to: assigneeId,
        assigned_at: new Date().toISOString(),
        status: 'in_progress' as GrievanceStatus
      })
      .eq('id', issueId)
      .select(`
        *,
        category:grievance_categories!category_id(id, name),
        assignee:profiles!assigned_to(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) {
      console.error('[lc/issues] Error assigning issue:', error);
      throw new Error(`Failed to assign issue: ${error.message}`);
    }

    return data as GrievanceTicket;
  }

  /**
   * Update issue status with optional comment
   */
  static async updateIssueStatus(
    issueId: string,
    status: string,
    comment?: string
  ): Promise<GrievanceTicket> {
    const updateData: Record<string, unknown> = {
      status: status as GrievanceStatus
    };

    // Set resolution timestamp if resolving
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await (this.supabase as any)
      .from('grievance_tickets')
      .update(updateData)
      .eq('id', issueId)
      .select(`
        *,
        category:grievance_categories!category_id(id, name),
        assignee:profiles!assigned_to(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) {
      console.error('[lc/issues] Error updating issue status:', error);
      throw new Error(`Failed to update issue status: ${error.message}`);
    }

    // Add comment if provided
    if (comment && data) {
      await (this.supabase as any).from('grievance_comments').insert({
        ticket_id: issueId,
        author_name: 'System',
        author_type: 'system',
        content: `Status changed to ${status}. ${comment}`,
        is_internal: false,
        attachments: []
      });
    }

    return data as GrievanceTicket;
  }

  // ============================================================================
  // KANBAN & ANALYTICS METHODS
  // ============================================================================

  /**
   * Get issues grouped by status for kanban board view
   */
  static async getKanbanBoard(
    institutionId: string,
    assignedTo?: string
  ): Promise<KanbanBoard> {
    let query = (this.supabase as any)
      .from('grievance_tickets')
      .select(`
        *,
        category:grievance_categories!category_id(id, name),
        assignee:profiles!assigned_to(id, full_name, email, avatar_url)
      `)
      .eq('institution_id', institutionId)
      .in('status', ['open', 'in_progress', 'resolved', 'closed'])
      .order('created_at', { ascending: false });

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[lc/issues] Error fetching kanban board:', error);
      throw new Error(`Failed to fetch kanban board: ${error.message}`);
    }

    const tickets = (data || []) as GrievanceTicket[];

    const columns: KanbanBoard['columns'] = [
      { id: 'open', title: 'New', items: tickets.filter(t => t.status === 'open') },
      { id: 'in_progress', title: 'In Progress', items: tickets.filter(t => t.status === 'in_progress') },
      { id: 'resolved', title: 'Resolved', items: tickets.filter(t => t.status === 'resolved') },
      { id: 'closed', title: 'Closed', items: tickets.filter(t => t.status === 'closed') }
    ];

    return { columns };
  }

  /**
   * Get rule-based similar issues (keyword matching)
   */
  static async getSimilarIssues(
    subject: string,
    institutionId: string
  ): Promise<GrievanceTicket[]> {
    // Extract keywords (words > 3 chars, exclude common words)
    const stopWords = ['the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'been', 'about', 'issue', 'problem'];
    const keywords = subject
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.includes(w))
      .slice(0, 5);

    if (keywords.length === 0) return [];

    // Build OR condition for keyword matching
    const orCondition = keywords.map(kw => `subject.ilike.%${kw}%`).join(',');

    const { data, error } = await (this.supabase as any)
      .from('grievance_tickets')
      .select(`
        id, subject, status, priority, created_at,
        category:grievance_categories!category_id(id, name)
      `)
      .eq('institution_id', institutionId)
      .or(orCondition)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[lc/issues] Error finding similar issues:', error);
      return [];
    }

    return (data || []) as GrievanceTicket[];
  }

  /**
   * Merge duplicate issues into a primary issue
   */
  static async mergeIssues(
    primaryId: string,
    duplicateIds: string[]
  ): Promise<GrievanceTicket> {
    // Close duplicates with a reference to the primary
    for (const dupId of duplicateIds) {
      await (this.supabase as any)
        .from('grievance_tickets')
        .update({
          status: 'closed' as GrievanceStatus,
          resolution: `Merged into ticket. Primary issue ID: ${primaryId}`,
          resolved_at: new Date().toISOString(),
          metadata: { merged_into: primaryId }
        })
        .eq('id', dupId);

      // Add a comment on the duplicate
      await (this.supabase as any).from('grievance_comments').insert({
        ticket_id: dupId,
        author_name: 'System',
        author_type: 'system',
        content: `This issue was merged into another issue (${primaryId}) as a duplicate.`,
        is_internal: false,
        attachments: []
      });
    }

    // Add a comment on the primary
    await (this.supabase as any).from('grievance_comments').insert({
      ticket_id: primaryId,
      author_name: 'System',
      author_type: 'system',
      content: `${duplicateIds.length} duplicate issue(s) were merged into this issue.`,
      is_internal: false,
      attachments: []
    });

    // Return updated primary
    return this.getIssueById(primaryId);
  }

  /**
   * Get issue statistics for the dashboard
   */
  static async getIssueStats(institutionId: string): Promise<LCIssueStats> {
    // Get counts by status
    const statuses: GrievanceStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
    const statusCounts: Record<string, number> = {};

    const countPromises = statuses.map(async (status) => {
      const { count } = await (this.supabase as any)
        .from('grievance_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('institution_id', institutionId)
        .eq('status', status);
      statusCounts[status] = count || 0;
    });

    // Get total count
    const totalPromise = (this.supabase as any)
      .from('grievance_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId);

    // Get resolved this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const resolvedMonthPromise = (this.supabase as any)
      .from('grievance_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('status', 'resolved')
      .gte('resolved_at', startOfMonth.toISOString());

    // Get category breakdown
    const categoriesPromise = (this.supabase as any)
      .from('grievance_tickets')
      .select(`
        category:grievance_categories!category_id(name)
      `)
      .eq('institution_id', institutionId)
      .in('status', ['open', 'in_progress']);

    // Get priority breakdown
    const prioritiesPromise = (this.supabase as any)
      .from('grievance_tickets')
      .select('priority')
      .eq('institution_id', institutionId)
      .in('status', ['open', 'in_progress']);

    await Promise.all(countPromises);
    const [totalResult, resolvedMonthResult, categoriesResult, prioritiesResult] = await Promise.all([
      totalPromise,
      resolvedMonthPromise,
      categoriesPromise,
      prioritiesPromise
    ]);

    // Build category counts
    const categoryCounts: Record<string, number> = {};
    (categoriesResult.data || []).forEach((t: any) => {
      const name = t.category?.name || 'Uncategorized';
      categoryCounts[name] = (categoryCounts[name] || 0) + 1;
    });
    const byCategory = Object.entries(categoryCounts).map(([category_name, count]) => ({
      category_name,
      count
    }));

    // Build priority counts
    const priorityCounts: Record<string, number> = {};
    (prioritiesResult.data || []).forEach((t: any) => {
      const p = t.priority || 'medium';
      priorityCounts[p] = (priorityCounts[p] || 0) + 1;
    });

    return {
      total: totalResult.count || 0,
      open: statusCounts['open'] || 0,
      in_progress: statusCounts['in_progress'] || 0,
      resolved: statusCounts['resolved'] || 0,
      closed: statusCounts['closed'] || 0,
      by_category: byCategory,
      by_priority: priorityCounts,
      resolved_this_month: resolvedMonthResult.count || 0
    };
  }
}
