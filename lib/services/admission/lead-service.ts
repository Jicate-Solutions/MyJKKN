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
    // Escape special chars: %, _, \ (SQL LIKE), and commas (PostgREST .or() separator)
    return input.replace(/[%_\\,]/g, '\\$&');
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
   * Also normalizes `last_contact_at` from possible `last_contacted_at` or `last_activity_at`.
   */
  private static normalizeLead(row: any): AdmissionLead {
    if (!row) return row;

    // Create a shallow copy to avoid mutating the original DB/cache object
    const lead = { ...row };

    // Compute priority from boolean flags if not already set as an enum
    if (!lead.priority || typeof lead.priority !== 'string') {
      if (lead.is_hot_lead) {
        lead.priority = 'hot';
      } else if (lead.is_priority) {
        lead.priority = 'warm';
      } else {
        lead.priority = 'cold';
      }
    }

    // Normalize last_contact_at from either column name variant
    if (!lead.last_contact_at && lead.last_contacted_at) {
      lead.last_contact_at = lead.last_contacted_at;
    }
    if (!lead.last_contact_at && lead.last_activity_at) {
      lead.last_contact_at = lead.last_activity_at;
    }

    return lead as AdmissionLead;
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
      // Filter by stage (enum column) with fallback to funnel_stage (legacy)
      if (Array.isArray(filters.funnel_stage)) {
        query = query.or(`stage.in.(${filters.funnel_stage.join(',')}),funnel_stage.in.(${filters.funnel_stage.join(',')})`);
      } else {
        query = query.or(`stage.eq.${filters.funnel_stage},funnel_stage.eq.${filters.funnel_stage}`);
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
    // FIX: LeadFilters.program_interest renamed to interested_programs to match DB
    if (filters.interested_programs) {
      query = query.contains('interested_programs', [filters.interested_programs]);
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
    if (leadData.preferred_channel) insertData.preferred_channel = leadData.preferred_channel;
    if (leadData.interested_programs && leadData.interested_programs.length > 0) {
      insertData.interested_programs = leadData.interested_programs;
    }
    if (leadData.parent_name) insertData.parent_name = leadData.parent_name;
    if (leadData.parent_phone) insertData.parent_phone = leadData.parent_phone;
    if (leadData.parent_email) insertData.parent_email = leadData.parent_email;
    if (leadData.entry_date) insertData.entry_date = leadData.entry_date;
    if (leadData.notes) insertData.notes = leadData.notes;
    // Address fields
    if (leadData.alternate_phone) insertData.alternate_phone = leadData.alternate_phone;
    if (leadData.date_of_birth) insertData.date_of_birth = leadData.date_of_birth;
    if (leadData.gender) insertData.gender = leadData.gender;
    if (leadData.address_line1) insertData.address_line1 = leadData.address_line1;
    if (leadData.state) insertData.state = leadData.state;
    if (leadData.district) insertData.district = leadData.district;
    if (leadData.city) insertData.city = leadData.city;
    if (leadData.pincode) insertData.pincode = leadData.pincode;
    // JKKN Tier-1 fields
    if (leadData.student_interest_level) insertData.student_interest_level = leadData.student_interest_level;
    if (leadData.parent_decision_status) insertData.parent_decision_status = leadData.parent_decision_status;
    if (leadData.academic_year) insertData.academic_year = leadData.academic_year;

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
      .select('funnel_stage, is_hot_lead, is_priority, counselor_id')
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
      stage_changed_at: new Date().toISOString(),
      previous_stage: current?.funnel_stage || null,
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
    return this.updatePriority(leadId, isHot ? 'hot' : 'cold');
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
        assigned_counselor_id: counselorId,
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
   * Schedule next followup.
   * Creates a 'task' activity with scheduled_at and updates lead contact timestamp.
   * The actual DB may or may not have next_followup_at - we rely on the activity record.
   */
  static async scheduleFollowup(leadId: string, followupDate: string, notes?: string): Promise<AdmissionLead> {
    const { data: { user } } = await (this.supabase as any).auth.getUser();

    // 1. Create a follow-up activity record (use actual DB columns: title, performed_by)
    const { error: activityError } = await (this.supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        activity_type: 'task',
        title: 'Follow-up Scheduled',
        description: notes || `Follow-up scheduled for ${new Date(followupDate).toLocaleDateString()}`,
        metadata: { scheduled_at: followupDate },
        performed_by: user?.id || null,
      });

    if (activityError) {
      console.error('[LeadService] Error creating follow-up activity:', activityError);
      // Don't throw - still try to update the lead
    }

    // 2. Update the lead's next_followup_at and contact timestamp
    const updatePayload: any = {
      next_followup_at: followupDate,
      last_contact_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update(updatePayload)
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
      .select('stage, funnel_stage, is_hot_lead, is_priority')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[LeadService] Error fetching funnel summary:', error);
      throw new Error(`Failed to fetch funnel summary: ${error.message}`);
    }

    const leads = data || [];

    // Count by stage — all 22 stages from admission_lead_stage enum
    const byStage: Record<FunnelStage, number> = {
      new: 0,
      contacted: 0,
      not_reachable: 0,
      interested: 0,
      follow_up_scheduled: 0,
      engaged: 0,
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
      applied: 0,
      interviewed: 0,
      offered: 0,
      enrolled: 0,
      lost: 0,
      dormant: 0
    };

    let hotLeads = 0;
    let priorityLeads = 0;

    leads.forEach((lead: any) => {
      const leadStage = lead.stage || lead.funnel_stage;
      if (leadStage && byStage[leadStage as FunnelStage] !== undefined) {
        byStage[leadStage as FunnelStage]++;
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

    // Get all leads - select both stage (enum) and funnel_stage (legacy)
    const { data: leads, error } = await (this.supabase as any).from('admission_leads')
      .select('stage, funnel_stage, created_at, is_hot_lead, is_priority, last_contact_at, next_followup_at')
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
    const convertedLeads = allLeads.filter((l: any) => {
      const s = l.stage || l.funnel_stage;
      return s === 'enrolled';
    }).length;
    // Count leads with overdue or pending followups
    const pendingFollowups = allLeads.filter((l: any) => {
      const s = l.stage || l.funnel_stage;
      return l.next_followup_at && new Date(l.next_followup_at) <= new Date() &&
        s !== 'enrolled' && s !== 'lost';
    }).length;
    const todayFollowups = allLeads.filter((l: any) => {
      const s = l.stage || l.funnel_stage;
      return l.next_followup_at &&
        new Date(l.next_followup_at).toDateString() === today.toDateString() &&
        s !== 'enrolled' && s !== 'lost';
    }).length;

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
