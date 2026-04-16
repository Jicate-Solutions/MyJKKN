/**
 * HR Recruitment Interviews Service (Phase 3)
 *
 * Static class — SupabaseClient passed as first argument.
 * Spec: specs/hr-recruitment-module-spec.md (Cvviz-sunset scope)
 *
 * Methods:
 *   listInterviews       — paginated list with filters (candidate / job / panel member)
 *   getInterview         — single record by id
 *   scheduleInterview    — create a new sitting
 *   rescheduleInterview  — marks old row 'rescheduled' and creates a new one with rescheduled_from_id link
 *   cancelInterview      — sets status='cancelled' + outcome_summary as reason
 *   updateOutcome        — after the interview, record outcome_summary + mark completed/no_show
 *
 * Why reschedule creates a NEW row: keeps full audit trail of all scheduled
 * times. Editing scheduled_at in place loses the history.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRRecruitmentInterview,
  HRRecruitmentInterviewInsert,
  HRRecruitmentInterviewUpdate,
  InterviewFilters,
  InterviewListResponse,
  InterviewStatus,
} from '@/types/hr-recruitment';

// =====================================================================================
// Recruitment Interviews Service
// =====================================================================================

export class RecruitmentInterviewsService {
  // ----- List / Get -----

  static async listInterviews(
    supabase: SupabaseClient,
    filters: InterviewFilters = {}
  ): Promise<InterviewListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from('hr_recruitment_interviews')
      .select('*', { count: 'exact' })
      .order('scheduled_at', { ascending: false })
      .range(from, to);

    if (filters.candidate_id) {
      q = q.eq('candidate_id', filters.candidate_id);
    }
    if (filters.job_id) {
      q = q.eq('job_id', filters.job_id);
    }
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', statuses);
    }
    if (filters.panel_member_id) {
      // uuid[] contains the given id
      q = q.contains('panel_member_ids', [filters.panel_member_id]);
    }
    if (filters.from_date) {
      q = q.gte('scheduled_at', filters.from_date);
    }
    if (filters.to_date) {
      q = q.lte('scheduled_at', filters.to_date);
    }

    const { data, count, error } = await q;
    if (error) throw error;

    return {
      data: (data ?? []) as HRRecruitmentInterview[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  static async getInterview(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRRecruitmentInterview | null> {
    const { data, error } = await supabase
      .from('hr_recruitment_interviews')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as HRRecruitmentInterview | null;
  }

  // ----- Schedule -----

  static async scheduleInterview(
    supabase: SupabaseClient,
    payload: HRRecruitmentInterviewInsert
  ): Promise<HRRecruitmentInterview> {
    if (!payload.candidate_id) {
      throw new Error('candidate_id is required.');
    }
    if (!payload.scheduled_at) {
      throw new Error('scheduled_at is required.');
    }
    if (!payload.mode) {
      throw new Error('mode is required.');
    }
    if (!Array.isArray(payload.panel_member_ids) || payload.panel_member_ids.length === 0) {
      throw new Error('At least one panel member is required.');
    }
    if (payload.duration_minutes != null && payload.duration_minutes <= 0) {
      throw new Error('duration_minutes must be positive.');
    }

    const insertPayload: Record<string, unknown> = {
      candidate_id: payload.candidate_id,
      job_id: payload.job_id ?? null,
      round_number: payload.round_number ?? 1,
      round_name: payload.round_name ?? null,
      scheduled_at: payload.scheduled_at,
      duration_minutes: payload.duration_minutes ?? 30,
      mode: payload.mode,
      location_or_link: payload.location_or_link ?? null,
      panel_member_ids: payload.panel_member_ids,
      status: payload.status ?? 'scheduled',
      rescheduled_from_id: payload.rescheduled_from_id ?? null,
      outcome_summary: payload.outcome_summary ?? null,
      created_by: payload.created_by ?? null,
    };

    const { data, error } = await supabase
      .from('hr_recruitment_interviews')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentInterview;
  }

  // ----- Reschedule -----

  /**
   * Reschedule: marks the old interview 'rescheduled' and creates a new row
   * with rescheduled_from_id pointing back, preserving full audit history.
   */
  static async rescheduleInterview(
    supabase: SupabaseClient,
    oldInterviewId: string,
    newSittingPatch: {
      scheduled_at: string;
      duration_minutes?: number;
      mode?: HRRecruitmentInterviewInsert['mode'];
      location_or_link?: string | null;
      panel_member_ids?: string[];
      round_name?: string | null;
      created_by?: string | null;
    }
  ): Promise<HRRecruitmentInterview> {
    const old = await this.getInterview(supabase, oldInterviewId);
    if (!old) throw new Error('Interview not found');
    if (!['scheduled'].includes(old.status)) {
      throw new Error(
        `Cannot reschedule interview in status '${old.status}'. ` +
        "Only 'scheduled' interviews can be rescheduled."
      );
    }

    // Mark old as rescheduled
    const { error: markErr } = await supabase
      .from('hr_recruitment_interviews')
      .update({
        status: 'rescheduled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', oldInterviewId);
    if (markErr) throw markErr;

    // Insert new sitting referencing the old
    const newPayload: HRRecruitmentInterviewInsert = {
      candidate_id: old.candidate_id,
      job_id: old.job_id,
      round_number: old.round_number,
      round_name: newSittingPatch.round_name ?? old.round_name,
      scheduled_at: newSittingPatch.scheduled_at,
      duration_minutes: newSittingPatch.duration_minutes ?? old.duration_minutes,
      mode: newSittingPatch.mode ?? old.mode,
      location_or_link:
        newSittingPatch.location_or_link !== undefined
          ? newSittingPatch.location_or_link
          : old.location_or_link,
      panel_member_ids: newSittingPatch.panel_member_ids ?? old.panel_member_ids,
      rescheduled_from_id: oldInterviewId,
      status: 'scheduled',
      created_by: newSittingPatch.created_by ?? null,
    };

    return this.scheduleInterview(supabase, newPayload);
  }

  // ----- Cancel -----

  static async cancelInterview(
    supabase: SupabaseClient,
    id: string,
    reason?: string
  ): Promise<HRRecruitmentInterview> {
    const interview = await this.getInterview(supabase, id);
    if (!interview) throw new Error('Interview not found');
    if (!['scheduled'].includes(interview.status)) {
      throw new Error(
        `Cannot cancel interview in status '${interview.status}'.`
      );
    }

    const { data, error } = await supabase
      .from('hr_recruitment_interviews')
      .update({
        status: 'cancelled',
        outcome_summary: reason ?? interview.outcome_summary ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentInterview;
  }

  // ----- Update outcome (post-interview) -----

  static async updateOutcome(
    supabase: SupabaseClient,
    id: string,
    outcome: {
      status: Extract<InterviewStatus, 'completed' | 'no_show'>;
      outcome_summary?: string | null;
    }
  ): Promise<HRRecruitmentInterview> {
    const interview = await this.getInterview(supabase, id);
    if (!interview) throw new Error('Interview not found');
    if (!['scheduled'].includes(interview.status)) {
      throw new Error(
        `Cannot set outcome on interview in status '${interview.status}'.`
      );
    }

    const { data, error } = await supabase
      .from('hr_recruitment_interviews')
      .update({
        status: outcome.status,
        outcome_summary: outcome.outcome_summary ?? interview.outcome_summary ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentInterview;
  }

  // ----- Generic update (panel change before interview, etc.) -----

  static async updateInterview(
    supabase: SupabaseClient,
    id: string,
    patch: HRRecruitmentInterviewUpdate
  ): Promise<HRRecruitmentInterview> {
    const { data, error } = await supabase
      .from('hr_recruitment_interviews')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentInterview;
  }
}
