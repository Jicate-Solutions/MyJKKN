/**
 * HR Recruitment Scorecards Service (Phase 3)
 *
 * Static class — SupabaseClient passed as first argument.
 * Spec: specs/hr-recruitment-module-spec.md (Cvviz-sunset scope)
 *
 * Stricter RLS (Learning #8): read access is restricted to
 *   - the submitting interviewer (interviewer_id = auth.uid())
 *   - users with 'hr.recruitment.scorecards.view' (hr_admin, director)
 *   - members of the candidate's approval chain
 *   - super_admin
 *
 * Submit-once principle: no updated_at, no update method for interviewers.
 * If a correction is needed, super_admin must intervene (enforced at RLS).
 *
 * Methods:
 *   listForInterview  — all scorecards for a given interview (respects RLS)
 *   getScorecard      — single scorecard by id
 *   submitScorecard   — create a new scorecard (unique on interview_id + interviewer_id)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRRecruitmentScorecard,
  HRRecruitmentScorecardInsert,
} from '@/types/hr-recruitment';

// =====================================================================================
// Recruitment Scorecards Service
// =====================================================================================

export class RecruitmentScorecardsService {
  // ----- List -----

  static async listForInterview(
    supabase: SupabaseClient,
    interviewId: string
  ): Promise<HRRecruitmentScorecard[]> {
    const { data, error } = await supabase
      .from('hr_recruitment_scorecards')
      .select('*')
      .eq('interview_id', interviewId)
      .order('submitted_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as HRRecruitmentScorecard[];
  }

  // ----- Get -----

  static async getScorecard(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRRecruitmentScorecard | null> {
    const { data, error } = await supabase
      .from('hr_recruitment_scorecards')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as HRRecruitmentScorecard | null;
  }

  // ----- Submit (submit-once per interviewer per interview) -----

  /**
   * Submit a scorecard. RLS enforces interviewer_id = auth.uid(), and
   * the UNIQUE constraint on (interview_id, interviewer_id) enforces one
   * scorecard per interviewer per interview. Callers MUST pass the
   * interviewer's own profiles.id.
   */
  static async submitScorecard(
    supabase: SupabaseClient,
    payload: HRRecruitmentScorecardInsert
  ): Promise<HRRecruitmentScorecard> {
    if (!payload.interview_id) {
      throw new Error('interview_id is required.');
    }
    if (!payload.interviewer_id) {
      throw new Error('interviewer_id is required.');
    }
    if (
      payload.rating_overall == null ||
      payload.rating_overall < 1 ||
      payload.rating_overall > 5
    ) {
      throw new Error('rating_overall must be between 1 and 5.');
    }
    const optionalRatings: Array<[string, number | null | undefined]> = [
      ['rating_technical', payload.rating_technical],
      ['rating_communication', payload.rating_communication],
      ['rating_culture_fit', payload.rating_culture_fit],
    ];
    for (const [key, val] of optionalRatings) {
      if (val != null && (val < 1 || val > 5)) {
        throw new Error(`${key} must be between 1 and 5 when provided.`);
      }
    }
    if (!payload.recommendation) {
      throw new Error('recommendation is required.');
    }

    const insertPayload: Record<string, unknown> = {
      interview_id: payload.interview_id,
      interviewer_id: payload.interviewer_id,
      rating_overall: payload.rating_overall,
      rating_technical: payload.rating_technical ?? null,
      rating_communication: payload.rating_communication ?? null,
      rating_culture_fit: payload.rating_culture_fit ?? null,
      strengths: payload.strengths ?? null,
      concerns: payload.concerns ?? null,
      recommendation: payload.recommendation,
      submitted_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('hr_recruitment_scorecards')
      .insert(insertPayload)
      .select()
      .single();
    if (error) {
      // Surface the duplicate-key error cleanly for the route layer.
      if ((error as { code?: string }).code === '23505') {
        throw new Error(
          'You have already submitted a scorecard for this interview. ' +
          'Scorecards are submit-once; contact HR admin to correct.'
        );
      }
      throw error;
    }
    return data as HRRecruitmentScorecard;
  }
}
