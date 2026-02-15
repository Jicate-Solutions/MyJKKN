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
// SERVICE
// ============================================================================

export class CounselorDailyViewService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get the complete daily view data using the optimized DB function.
   * Single query returns KPIs, followups, pipeline, activities, and unassigned count.
   */
  static async getDailyView(institutionId: string): Promise<CounselorDailyViewData> {
    const { data: { user } } = await (this.supabase as any).auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await (this.supabase as any)
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

    // Compute conversion rate client-side
    const kpis = data.kpis || {};
    const conversionRate = kpis.total_this_month > 0
      ? Math.round((kpis.enrolled_this_month / kpis.total_this_month) * 100)
      : 0;

    return {
      counselor_id: data.counselor_id,
      is_manager: data.is_manager || false,
      kpis: {
        ...kpis,
        conversion_rate: conversionRate,
      },
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
    const { data, error } = await (this.supabase as any)
      .from('admission_leads')
      .select('id, full_name, phone, email, interested_programs, source, score, created_at, funnel_stage, student_interest_level, parent_decision_status, academic_year')
      .eq('institution_id', institutionId)
      .is('counselor_id', null)
      .not('funnel_stage', 'in', '(enrolled,lost,dormant)')
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
  static async assignLeads(leadIds: string[], counselorId: string, institutionId?: string): Promise<void> {
    let query = (this.supabase as any)
      .from('admission_leads')
      .update({
        counselor_id: counselorId,
        assigned_counselor_id: counselorId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', leadIds);

    // Scope to institution to prevent cross-tenant reassignment
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { error } = await query;

    if (error) {
      console.error('[CounselorDailyViewService] Error assigning leads:', error);
      throw new Error('Failed to assign leads');
    }
  }

  /**
   * Quick reschedule follow-up
   */
  static async rescheduleFollowup(leadId: string, newDate: string): Promise<void> {
    const { data: { user } } = await (this.supabase as any).auth.getUser();

    // Log reschedule as activity for audit trail
    await (this.supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        activity_type: 'task',
        title: 'Follow-up Rescheduled',
        description: `Follow-up rescheduled to ${new Date(newDate).toLocaleDateString()}`,
        metadata: { scheduled_at: newDate },
        performed_by: user?.id || null,
      });

    const { error } = await (this.supabase as any)
      .from('admission_leads')
      .update({
        next_followup_at: newDate,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) {
      console.error('[CounselorDailyViewService] Error rescheduling:', error);
      throw new Error('Failed to reschedule follow-up');
    }
  }

  /**
   * Quick add note activity
   */
  static async addQuickNote(leadId: string, note: string): Promise<void> {
    const { data: { user } } = await (this.supabase as any).auth.getUser();

    const { error } = await (this.supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        activity_type: 'note',
        title: 'Quick Note',
        description: note,
        performed_by: user?.id || null,
      });

    if (error) {
      console.error('[CounselorDailyViewService] Error adding note:', error);
      throw new Error('Failed to add note');
    }

    // Update last_activity_at on lead
    const { error: updateError } = await (this.supabase as any)
      .from('admission_leads')
      .update({
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (updateError) {
      console.error('[CounselorDailyViewService] Error updating lead timestamp:', updateError);
    }
  }

  /**
   * Quick log call activity
   */
  static async logCall(leadId: string, notes?: string): Promise<void> {
    const { data: { user } } = await (this.supabase as any).auth.getUser();

    const { error } = await (this.supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        activity_type: 'call',
        title: 'Phone Call',
        description: notes || 'Call made from counselor view',
        performed_by: user?.id || null,
      });

    if (error) {
      console.error('[CounselorDailyViewService] Error logging call:', error);
      throw new Error('Failed to log call');
    }

    // Update contact timestamps
    const { error: updateError } = await (this.supabase as any)
      .from('admission_leads')
      .update({
        last_contact_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (updateError) {
      console.error('[CounselorDailyViewService] Error updating lead timestamps:', updateError);
    }
  }

  /**
   * Quick advance stage
   */
  static async advanceStage(leadId: string, newStage: string): Promise<void> {
    const { data: { user } } = await (this.supabase as any).auth.getUser();

    // Get current stage first
    const { data: lead } = await (this.supabase as any)
      .from('admission_leads')
      .select('funnel_stage')
      .eq('id', leadId)
      .single();

    const oldStage = lead?.funnel_stage;

    // Update lead stage
    const updatePayload: Record<string, any> = {
      funnel_stage: newStage,
      stage_changed_at: new Date().toISOString(),
      previous_stage: oldStage,
      updated_at: new Date().toISOString(),
    };
    // Set last_contact_at when moving to 'contacted' stage
    if (newStage === 'contacted') {
      updatePayload.last_contact_at = new Date().toISOString();
    }
    const { error } = await (this.supabase as any)
      .from('admission_leads')
      .update(updatePayload)
      .eq('id', leadId);

    if (error) {
      console.error('[CounselorDailyViewService] Error advancing stage:', error);
      throw new Error('Failed to advance stage');
    }

    // Log stage change in history
    const { error: historyError } = await (this.supabase as any)
      .from('admission_lead_stage_history')
      .insert({
        lead_id: leadId,
        from_stage: oldStage,
        to_stage: newStage,
        changed_by: user?.id || null,
      });

    if (historyError) {
      console.error('[CounselorDailyViewService] Error logging stage history:', historyError);
    }

    // Log activity
    const { error: activityError } = await (this.supabase as any)
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        activity_type: 'stage_change',
        title: `Stage: ${oldStage} → ${newStage}`,
        description: `Stage changed from ${oldStage} to ${newStage}`,
        performed_by: user?.id || null,
      });

    if (activityError) {
      console.error('[CounselorDailyViewService] Error logging stage activity:', activityError);
    }
  }

  /**
   * Get list of counselors for the institution (for assignment dropdown)
   */
  static async getCounselors(institutionId: string): Promise<Array<{ id: string; name: string; email: string }>> {
    const { data, error } = await (this.supabase as any)
      .from('admission_counselors')
      .select('id, name, email')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[CounselorDailyViewService] Error fetching counselors:', error);
      return [];
    }

    return data || [];
  }
}
