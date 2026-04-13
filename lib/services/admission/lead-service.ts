// lib/services/admission/lead-service.ts
// Admission CRM Lead Service - Supabase interactions

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type {
  AdmissionLead,
  CreateLeadInput,
  UpdateLeadInput,
  LeadFilters,
  LeadListResponse,
  FunnelStage,
  LeadPriority
} from '@/types/admission';

import { AssignmentRulesService, type LeadDataForAssignment } from './assignment-rules-service';
import { WAEventDispatcher } from '@/lib/services/whatsapp/wa-event-dispatcher';

// ────────────────────────────────────────────────────────────────────────────
// Allowed stage transitions — defines the valid moves for each funnel stage.
// 'lost' and 'dormant' are always allowed as exits from any active stage.
// Terminated stages (declined, withdrew, expired, lost, dormant) allow
// re-engagement back to 'new' or 'contacted'.
// ────────────────────────────────────────────────────────────────────────────
export const ALLOWED_STAGE_TRANSITIONS: Record<FunnelStage, FunnelStage[]> = {
  new:                    ['contacted', 'not_reachable', 'lost', 'dormant'],
  contacted:              ['interested', 'not_reachable', 'follow_up_scheduled', 'lost', 'dormant'],
  not_reachable:          ['contacted', 'follow_up_scheduled', 'lost', 'dormant'],
  interested:             ['engaged', 'qualified', 'follow_up_scheduled', 'not_reachable', 'lost', 'dormant'],
  follow_up_scheduled:    ['contacted', 'not_reachable', 'interested', 'lost', 'dormant'],
  engaged:                ['qualified', 'interested', 'follow_up_scheduled', 'lost', 'dormant'],
  qualified:              ['application_started', 'applied', 'follow_up_scheduled', 'lost', 'dormant'],
  application_started:    ['application_submitted', 'documents_pending', 'lost', 'dormant'],
  application_submitted:  ['documents_pending', 'documents_verified', 'lost', 'dormant'],
  documents_pending:      ['documents_verified', 'application_submitted', 'lost', 'dormant'],
  documents_verified:     ['interview_scheduled', 'offer_sent', 'documents_pending', 'lost', 'dormant'],
  interview_scheduled:    ['interview_completed', 'documents_pending', 'lost', 'dormant'],
  interview_completed:    ['offer_sent', 'interviewed', 'lost', 'dormant'],
  offer_sent:             ['offer_accepted', 'declined', 'lost', 'dormant'],
  offer_accepted:         ['token_paid', 'confirmed', 'offer_sent', 'declined', 'lost', 'dormant'],
  token_paid:             ['confirmed', 'enrolled', 'lost', 'dormant'],
  applied:                ['interviewed', 'documents_pending', 'lost', 'dormant'],
  interviewed:            ['offered', 'declined', 'lost', 'dormant'],
  offered:                ['confirmed', 'declined', 'withdrew', 'lost', 'dormant'],
  confirmed:              ['enrolled', 'withdrew', 'lost', 'dormant'],
  enrolled:               ['lost', 'dormant'],
  declined:               ['new', 'lost', 'dormant'],
  withdrew:               ['new', 'lost', 'dormant'],
  expired:                ['new', 'lost', 'dormant'],
  lost:                   ['new', 'contacted', 'dormant'],
  dormant:                ['new', 'contacted', 'lost'],
};

export class LeadService {
  private static supabase = createClientSupabaseClient();

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
    if (!row) throw new Error('Cannot normalize null/undefined lead row');

    // Create a shallow copy to avoid mutating the original DB/cache object
    const lead = { ...row };

    // Compute priority from boolean flags if not a valid priority value
    const validPriorities = ['hot', 'warm', 'cold'];
    if (!lead.priority || !validPriorities.includes(lead.priority)) {
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
    // Route through server-side API to bypass RLS overhead.
    // The admission_leads RLS policies cascade 3 levels deep
    // (admission_leads → user_roles → profiles) and exceed the
    // 8-second authenticated role statement_timeout.
    const params = new URLSearchParams();

    if (filters.institution_id) params.set('institution_id', filters.institution_id);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.search) params.set('search', filters.search);
    if (filters.sort_by) params.set('sort_by', filters.sort_by);
    if (filters.sort_order) params.set('sort_order', filters.sort_order);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    if (filters.expo_event_id) params.set('expo_event_id', filters.expo_event_id);
    if (filters.captured_by) params.set('captured_by', filters.captured_by);
    if (filters.counselor_id) params.set('counselor_id', filters.counselor_id);

    // Funnel stage: support single value (array handled by caller)
    if (filters.funnel_stage) {
      const stage = Array.isArray(filters.funnel_stage) ? filters.funnel_stage[0] : filters.funnel_stage;
      if (stage) params.set('funnel_stage', stage);
    }
    // Priority: support single value
    if (filters.priority) {
      const prio = Array.isArray(filters.priority) ? filters.priority[0] : filters.priority;
      if (prio) params.set('priority', prio);
    }
    // Source: support single value
    if (filters.source) {
      const src = Array.isArray(filters.source) ? filters.source[0] : filters.source;
      if (src) params.set('source', src);
    }

    const res = await fetch(`/api/admission/leads/list?${params.toString()}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[LeadService] Error fetching leads:', body);
      throw new Error(body.error || `Failed to fetch leads (HTTP ${res.status})`);
    }

    const result = await res.json();

    return {
      data: (result.data || []).map((row: any) => this.normalizeLead(row)),
      metadata: {
        total: result.metadata?.total || 0,
        page: result.metadata?.page || (filters.page || 1),
        limit: result.metadata?.limit || (filters.limit || 10),
        totalPages: result.metadata?.totalPages || 0
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
   *
   * @param supabaseOverride - Optional Supabase client to use instead of the
   *   shared static client. Pass a service-role client from server-side routes
   *   (e.g. the inbound webhook) to bypass RLS without mutating shared state.
   *   Each call receives its own scope — safe for concurrent serverless requests.
   */
  static async createLead(leadData: CreateLeadInput, user?: User, supabaseOverride?: any): Promise<AdmissionLead> {
    // Use the injected client when provided; fall back to the shared static client.
    const db = (supabaseOverride ?? LeadService.supabase) as any;

    // SECURITY: Validate required fields
    if (!leadData.institution_id) {
      throw new Error('Institution ID is required');
    }
    if (!leadData.first_name?.trim()) {
      throw new Error('First name is required');
    }
    if (!leadData.phone?.trim()) {
      throw new Error('Phone number is required');
    }
    // Validate Indian mobile number format (10 digits, first digit 6–9, optional +91/0 prefix)
    const cleanPhone = leadData.phone.trim().replace(/[\s\-()]/g, '');
    const phoneRegex = /^(\+91|0)?[6-9]\d{9}$/;
    if (!phoneRegex.test(cleanPhone)) {
      throw new Error('Invalid phone number. Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
    }
    // Validate optional phone fields if provided
    const cleanAlt = leadData.alternate_phone
      ? leadData.alternate_phone.trim().replace(/[\s\-()]/g, '')
      : undefined;
    if (cleanAlt && !phoneRegex.test(cleanAlt)) {
      throw new Error('Invalid alternate phone number. Must be a valid 10-digit Indian mobile number.');
    }
    const cleanParent = leadData.parent_phone
      ? leadData.parent_phone.trim().replace(/[\s\-()]/g, '')
      : undefined;
    if (cleanParent && !phoneRegex.test(cleanParent)) {
      throw new Error('Invalid parent phone number. Must be a valid 10-digit Indian mobile number.');
    }
    if (!leadData.source) {
      throw new Error('Lead source is required');
    }

    // Get current user for created_by (skip auth call when user is passed in directly)
    if (!user) {
      const { data: { user: authUser } } = await db.auth.getUser();
      user = authUser ?? undefined;
    }

    // Only include columns that exist in admission_leads table
    const insertData: any = {
      institution_id: leadData.institution_id,
      first_name: leadData.first_name?.trim() ?? '',
      last_name: leadData.last_name?.trim() || null,
      email: leadData.email || null,
      phone: cleanPhone,
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
    if (cleanParent) insertData.parent_phone = cleanParent;
    if (leadData.parent_email) insertData.parent_email = leadData.parent_email;
    if (leadData.entry_date) insertData.entry_date = leadData.entry_date;
    if (leadData.notes) insertData.notes = leadData.notes;
    // Address fields
    if (cleanAlt) insertData.alternate_phone = cleanAlt;
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
    // Expo Bridge — link lead to exhibition event and team member who captured it
    if (leadData.expo_event_id) insertData.expo_event_id = leadData.expo_event_id;
    if (leadData.captured_by) insertData.captured_by = leadData.captured_by;
    // WhatsApp consent — set during lead capture (expo form or bulk upload)
    if (leadData.wa_opt_in != null) {
      insertData.wa_opt_in = leadData.wa_opt_in;
      if (leadData.wa_opt_in) {
        insertData.wa_opt_in_at = new Date().toISOString();
        insertData.wa_opt_in_source = leadData.wa_opt_in_source || 'lead_creation';
      }
    }

    // Check for duplicate: same phone in same institution (re-engagement exception: lost/dormant allowed)
    const { data: existing, error: dupError } = await db
      .from('admission_leads')
      .select('id, full_name, funnel_stage')
      .eq('institution_id', leadData.institution_id)
      .eq('phone', cleanPhone)
      .not('funnel_stage', 'in', '(lost,dormant)')
      .limit(1);

    if (dupError) {
      console.warn('[admission/leads] Duplicate check query failed (proceeding with insert):', dupError);
    }

    if (!dupError && existing && existing.length > 0) {
      console.warn('[admission/leads] Duplicate lead rejected:', {
        phone: cleanPhone,
        existingId: existing[0].id,
        existingStage: existing[0].funnel_stage,
      });
      throw new Error(
        'Duplicate lead: A lead with this phone number already exists for this institution. ' +
        'Update the existing lead or mark it as lost before creating a new one.'
      );
    }

    const { data, error } = await db.from('admission_leads')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      console.error('[LeadService] Error creating lead:', error);
      throw new Error(`Failed to create lead: ${error.message}`);
    }

    // Log stage history
    await this.logStageHistory(data.id, null, 'new', user?.id, undefined, db);

    // Expo Bridge — increment total_leads_collected on the linked expo event (best-effort)
    if (data.expo_event_id) {
      try {
        const { data: expoEvent } = await db
          .from('expo_events')
          .select('total_leads_collected')
          .eq('id', data.expo_event_id)
          .single();
        await db
          .from('expo_events')
          .update({ total_leads_collected: (expoEvent?.total_leads_collected ?? 0) + 1 })
          .eq('id', data.expo_event_id);
      } catch (expoErr) {
        console.warn('[LeadService] Failed to increment expo lead count:', expoErr);
      }

      // Auto-schedule follow-up for next business day 10:00 AM IST (best-effort)
      try {
        const now = new Date();
        const followup = new Date(now);
        // Next day
        followup.setDate(followup.getDate() + 1);
        // Skip weekends (Saturday → Monday, Sunday → Monday)
        const dayOfWeek = followup.getDay();
        if (dayOfWeek === 0) followup.setDate(followup.getDate() + 1); // Sunday → Monday
        if (dayOfWeek === 6) followup.setDate(followup.getDate() + 2); // Saturday → Monday
        // Set to 10:00 AM IST (04:30 UTC)
        followup.setUTCHours(4, 30, 0, 0);

        await db.from('admission_leads')
          .update({ next_followup_at: followup.toISOString() })
          .eq('id', data.id);
        data.next_followup_at = followup.toISOString();
      } catch (followupErr) {
        console.warn('[LeadService] Failed to schedule expo follow-up:', followupErr);
      }

      // Log expo capture activity (best-effort)
      try {
        const { data: expoDetail } = await db
          .from('expo_events')
          .select('event_name, city')
          .eq('id', data.expo_event_id)
          .single();

        const eventLabel = expoDetail?.event_name || 'Exhibition';
        const cityLabel = expoDetail?.city ? ` in ${expoDetail.city}` : '';

        await db.from('admission_lead_activities').insert({
          lead_id: data.id,
          activity_type: 'note',
          subject: 'Captured at Exhibition',
          description: `Captured at ${eventLabel}${cityLabel}${data.captured_by ? ' by a team member' : ''}. Source: education_fair.`,
          created_by: user?.id || null,
        });
      } catch (activityErr) {
        console.warn('[LeadService] Failed to log expo capture activity:', activityErr);
      }
    }

    // Auto-assign via rules — best-effort, never blocks lead creation
    try {
      const assignInput: LeadDataForAssignment = {
        institution_id: data.institution_id,
        source: data.source,
        interested_programs: data.interested_programs ?? [],
        city: data.city ?? undefined,
        state: data.state ?? undefined,
        score: data.score ?? 0,
      };
      const counselorId = !data.counselor_id
        ? await AssignmentRulesService.executeRulesForLead(assignInput)
        : null;
      if (counselorId) {
        await db
          .from('admission_leads')
          .update({ counselor_id: counselorId, assigned_at: new Date().toISOString() })
          .eq('id', data.id);
        const { error: rpcError } = await db.rpc('admission_increment_counselor_leads', { p_counselor_id: counselorId });
        if (rpcError) {
          console.warn('[LeadService] Failed to increment counselor lead count:', { counselorId, error: rpcError });
        }
        data.counselor_id = counselorId;
        data.assigned_at = new Date().toISOString();

        // Notify the auto-assigned counselor (best-effort)
        try {
          const { data: counselorProfile } = await db
            .from('admission_counselors')
            .select('user_id')
            .eq('id', counselorId)
            .maybeSingle();

          if (counselorProfile?.user_id) {
            await db
              .from('notifications')
              .insert({
                user_id: counselorProfile.user_id,
                type: 'info',
                category: 'admission',
                priority: 'normal',
                title: 'New Lead Assigned to You',
                message: `Lead "${data.full_name ?? 'Unknown'}" has been assigned to you. Tap to view and follow up.`,
                metadata: {
                  event_type: 'lead_assigned',
                  lead_id: data.id,
                },
                action_url: `/admission/leads/${data.id}`,
                action_label: 'View Lead',
                channels: ['PUSH', 'IN_APP'],
              });
          }
        } catch (notifErr) {
          console.warn('[LeadService] Could not notify auto-assigned counselor:', notifErr);
        }
      }
    } catch (assignErr) {
      console.warn('[LeadService] Auto-assignment skipped (lead created successfully):', assignErr);
    }

    // Non-blocking: dispatch WhatsApp auto-trigger for lead_created
    WAEventDispatcher.dispatch({
      eventType: 'lead_created',
      institutionId: data.institution_id,
      leadId: data.id,
      leadPhone: data.phone || '',
      leadName: data.full_name || data.first_name || undefined,
    }).catch(() => {}); // Never block lead creation

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

    // Sanitize: strip fields that clients must never override
    const { id: _stripId, institution_id: _stripInst, created_at: _stripCreated, ...safeData } = leadData as any;

    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update({
        ...safeData,
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
    const { data: { user } } = await (this.supabase as any).auth.getUser();

    // Get current stage for history logging
    const { data: current } = await (this.supabase as any).from('admission_leads')
      .select('funnel_stage')
      .eq('id', id)
      .single();

    const oldStage = current?.funnel_stage;

    const { error } = await (this.supabase as any).from('admission_leads')
      .update({
        funnel_stage: 'lost' as FunnelStage,
        is_lost: true,
        lost_at: new Date().toISOString(),
        is_active: false,
        stage_changed_at: new Date().toISOString(),
        previous_stage: oldStage || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[LeadService] Error deleting lead:', error);
      throw new Error(`Failed to delete lead: ${error.message}`);
    }

    // Log stage history
    if (oldStage && oldStage !== 'lost') {
      await this.logStageHistory(id, oldStage, 'lost', user?.id);
    }
  }

  /**
   * Permanently delete a lead (hard delete from database)
   */
  static async permanentDeleteLead(id: string): Promise<void> {
    // Delete related records first (stage history, activities, scores, call logs)
    await Promise.allSettled([
      (this.supabase as any).from('admission_lead_stage_history').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_lead_activities').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_lead_scores').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_call_logs').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_tasks').delete().eq('lead_id', id),
    ]);

    const { error } = await (this.supabase as any)
      .from('admission_leads')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[LeadService] Error permanently deleting lead:', error);
      throw new Error(`Failed to delete lead: ${error.message}`);
    }
  }

  // ============================================================================
  // STAGE MANAGEMENT
  // ============================================================================

  /**
   * Update lead funnel stage
   */
  static async updateStage(leadId: string, newStage: FunnelStage, notes?: string, force = false): Promise<AdmissionLead> {
    const { data: current } = await (this.supabase as any).from('admission_leads')
      .select('funnel_stage')
      .eq('id', leadId)
      .single();

    // Validate transition (skip if force=true — for super-admin overrides)
    // currentStage is undefined for legacy rows with no funnel_stage — skip validation
    const currentStage = current?.funnel_stage as FunnelStage | undefined;
    if (!force && currentStage && currentStage !== newStage) {
      const allowed = ALLOWED_STAGE_TRANSITIONS[currentStage] ?? [];
      if (!allowed.includes(newStage)) {
        throw new Error(
          `Invalid stage transition: "${currentStage}" -> "${newStage}" is not allowed. ` +
          `Allowed next stages: ${allowed.join(', ')}.`
        );
      }
    }

    const { data: { user } } = await (this.supabase as any).auth.getUser();

    const updateData: any = {
      funnel_stage: newStage,
      stage_changed_at: new Date().toISOString(),
      previous_stage: current?.funnel_stage || null,
      updated_at: new Date().toISOString()
    };

    // Set last_contact_at when moving to 'contacted' stage from any stage
    if (newStage === 'contacted') {
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

    // Non-blocking: dispatch WhatsApp auto-trigger for stage_changed
    const previousStage = current?.funnel_stage || '';
    WAEventDispatcher.dispatch({
      eventType: 'stage_changed',
      institutionId: data.institution_id,
      leadId: data.id,
      leadPhone: data.phone || '',
      leadName: data.full_name || undefined,
      metadata: { new_stage: newStage, old_stage: previousStage },
    }).catch(() => {});

    // Dispatch specific event for key application/enrollment stages
    const stageEvents: string[] = [
      'application_started', 'application_submitted', 'documents_pending',
      'documents_verified', 'interview_scheduled', 'offer_sent', 'offer_accepted', 'enrolled',
    ];
    if (stageEvents.includes(newStage)) {
      WAEventDispatcher.dispatch({
        eventType: newStage as any,
        institutionId: data.institution_id,
        leadId: data.id,
        leadPhone: data.phone || '',
        leadName: data.full_name || undefined,
      }).catch(() => {});
    }

    return this.normalizeLead(data);
  }

  /**
   * Log stage change history
   *
   * @param dbOverride - Optional Supabase client override; used when called
   *   from within `createLead()` so the same injected client is propagated.
   */
  private static async logStageHistory(
    leadId: string,
    fromStage: FunnelStage | null,
    toStage: FunnelStage,
    changedBy?: string,
    notes?: string,
    dbOverride?: any
  ): Promise<void> {
    const db = (dbOverride ?? LeadService.supabase) as any;
    const { error } = await db.from('admission_lead_stage_history')
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
   * Toggle hot lead status — only touches is_hot_lead, never is_priority
   */
  static async toggleHotLead(leadId: string, isHot: boolean): Promise<AdmissionLead> {
    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update({
        is_hot_lead: isHot,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select(`
        *,
        counselor:admission_counselors(id, name, email)
      `)
      .single();

    if (error) {
      console.error('[LeadService] Error toggling hot lead:', error);
      throw new Error(`Failed to toggle hot lead: ${error.message}`);
    }

    return this.normalizeLead(data);
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
  static async assignCounselor(leadId: string, counselorId: string, profileId?: string): Promise<AdmissionLead> {
    const { data: { user } } = await (this.supabase as any).auth.getUser();

    // Read current counselor_id to detect reassignment
    const { data: currentLead } = await (this.supabase as any)
      .from('admission_leads')
      .select('counselor_id')
      .eq('id', leadId)
      .maybeSingle();
    const isNewAssignment = !currentLead?.counselor_id || currentLead.counselor_id !== counselorId;

    const { data, error } = await (this.supabase as any).from('admission_leads')
      .update({
        counselor_id: counselorId,
        // assigned_counselor_id references profiles(id) — use profileId when provided
        ...(profileId ? { assigned_counselor_id: profileId } : {}),
        assigned_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
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

    // Log activity — best-effort, does not block the assignment
    const counselorName = (data as any).counselor?.name || 'Unknown';
    const { error: activityError } = await (this.supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        activity_type: 'note',
        subject: 'Counselor Assigned',
        description: `Counselor "${counselorName}" assigned to this lead`,
        created_by: user?.id || null,
      });

    if (activityError) {
      console.warn('[LeadService] Could not log counselor assignment activity:', activityError);
    }

    // Only notify for new assignments, not reassignments to the same counselor
    if (isNewAssignment) {
      // Notify the assigned counselor via the notifications table (best-effort)
      try {
        const { data: counselorProfile } = await (this.supabase as any)
          .from('admission_counselors')
          .select('user_id, name')
          .eq('id', counselorId)
          .maybeSingle();

        if (counselorProfile?.user_id) {
          await (this.supabase as any)
            .from('notifications')
            .insert({
              user_id: counselorProfile.user_id,
              type: 'info',
              category: 'admission',
              priority: 'normal',
              title: 'New Lead Assigned to You',
              message: `Lead "${(data as any).full_name ?? 'Unknown'}" has been assigned to you. Tap to view and follow up.`,
              metadata: {
                event_type: 'lead_assigned',
                lead_id: leadId,
              },
              action_url: `/admission/leads/${leadId}`,
              action_label: 'View Lead',
              channels: ['PUSH', 'IN_APP'],
            });
        }
      } catch (notifErr) {
        console.warn('[LeadService] Could not send counselor assignment notification:', notifErr);
      }
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

    // 1. Create a follow-up activity record
    const { error: activityError } = await (this.supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        activity_type: 'task',
        subject: 'Follow-up Scheduled',
        description: notes || `Follow-up scheduled for ${new Date(followupDate).toLocaleDateString()}`,
        scheduled_at: followupDate,
        created_by: user?.id || null,
      });

    if (activityError) {
      console.error('[LeadService] Error creating follow-up activity:', activityError);
      // Don't throw - still try to update the lead
    }

    // 2. Update the lead's next_followup_at and contact timestamp
    const updatePayload: any = {
      next_followup_at: followupDate,
      last_contact_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
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
   * Get funnel summary for dashboard.
   * When institutionId is omitted, returns aggregate across all institutions
   * the authenticated user can access (controlled by RLS).
   */
  static async getFunnelSummary(institutionId?: string): Promise<any> {
    let query = (this.supabase as any).from('admission_leads')
      .select('stage, funnel_stage, is_hot_lead, is_priority');
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    const { data, error } = await query;

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
      confirmed: 0,
      declined: 0,
      withdrew: 0,
      expired: 0,
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
   * Get dashboard summary stats.
   * When institutionId is omitted, returns aggregate across all institutions
   * the authenticated user can access (controlled by RLS).
   */
  static async getDashboardSummary(institutionId?: string): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all leads - select both stage (enum) and funnel_stage (legacy)
    let leadsQuery = (this.supabase as any).from('admission_leads')
      .select('stage, funnel_stage, created_at, is_hot_lead, is_priority, last_contact_at, next_followup_at');
    if (institutionId) {
      leadsQuery = leadsQuery.eq('institution_id', institutionId);
    }
    const { data: leads, error } = await leadsQuery;

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
