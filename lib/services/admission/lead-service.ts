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
  LeadPriority,
  LeadSourceCapture,
  CaptureMetaInput,
  CaptureAction,
  CaptureLeadResult,
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
    if (filters.program_id) params.set('program_id', filters.program_id);
    if (filters.stale_min_days && filters.stale_min_days > 0) {
      params.set('stale_min_days', String(filters.stale_min_days));
    }

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

    const url = `/api/admission/leads/list?${params.toString()}`;

    // The leads route can flake on the very first call after a Turbopack
    // recompile (Node undici cold-start `TypeError: fetch failed` on Windows),
    // returning a 503. Retry once before surfacing the error to the user.
    let res = await fetch(url);
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 300));
      res = await fetch(url);
    }

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
        counselor:admission_counselors(id, name, email),
        program:programs!program_id(id, program_name, program_id),
        admission_year:admission_years(id, admission_year_name, program_start_year, program_end_year)
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
   * Create a new lead.
   *
   * Backward-compatible wrapper around `captureLead`. Where the legacy path
   * threw 409 on a duplicate active phone, this wrapper now silently absorbs
   * the duplicate as a new source-capture row on the existing lead. Callers
   * who need to know whether a create or a merge happened should call
   * `captureLead` directly and inspect `result.action`.
   */
  static async createLead(leadData: CreateLeadInput, user?: User, supabaseOverride?: any): Promise<AdmissionLead> {
    const result = await this.captureLead(leadData, undefined, user, supabaseOverride);
    return result.lead;
  }

  /**
   * Atomic capture entry point. Either creates a new lead OR locks an existing
   * matching lead (last-10-digits phone match within institution) and appends
   * a source-capture row to it. Side effects (counselor auto-assign, expo
   * lead-count increment, WhatsApp `lead_created` dispatch) run only on the
   * `created` path so they don't double-fire on re-captures.
   *
   * @param leadData      Standard CreateLeadInput. Validation matches createLead.
   * @param captureMeta   Optional overrides for the capture row itself
   *                      (utm_*, raw_payload, alternate captured_by, ...).
   *                      Defaults to {source: leadData.source, captured_by: user.id}.
   * @param user          Optional pre-resolved auth user (skips db.auth.getUser).
   * @param supabaseOverride  Optional service-role client for server-side routes
   *                      (e.g. inbound webhook). Each call receives its own scope.
   */
  static async captureLead(
    leadData: CreateLeadInput,
    captureMeta?: CaptureMetaInput,
    user?: User,
    supabaseOverride?: any,
  ): Promise<CaptureLeadResult> {
    const db = (supabaseOverride ?? LeadService.supabase) as any;

    // ─── SECURITY: Validate required fields ─────────────────────────
    if (!leadData.institution_id) {
      throw new Error('Institution ID is required');
    }
    if (!leadData.first_name?.trim()) {
      throw new Error('First name is required');
    }
    if (!leadData.phone?.trim()) {
      throw new Error('Phone number is required');
    }
    const cleanPhone = leadData.phone.trim().replace(/[\s\-()]/g, '');
    const phoneRegex = /^(\+91|0)?[6-9]\d{9}$/;
    if (!phoneRegex.test(cleanPhone)) {
      throw new Error('Invalid phone number. Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
    }
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

    if (!user) {
      const { data: { user: authUser } } = await db.auth.getUser();
      user = authUser ?? undefined;
    }

    // ─── Build p_lead JSONB for the RPC ─────────────────────────────
    const p_lead: Record<string, any> = {
      institution_id: leadData.institution_id,
      first_name: leadData.first_name.trim(),
      last_name: leadData.last_name?.trim() || null,
      email: leadData.email || null,
      phone: cleanPhone,
      source: leadData.source,
      funnel_stage: 'new',
      is_hot_lead: false,
      is_priority: false,
      score: 0,
      tags: leadData.tags || [],
      created_by: user?.id || null,
      is_active: true,
    };
    if (leadData.counselor_id) p_lead.counselor_id = leadData.counselor_id;
    if (leadData.preferred_channel) p_lead.preferred_channel = leadData.preferred_channel;
    if (leadData.program_id) p_lead.program_id = leadData.program_id;
    if (leadData.alternative_programs && leadData.alternative_programs.length > 0) {
      p_lead.alternative_programs = leadData.alternative_programs;
    }
    if (leadData.parent_name) p_lead.parent_name = leadData.parent_name;
    if (cleanParent) p_lead.parent_phone = cleanParent;
    if (leadData.parent_email) p_lead.parent_email = leadData.parent_email;
    if (leadData.entry_date) p_lead.entry_date = leadData.entry_date;
    if (leadData.twelfth_group) p_lead.twelfth_group = leadData.twelfth_group;
    if (leadData.notes) p_lead.notes = leadData.notes;
    if (cleanAlt) p_lead.alternate_phone = cleanAlt;
    if (leadData.date_of_birth) p_lead.date_of_birth = leadData.date_of_birth;
    if (leadData.gender) p_lead.gender = leadData.gender;
    if (leadData.address_line1) p_lead.address_line1 = leadData.address_line1;
    if (leadData.state) p_lead.state = leadData.state;
    if (leadData.district) p_lead.district = leadData.district;
    if (leadData.city) p_lead.city = leadData.city;
    if (leadData.pincode) p_lead.pincode = leadData.pincode;
    if (leadData.student_interest_level) p_lead.student_interest_level = leadData.student_interest_level;
    if (leadData.parent_decision_status) p_lead.parent_decision_status = leadData.parent_decision_status;
    if (leadData.admission_year_id) p_lead.admission_year_id = leadData.admission_year_id;
    if (leadData.expo_event_id) p_lead.expo_event_id = leadData.expo_event_id;
    if (leadData.captured_by) p_lead.captured_by = leadData.captured_by;
    if (leadData.stall_id) p_lead.stall_id = leadData.stall_id;
    if (leadData.visit_type) p_lead.visit_type = leadData.visit_type;
    if (leadData.referral_type) p_lead.referral_type = leadData.referral_type;
    if (leadData.referred_by_id) p_lead.referred_by_id = leadData.referred_by_id;
    if (leadData.referred_by_name) p_lead.referred_by_name = leadData.referred_by_name;
    if (leadData.wa_opt_in != null) {
      p_lead.wa_opt_in = leadData.wa_opt_in;
      if (leadData.wa_opt_in) {
        p_lead.wa_opt_in_at = new Date().toISOString();
        p_lead.wa_opt_in_source = leadData.wa_opt_in_source || 'lead_creation';
      }
    }

    // ─── Build p_capture JSONB ──────────────────────────────────────
    const p_capture: Record<string, any> = {
      source: captureMeta?.source ?? leadData.source,
      source_detail: captureMeta?.source_detail ?? null,
      captured_at: captureMeta?.captured_at ?? null,
      captured_by: captureMeta?.captured_by ?? leadData.captured_by ?? user?.id ?? null,
      expo_event_id: captureMeta?.expo_event_id ?? leadData.expo_event_id ?? null,
      stall_id: captureMeta?.stall_id ?? leadData.stall_id ?? null,
      utm_source: captureMeta?.utm_source ?? null,
      utm_medium: captureMeta?.utm_medium ?? null,
      utm_campaign: captureMeta?.utm_campaign ?? null,
      referrer_id: captureMeta?.referrer_id ?? leadData.referred_by_id ?? null,
      raw_payload: captureMeta?.raw_payload ?? {},
    };

    // ─── Atomic RPC: lock existing or create new ────────────────────
    const { data: rpcRes, error: rpcErr } = await db.rpc('capture_admission_lead', {
      p_lead,
      p_capture,
    });
    if (rpcErr) {
      console.error('[LeadService] capture_admission_lead RPC failed:', rpcErr);
      throw new Error(`Failed to capture lead: ${rpcErr.message}`);
    }
    const result = rpcRes as { lead_id: string; capture_id: string; action: CaptureAction; reactivated: boolean };

    // ─── Fetch the resulting lead row for the caller ────────────────
    const { data: leadRow, error: fetchErr } = await db
      .from('admission_leads')
      .select('*')
      .eq('id', result.lead_id)
      .single();
    if (fetchErr) {
      throw new Error(`Failed to fetch captured lead: ${fetchErr.message}`);
    }

    // ─── Side effects (only on 'created'; never on plain 'merged') ──
    if (result.action === 'created') {
      await this.runCreateSideEffects(leadRow, user, db);
    } else {
      // 'merged' — log a soft activity so counselors see the re-touch.
      await this.logRecaptureActivity(leadRow, p_capture, user, db, result.reactivated);
    }

    return {
      lead: this.normalizeLead(leadRow),
      action: result.action,
      reactivated: result.reactivated,
      capture_id: result.capture_id,
    };
  }

  /**
   * Run the side effects that should fire only when a brand-new lead is
   * created: expo lead-count increment, auto-schedule follow-up, expo
   * capture activity, counselor auto-assign + notify, WhatsApp dispatch.
   * All best-effort — none of these failures roll back the lead.
   * Note: stage history for the initial 'new' state is logged inside the
   * capture_admission_lead RPC, so the TS path no longer logs it here.
   */
  private static async runCreateSideEffects(data: any, user: any, db: any): Promise<void> {
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
        followup.setDate(followup.getDate() + 1);
        const dayOfWeek = followup.getDay();
        if (dayOfWeek === 0) followup.setDate(followup.getDate() + 1); // Sunday → Monday
        if (dayOfWeek === 6) followup.setDate(followup.getDate() + 2); // Saturday → Monday
        followup.setUTCHours(4, 30, 0, 0); // 10:00 AM IST

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
    }).catch(() => {});
  }

  /**
   * Best-effort soft activity logging when an existing lead is re-captured
   * from a new source. The RPC has already inserted the source-capture row
   * and (if the lead was lost/dormant) reactivated the funnel stage.
   */
  private static async logRecaptureActivity(
    leadRow: any,
    capture: any,
    user: any,
    db: any,
    reactivated: boolean,
  ): Promise<void> {
    try {
      const sourceLabel = capture.source ?? 'unknown';
      const detailSuffix = capture.source_detail ? ` — ${capture.source_detail}` : '';
      await db.from('admission_lead_activities').insert({
        lead_id: leadRow.id,
        activity_type: 'note',
        subject: reactivated ? 'Lead Re-captured (reactivated)' : 'Lead Re-captured',
        description: `Lead re-captured from ${sourceLabel}${detailSuffix}.${reactivated ? ' Stage reactivated to "new".' : ''}`,
        created_by: user?.id || null,
      });
    } catch (e) {
      console.warn('[LeadService] Could not log re-capture activity:', e);
    }
  }

  /**
   * Fetch the source-capture timeline for a lead, newest first.
   * Used by the "Sources Captured" panel on the lead detail page.
   */
  static async getSourceCaptures(leadId: string): Promise<LeadSourceCapture[]> {
    const { data, error } = await (this.supabase as any)
      .from('admission_lead_source_captures')
      .select('*')
      .eq('lead_id', leadId)
      .order('captured_at', { ascending: false });

    if (error) {
      console.error('[LeadService] Error fetching source captures:', error);
      throw new Error(`Failed to fetch source captures: ${error.message}`);
    }

    return (data || []) as LeadSourceCapture[];
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

    // Sanitize: strip fields that clients must never override.
    // `institution_id` is intentionally NOT stripped — the admission_leads RLS
    // UPDATE policy already enforces `role_has_institution_access(institution_id)`
    // on both the old and new row (with_check falls back to using), so users
    // without cross-institution access cannot move a lead to an institution
    // they can't see. Stripping it here silently discards legitimate edits
    // (e.g., a super-admin reassigning a mis-entered lead to the correct
    // institution) and makes the UI appear to save while the DB doesn't update.
    const { id: _stripId, created_at: _stripCreated, ...safeData } = leadData as any;

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
    // Delete related records first — must clear ALL FK references before deleting the lead.
    // CASCADE FKs (auto-deleted): stage_history, activities, lead_scores, tasks, expo_wa_message_queue, wa_personal_message_queue, wa_consent_log
    // NO ACTION FKs (must delete manually): call_logs, sms_logs, whatsapp_logs, campaign_queue, email_logs, campaign_logs, drip_sequences, consultant_*
    // SET NULL FKs (auto-nullified): wa_form_responses, admission_form_submissions, admission_integration_logs, wa_conversations, activity_alert_history, workflow_executions

    // Batch 1: Delete NO ACTION FK records (these block the lead delete if not removed)
    await Promise.allSettled([
      (this.supabase as any).from('admission_call_logs').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_sms_logs').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_whatsapp_logs').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_email_logs').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_campaign_queue').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_campaign_logs').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_callback_queue').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_drip_sequences').delete().eq('lead_id', id),
      (this.supabase as any).from('consultant_communications').delete().eq('lead_id', id),
      (this.supabase as any).from('consultant_commission_transactions').delete().eq('lead_id', id),
      (this.supabase as any).from('consultant_lead_attributions').delete().eq('lead_id', id),
    ]);

    // Batch 2: Delete CASCADE FK records (these auto-delete but we do it explicitly to be safe)
    await Promise.allSettled([
      (this.supabase as any).from('admission_lead_stage_history').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_lead_activities').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_lead_scores').delete().eq('lead_id', id),
      (this.supabase as any).from('admission_tasks').delete().eq('lead_id', id),
    ]);

    // Now delete the lead itself
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
