// lib/services/admission/lead-service.ts
// Admission CRM Lead Service - Supabase interactions

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionLead,
  CreateLeadInput,
  UpdateLeadInput,
  LeadFilters,
  LeadListResponse,
  FunnelStage,
  LeadPriority
} from '@/types/admission';

export class LeadService {
  private static supabase = createClientSupabaseClient();

  /**
   * Sanitize search input to prevent SQL injection
   */
  private static sanitizeSearch(input: string): string {
    if (!input) return '';
    return input.replace(/[%_\\]/g, '\\$&');
  }

  /**
   * Generate a unique lead number
   */
  private static generateLeadNumber(): string {
    const year = new Date().getFullYear().toString().slice(-2);
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `LEAD-${year}-${random}`;
  }

  /**
   * Normalize a lead row from the DB to ensure `priority` field is computed
   * from is_hot_lead / is_priority booleans if the DB doesn't have a priority enum column.
   * Also normalizes `last_contacted_at` from possible `last_contact_at`.
   */
  private static normalizeLead(row: any): AdmissionLead {
    if (!row) return row;

    // Compute priority from boolean flags if not already set as an enum
    if (!row.priority || typeof row.priority !== 'string') {
      if (row.is_hot_lead) {
        row.priority = 'hot';
      } else if (row.is_priority) {
        row.priority = 'warm';
      } else {
        row.priority = 'cold';
      }
    }

    // Normalize last_contacted_at from either column name variant
    if (!row.last_contacted_at && row.last_contact_at) {
      row.last_contacted_at = row.last_contact_at;
    }
    if (!row.last_contacted_at && row.last_activity_at) {
      row.last_contacted_at = row.last_activity_at;
    }

    return row as AdmissionLead;
  }

  // ============================================================================
  // LEAD CRUD METHODS
  // ============================================================================

  /**
   * Get leads with filters and pagination
   */
  static async getLeads(filters: LeadFilters): Promise<LeadListResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (this.supabase as any)
      .from('admission_leads')
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `, { count: 'exact' });

    // Apply filters
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.funnel_stage) {
      if (Array.isArray(filters.funnel_stage)) {
        query = query.in('funnel_stage', filters.funnel_stage);
      } else {
        query = query.eq('funnel_stage', filters.funnel_stage);
      }
    }
    if (filters.priority) {
      // Map priority filter to actual DB columns (is_hot_lead, is_priority booleans)
      if (filters.priority === 'hot' || (Array.isArray(filters.priority) && filters.priority.includes('hot'))) {
        query = query.eq('is_hot_lead', true);
      } else if (filters.priority === 'warm' || (Array.isArray(filters.priority) && filters.priority.includes('warm'))) {
        query = query.eq('is_priority', true);
      }
    }
    if (filters.source) {
      if (Array.isArray(filters.source)) {
        query = query.in('source', filters.source);
      } else {
        query = query.eq('source', filters.source);
      }
    }
    if (filters.counselor_id) {
      query = query.eq('counselor_id', filters.counselor_id);
    }
    if (filters.program_interest) {
      query = query.contains('interested_programs', [filters.program_interest]);
    }
    if (filters.search) {
      const sanitizedSearch = this.sanitizeSearch(filters.search);
      query = query.or(`full_name.ilike.%${sanitizedSearch}%,phone.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%`);
    }
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    // Apply sorting
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[LeadService] Error fetching leads:', error);
      throw new Error(`Failed to fetch leads: ${error.message}`);
    }

    return {
      data: (data || []).map((row: any) => this.normalizeLead(row)),
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  /**
   * Get a single lead by ID
   */
  static async getLead(id: string, institutionId?: string): Promise<AdmissionLead> {
    let query = (this.supabase as any).from('admission_leads')
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `)
      .eq('id', id);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error('[LeadService] Error fetching lead:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Lead not found');
      }
      throw new Error(`Failed to fetch lead: ${error.message}`);
    }

    return this.normalizeLead(data);
  }

  /**
   * Create a new lead
   */
  static async createLead(leadData: CreateLeadInput): Promise<AdmissionLead> {
    // SECURITY: Validate required fields
    if (!leadData.institution_id) {
      throw new Error('Institution ID is required');
    }
    if (!leadData.full_name?.trim()) {
      throw new Error('Full name is required');
    }
    if (!leadData.phone?.trim()) {
      throw new Error('Phone number is required');
    }
    if (!leadData.source) {
      throw new Error('Lead source is required');
    }

    // Get current user for created_by
    const { data: { user } } = await (this.supabase as any).auth.getUser();

    // Only include columns that exist in admission_leads table
    const insertData: any = {
      institution_id: leadData.institution_id,
      full_name: leadData.full_name?.trim(),
      email: leadData.email || null,
      phone: leadData.phone?.trim(),
      source: leadData.source,
      funnel_stage: 'new' as FunnelStage,
      is_hot_lead: false,
      is_priority: false,
      score: 0,
      tags: leadData.tags || [],
      created_by: user?.id || null,
      is_active: true
    };

    // Add optional columns that exist in the table
    if (leadData.counselor_id) insertData.counselor_id = leadData.counselor_id;
    if ((leadData as any).preferred_channel) insertData.preferred_channel = (leadData as any).preferred_channel;
    if ((leadData as any).interested_programs) insertData.interested_programs = (leadData as any).interested_programs;
    if ((leadData as any).parent_name) insertData.parent_name = (leadData as any).parent_name;
    if ((leadData as any).parent_phone) insertData.parent_phone = (leadData as any).parent_phone;
    if ((leadData as any).parent_email) insertData.parent_email = (leadData as any).parent_email;

    const { data, error } = await (this.supabase as any).from('admission_leads')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      console.error('[LeadService] Error creating lead:', error);
      throw new Error(`Failed to create lead: ${error.message}`);
    }

    // Log stage history
    await this.logStageHistory(data.id, null, 'new', user?.id);

    return this.normalizeLead(data);
  }

  /**
   * Update a lead
   */
  static async updateLead(id: string, leadData: Partial<UpdateLeadInput>): Promise<AdmissionLead> {
    // Get current lead for history logging
    const { data: current } = await (this.supabase as any).from('admission_leads')
      .select('funnel_stage, priority, counselor_id')
      .eq('id', id)
      .single();

    const { data: { user } } = await (this.supabase as any).auth.getUser();

    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update({
        ...leadData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `)
      .single();

    if (error) {
      console.error('[LeadService] Error updating lead:', error);
      throw new Error(`Failed to update lead: ${error.message}`);
    }

    // Log stage change if applicable
    if (leadData.funnel_stage && current?.funnel_stage !== leadData.funnel_stage) {
      await this.logStageHistory(id, current?.funnel_stage, leadData.funnel_stage, user?.id);
    }

    return this.normalizeLead(data);
  }

  /**
   * Delete a lead (soft delete by marking as lost)
   */
  static async deleteLead(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('admission_leads')
      .update({ funnel_stage: 'lost' as FunnelStage })
      .eq('id', id);

    if (error) {
      console.error('[LeadService] Error deleting lead:', error);
      throw new Error(`Failed to delete lead: ${error.message}`);
    }
  }

  // ============================================================================
  // STAGE MANAGEMENT
  // ============================================================================

  /**
   * Update lead funnel stage
   */
  static async updateStage(leadId: string, newStage: FunnelStage, notes?: string): Promise<AdmissionLead> {
    const { data: current } = await (this.supabase as any).from('admission_leads')
      .select('funnel_stage')
      .eq('id', leadId)
      .single();

    const { data: { user } } = await (this.supabase as any).auth.getUser();

    const updateData: any = {
      funnel_stage: newStage,
      updated_at: new Date().toISOString()
    };

    // Set last_contact_at if moving from new to contacted
    // Note: production DB uses last_contact_at, migration uses last_contacted_at
    if (newStage === 'contacted' && current?.funnel_stage === 'new') {
      updateData.last_contact_at = new Date().toISOString();
    }

    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update(updateData)
      .eq('id', leadId)
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `)
      .single();

    if (error) {
      console.error('[LeadService] Error updating stage:', error);
      throw new Error(`Failed to update stage: ${error.message}`);
    }

    // Log stage history
    await this.logStageHistory(leadId, current?.funnel_stage, newStage, user?.id, notes);

    return this.normalizeLead(data);
  }

  /**
   * Log stage change history
   */
  private static async logStageHistory(
    leadId: string,
    fromStage: FunnelStage | null,
    toStage: FunnelStage,
    changedBy?: string,
    notes?: string
  ): Promise<void> {
    const { error } = await (this.supabase as any).from('admission_lead_stage_history')
      .insert({
        lead_id: leadId,
        from_stage: fromStage,
        to_stage: toStage,
        changed_by: changedBy || null,
        notes: notes || null,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('[LeadService] Error logging stage history:', error);
      // Don't throw - history logging shouldn't break main operation
    }
  }

  // ============================================================================
  // PRIORITY & FLAGS
  // ============================================================================

  /**
   * Update lead priority (hot/warm/cold) - maps to is_hot_lead/is_priority booleans
   */
  static async updatePriority(leadId: string, priority: LeadPriority): Promise<AdmissionLead> {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    if (priority === 'hot') {
      updateData.is_hot_lead = true;
      updateData.is_priority = true;
    } else if (priority === 'warm') {
      updateData.is_hot_lead = false;
      updateData.is_priority = true;
    } else {
      updateData.is_hot_lead = false;
      updateData.is_priority = false;
    }

    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update(updateData)
      .eq('id', leadId)
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `)
      .single();

    if (error) {
      console.error('[LeadService] Error updating priority:', error);
      throw new Error(`Failed to update priority: ${error.message}`);
    }

    return this.normalizeLead(data);
  }

  /**
   * Toggle hot lead status
   */
  static async toggleHotLead(leadId: string, isHot: boolean): Promise<AdmissionLead> {
    return this.updatePriority(leadId, isHot ? 'hot' : 'warm');
  }

  // ============================================================================
  // TAGS
  // ============================================================================

  /**
   * Add a tag to a lead
   */
  static async addTag(leadId: string, tag: string): Promise<AdmissionLead> {
    const { data: current } = await (this.supabase as any).from('admission_leads')
      .select('tags')
      .eq('id', leadId)
      .single();

    const currentTags = current?.tags || [];
    if (currentTags.includes(tag)) {
      // Tag already exists, return current lead
      return this.getLead(leadId);
    }

    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update({
        tags: [...currentTags, tag],
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `)
      .single();

    if (error) {
      console.error('[LeadService] Error adding tag:', error);
      throw new Error(`Failed to add tag: ${error.message}`);
    }

    return this.normalizeLead(data);
  }

  /**
   * Remove a tag from a lead
   */
  static async removeTag(leadId: string, tag: string): Promise<AdmissionLead> {
    const { data: current } = await (this.supabase as any).from('admission_leads')
      .select('tags')
      .eq('id', leadId)
      .single();

    const currentTags = current?.tags || [];
    const newTags = currentTags.filter((t: string) => t !== tag);

    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update({
        tags: newTags,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `)
      .single();

    if (error) {
      console.error('[LeadService] Error removing tag:', error);
      throw new Error(`Failed to remove tag: ${error.message}`);
    }

    return this.normalizeLead(data);
  }

  // ============================================================================
  // COUNSELOR ASSIGNMENT
  // ============================================================================

  /**
   * Assign counselor to lead
   */
  static async assignCounselor(leadId: string, counselorId: string): Promise<AdmissionLead> {
    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update({
        counselor_id: counselorId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `)
      .single();

    if (error) {
      console.error('[LeadService] Error assigning counselor:', error);
      throw new Error(`Failed to assign counselor: ${error.message}`);
    }

    return this.normalizeLead(data);
  }

  // ============================================================================
  // FOLLOWUP
  // ============================================================================

  /**
   * Schedule next followup
   */
  static async scheduleFollowup(leadId: string, followupDate: string): Promise<AdmissionLead> {
    // Note: next_followup_at column doesn't exist yet. Update last_contact_at as closest equivalent.
    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update({
        last_contact_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `)
      .single();

    if (error) {
      console.error('[LeadService] Error scheduling followup:', error);
      throw new Error(`Failed to schedule followup: ${error.message}`);
    }

    return this.normalizeLead(data);
  }

  // ============================================================================
  // TIMELINE & HISTORY
  // ============================================================================

  /**
   * Get lead timeline (stage history + activities)
   */
  static async getTimeline(leadId: string): Promise<any[]> {
    const { data, error } = await (this.supabase as any).from('admission_lead_stage_history')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[LeadService] Error fetching timeline:', error);
      throw new Error(`Failed to fetch timeline: ${error.message}`);
    }

    return data || [];
  }

  // ============================================================================
  // DASHBOARD & ANALYTICS
  // ============================================================================

  /**
   * Get funnel summary for dashboard
   */
  static async getFunnelSummary(institutionId: string): Promise<any> {
    const { data, error } = await (this.supabase as any).from('admission_leads')
      .select('funnel_stage, is_hot_lead, is_priority')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[LeadService] Error fetching funnel summary:', error);
      throw new Error(`Failed to fetch funnel summary: ${error.message}`);
    }

    const leads = data || [];

    // Count by stage
    const byStage: Record<FunnelStage, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      application_started: 0,
      application_submitted: 0,
      documents_pending: 0,
      documents_verified: 0,
      interview_scheduled: 0,
      interview_completed: 0,
      offer_sent: 0,
      offer_accepted: 0,
      token_paid: 0,
      enrolled: 0,
      lost: 0
    };

    let hotLeads = 0;
    let priorityLeads = 0;

    leads.forEach((lead: any) => {
      if (byStage[lead.funnel_stage as FunnelStage] !== undefined) {
        byStage[lead.funnel_stage as FunnelStage]++;
      }
      if (lead.is_hot_lead) {
        hotLeads++;
        priorityLeads++;
      } else if (lead.is_priority) {
        priorityLeads++;
      }
    });

    // Build stages array for funnel visualization
    const stages = Object.entries(byStage).map(([stage, count]) => ({
      stage,
      count,
      percentage: leads.length > 0 ? (count / leads.length) * 100 : 0
    }));

    return {
      total: leads.length,
      byStage,
      hotLeads,
      priorityLeads,
      stages
    };
  }

  /**
   * Get dashboard summary stats
   */
  static async getDashboardSummary(institutionId: string): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all leads - use actual DB columns (no next_followup_at column exists)
    const { data: leads, error } = await (this.supabase as any).from('admission_leads')
      .select('funnel_stage, created_at, is_hot_lead, is_priority, last_contact_at')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[LeadService] Error fetching dashboard summary:', error);
      throw new Error(`Failed to fetch dashboard summary: ${error.message}`);
    }

    const allLeads = leads || [];

    const totalLeads = allLeads.length;
    const newLeads = allLeads.filter((l: any) =>
      new Date(l.created_at) >= today
    ).length;
    const convertedLeads = allLeads.filter((l: any) =>
      l.funnel_stage === 'enrolled'
    ).length;
    // Count leads not contacted recently as pending followups
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const pendingFollowups = allLeads.filter((l: any) =>
      l.last_contact_at && new Date(l.last_contact_at) < oneWeekAgo &&
      l.funnel_stage !== 'enrolled' && l.funnel_stage !== 'lost'
    ).length;
    const todayFollowups = 0; // No followup scheduling column exists yet

    const conversionRate = totalLeads > 0
      ? (convertedLeads / totalLeads) * 100
      : 0;

    return {
      totalLeads,
      newLeads,
      convertedLeads,
      pendingFollowups,
      todayFollowups,
      conversionRate: Math.round(conversionRate * 10) / 10
    };
  }
}
