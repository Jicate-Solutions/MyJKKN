// lib/services/admission/counselor-daily-view-service.ts
// Optimized service for the Counselor Daily View page
// Uses the get_counselor_daily_view DB function for single-query data fetch

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface CounselorKPIs {
  my_leads_today: number;
  followups_due: number;
  overdue_followups: number;
  hot_leads: number;
  total_active: number;
  enrolled_this_month: number;
  total_this_month: number;
  conversion_rate: number; // computed client-side
}

export interface FollowupLead {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  interested_programs: string[] | null;
  funnel_stage: string;
  is_hot_lead: boolean;
  is_priority: boolean;
  score: number | null;
  next_followup_at: string;
  urgency: 'overdue' | 'today' | 'upcoming';
  counselor_id?: string;
  counselor_name?: string;
  source: string | null;
  student_interest_level: string | null;
  parent_decision_status: string | null;
  academic_year: string | null;
  last_activity: {
    type: string;
    description: string;
    created_at: string;
  } | null;
}

export interface PipelineStage {
  stage: string;
  count: number;
}

export interface TodayActivity {
  activity_type: string;
  subject: string | null;
  description: string | null;
  created_at: string;
  lead_name: string;
  lead_id: string;
}

export interface CounselorDailyViewData {
  counselor_id: string | null;
  is_manager: boolean;
  kpis: CounselorKPIs;
  followups: FollowupLead[];
  pipeline: PipelineStage[];
  today_activities: TodayActivity[];
  unassigned_count: number;
  error?: string;
}

export interface UnassignedLead {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  interested_programs: string[] | null;
  source: string | null;
  score: number | null;
  created_at: string;
  funnel_stage: string;
  student_interest_level: string | null;
  parent_decision_status: string | null;
  academic_year: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Roles that grant manager-level access to all leads in the institution */
const MANAGER_ROLES = new Set([
  'super_admin', 'admin', 'institution_admin', 'manager', 'hod', 'principal', 'dean',
]);

// ============================================================================
// SERVICE
// ============================================================================

export class CounselorDailyViewService {
  /**
   * Verify the current user is authorized to modify a lead.
   * Authorization: user must be the assigned counselor OR have a manager-level role.
   * For manager-only actions (e.g. assignLeads), set requireManager = true.
   */
  private static async verifyLeadAccess(
    supabase: any,
    leadId: string,
    institutionId: string,
    requireManager: boolean = false
  ): Promise<{ userId: string; counselorId: string | null; isManager: boolean }> {
    // 1. Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 2. Get user profile to check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    const isManager = !!(
      profile?.is_super_admin ||
      (profile?.role && MANAGER_ROLES.has(profile.role))
    );

    // 3. If manager-only action, enforce it
    if (requireManager && !isManager) {
      throw new Error('Only managers can perform this action');
    }

    // 4. If already a manager, skip ownership check
    if (isManager) {
      return { userId: user.id, counselorId: null, isManager: true };
    }

    // 5. Non-manager: check if user is the assigned counselor for this lead
    const { data: counselor } = await supabase
      .from('admission_counselors')
      .select('id')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .maybeSingle();

    if (!counselor) {
      throw new Error('You are not an active counselor in this institution');
    }

    const { data: lead } = await supabase
      .from('admission_leads')
      .select('counselor_id')
      .eq('id', leadId)
      .eq('institution_id', institutionId)
      .single();

    if (!lead) {
      throw new Error('Lead not found');
    }

    if (counselor.id !== lead.counselor_id) {
      throw new Error('You can only modify leads assigned to you');
    }

    return { userId: user.id, counselorId: counselor.id, isManager: false };
  }

  /**
   * Get the complete daily view data using the optimized DB function.
   * Single query returns KPIs, followups, pipeline, activities, and unassigned count.
   */
  static async getDailyView(institutionId: string): Promise<CounselorDailyViewData> {
    const supabase = createClientSupabaseClient();
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await (supabase as any)
      .rpc('get_counselor_daily_view', {
        p_user_id: user.id,
        p_institution_id: institutionId,
      });

    if (error) {
      console.error('[CounselorDailyViewService] RPC error:', error);
      throw new Error('Failed to load counselor daily view');
    }

    if (!data || data.error === 'not_a_counselor') {
      return {
        counselor_id: null,
        is_manager: false,
        kpis: {
          my_leads_today: 0,
          followups_due: 0,
          overdue_followups: 0,
          hot_leads: 0,
          total_active: 0,
          enrolled_this_month: 0,
          total_this_month: 0,
          conversion_rate: 0,
        },
        followups: [],
        pipeline: [],
        today_activities: [],
        unassigned_count: 0,
        error: 'not_a_counselor',
      };
    }

    // Compute conversion rate client-side; coerce nulls to 0
    const rawKpis = data.kpis || {};
    const kpis: CounselorKPIs = {
      my_leads_today: rawKpis.my_leads_today ?? 0,
      followups_due: rawKpis.followups_due ?? 0,
      overdue_followups: rawKpis.overdue_followups ?? 0,
      hot_leads: rawKpis.hot_leads ?? 0,
      total_active: rawKpis.total_active ?? 0,
      enrolled_this_month: rawKpis.enrolled_this_month ?? 0,
      total_this_month: rawKpis.total_this_month ?? 0,
      conversion_rate: 0,
    };
    kpis.conversion_rate = kpis.total_this_month > 0
      ? Math.round((kpis.enrolled_this_month / kpis.total_this_month) * 100 * 10) / 10
      : 0;

    return {
      counselor_id: data.counselor_id,
      is_manager: data.is_manager || false,
      kpis,
      followups: data.followups || [],
      pipeline: data.pipeline || [],
      today_activities: data.today_activities || [],
      unassigned_count: data.unassigned_count || 0,
    };
  }

  /**
   * Get unassigned leads for the manager view
   */
  static async getUnassignedLeads(institutionId: string): Promise<UnassignedLead[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('id, full_name, phone, email, interested_programs, source, score, created_at, funnel_stage, student_interest_level, parent_decision_status, academic_year')
      .eq('institution_id', institutionId)
      .is('counselor_id', null)
      .not('funnel_stage', 'in', '(enrolled,confirmed,declined,withdrew,expired,lost,dormant)')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[CounselorDailyViewService] Error fetching unassigned leads:', error);
      throw new Error('Failed to load unassigned leads');
    }

    return data || [];
  }

  /**
   * Assign leads to a counselor (bulk)
   */
  static async assignLeads(leadIds: string[], counselorId: string, institutionId: string): Promise<void> {
    // Guard against empty array — Supabase .in() with [] returns ALL rows
    if (!leadIds || leadIds.length === 0) return;

    const supabase = createClientSupabaseClient();

    // Authorization: only managers can reassign leads
    await CounselorDailyViewService.verifyLeadAccess(
      supabase, leadIds[0], institutionId, true
    );

    const { error } = await (supabase as any)
      .from('admission_leads')
      .update({
        counselor_id: counselorId,
        assigned_counselor_id: counselorId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', leadIds)
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[CounselorDailyViewService] Error assigning leads:', error);
      throw new Error('Failed to assign leads');
    }
  }

  /**
   * Quick reschedule follow-up
   */
  static async rescheduleFollowup(leadId: string, newDate: string, institutionId: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Authorization: assigned counselor or manager
    const { userId } = await CounselorDailyViewService.verifyLeadAccess(
      supabase, leadId, institutionId
    );

    // Log reschedule as activity for audit trail
    const { error: activityError } = await (supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        institution_id: institutionId,
        activity_type: 'task',
        title: 'Follow-up Rescheduled',
        description: `Follow-up rescheduled to ${new Date(newDate).toLocaleDateString()}`,
        metadata: { scheduled_at: newDate },
        performed_by: userId,
      });

    if (activityError) {
      console.error('[CounselorDailyViewService] Error logging reschedule activity:', activityError);
    }

    const { error } = await (supabase as any)
      .from('admission_leads')
      .update({
        next_followup_at: newDate,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[CounselorDailyViewService] Error rescheduling:', error);
      throw new Error('Failed to reschedule follow-up');
    }
  }

  /**
   * Quick add note activity
   */
  static async addQuickNote(leadId: string, note: string, institutionId: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Authorization: assigned counselor or manager
    const { userId } = await CounselorDailyViewService.verifyLeadAccess(
      supabase, leadId, institutionId
    );

    const { error } = await (supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        institution_id: institutionId,
        activity_type: 'note',
        title: 'Quick Note',
        description: note,
        performed_by: userId,
      });

    if (error) {
      console.error('[CounselorDailyViewService] Error adding note:', error);
      throw new Error('Failed to add note');
    }

    // Update last_activity_at on lead
    const { error: updateError } = await (supabase as any)
      .from('admission_leads')
      .update({
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('institution_id', institutionId);

    if (updateError) {
      console.error('[CounselorDailyViewService] Error updating lead timestamp:', updateError);
    }
  }

  /**
   * Quick log call activity
   */
  static async logCall(leadId: string, notes: string | undefined, institutionId: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Authorization: assigned counselor or manager
    const { userId } = await CounselorDailyViewService.verifyLeadAccess(
      supabase, leadId, institutionId
    );

    const { error } = await (supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        institution_id: institutionId,
        activity_type: 'call',
        title: 'Phone Call',
        description: notes || 'Call made from counselor view',
        performed_by: userId,
      });

    if (error) {
      console.error('[CounselorDailyViewService] Error logging call:', error);
      throw new Error('Failed to log call');
    }

    // Update contact timestamps
    const { error: updateError } = await (supabase as any)
      .from('admission_leads')
      .update({
        last_contact_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('institution_id', institutionId);

    if (updateError) {
      console.error('[CounselorDailyViewService] Error updating lead timestamps:', updateError);
    }
  }

  /**
   * Quick advance stage
   */
  // Valid funnel stages for validation
  private static readonly VALID_STAGES = new Set([
    'new', 'contacted', 'not_reachable', 'interested', 'follow_up_scheduled',
    'engaged', 'qualified', 'application_started', 'application_submitted',
    'documents_pending', 'documents_verified', 'interview_scheduled',
    'interview_completed', 'offer_sent', 'offer_accepted', 'token_paid',
    'applied', 'interviewed', 'offered', 'enrolled', 'confirmed',
    'declined', 'withdrew', 'expired', 'lost', 'dormant',
  ]);

  static async advanceStage(leadId: string, newStage: string, institutionId: string): Promise<void> {
    // Validate stage before DB operation
    if (!this.VALID_STAGES.has(newStage)) {
      throw new Error(`Invalid stage: ${newStage}`);
    }
    const supabase = createClientSupabaseClient();
    const now = new Date().toISOString();

    // Authorization: assigned counselor or manager
    const { userId } = await CounselorDailyViewService.verifyLeadAccess(
      supabase, leadId, institutionId
    );

    // Get current stage first
    const { data: lead, error: fetchError } = await (supabase as any)
      .from('admission_leads')
      .select('funnel_stage')
      .eq('id', leadId)
      .eq('institution_id', institutionId)
      .single();

    if (fetchError || !lead) {
      console.error('[CounselorDailyViewService] Lead not found for stage advance:', fetchError);
      throw new Error('Lead not found');
    }

    const oldStage = lead.funnel_stage;

    // Update lead stage
    const updatePayload: Record<string, any> = {
      funnel_stage: newStage,
      stage_changed_at: now,
      previous_stage: oldStage,
      updated_at: now,
    };
    // Set last_contact_at when moving to 'contacted' stage
    if (newStage === 'contacted') {
      updatePayload.last_contact_at = now;
    }
    const { error } = await (supabase as any)
      .from('admission_leads')
      .update(updatePayload)
      .eq('id', leadId)
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[CounselorDailyViewService] Error advancing stage:', error);
      throw new Error('Failed to advance stage');
    }

    // Log stage change in history
    const { error: historyError } = await (supabase as any)
      .from('admission_lead_stage_history')
      .insert({
        lead_id: leadId,
        from_stage: oldStage,
        to_stage: newStage,
        changed_by: userId,
        created_at: now,
      });

    if (historyError) {
      console.error('[CounselorDailyViewService] Error logging stage history:', historyError);
    }

    // Log activity
    const { error: activityError } = await (supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        institution_id: institutionId,
        activity_type: 'stage_change',
        title: `Stage: ${oldStage} → ${newStage}`,
        description: `Stage changed from ${oldStage} to ${newStage}`,
        performed_by: userId,
      });

    if (activityError) {
      console.error('[CounselorDailyViewService] Error logging stage activity:', activityError);
    }
  }

  /**
   * Get list of counselors for the institution (for assignment dropdown)
   */
  static async getCounselors(institutionId: string): Promise<Array<{ id: string; name: string; email: string | null }>> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_counselors')
      .select('id, name, email')
      .eq('institution_id', institutionId)
      .eq('is_active', true) // Note: NULL is_active is treated as inactive (excluded) per PostgreSQL 3-valued logic
      .order('name');

    if (error) {
      console.error('[CounselorDailyViewService] Error fetching counselors:', error);
      return [];
    }

    return data || [];
  }
}
