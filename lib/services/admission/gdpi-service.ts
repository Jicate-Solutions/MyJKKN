// lib/services/admission/gdpi-service.ts
// Service layer for GD-PI (Group Discussion & Personal Interview) management

import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  GDPISession,
  GDPISessionDetail,
  GDPICandidate,
  GDPIEvaluator,
  GDPIScore,
  GDPIScoringCriterion,
  GDPISessionType,
  GDPISessionStatus,
  GDPICandidateStatus,
  GDPIRecommendation,
  CreateGDPISessionInput,
  SubmitGDPIScoreInput,
} from '@/types/admission';

// ============================================================================
// FILTERS
// ============================================================================

export interface GDPISessionFilters {
  institution_id?: string;
  status?: GDPISessionStatus;
  session_type?: GDPISessionType;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class GDPIService {
  // --------------------------------------------------------------------------
  // SESSIONS
  // --------------------------------------------------------------------------

  /**
   * Get paginated list of GD-PI sessions with counts
   */
  static async getSessions(
    filters: GDPISessionFilters,
    supabase: SupabaseClient
  ) {
    const {
      institution_id,
      status,
      session_type,
      from_date,
      to_date,
      search,
      page = 1,
      limit = 20,
    } = filters;

    const offset = (page - 1) * limit;

    let query = supabase
      .from('admission_gdpi_sessions')
      .select(
        `*,
        candidates:admission_gdpi_candidates(count),
        evaluators:admission_gdpi_evaluators(count)`,
        { count: 'exact' }
      )
      .order('scheduled_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (institution_id) query = query.eq('institution_id', institution_id);
    if (status) query = query.eq('status', status);
    if (session_type) query = query.eq('session_type', session_type);
    if (from_date) query = query.gte('scheduled_date', from_date);
    if (to_date) query = query.lte('scheduled_date', to_date);
    if (search) query = query.ilike('session_name', `%${search}%`);

    const { data, error, count } = await query;

    if (error) {
      logger.error('admission/gdpi', 'Failed to fetch sessions', error);
      throw error;
    }

    // Transform nested counts
    const sessions = (data || []).map((s: any) => ({
      ...s,
      candidates_count: s.candidates?.[0]?.count || 0,
      evaluators_count: s.evaluators?.[0]?.count || 0,
      candidates: undefined,
      evaluators: undefined,
    }));

    return {
      sessions,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Get session detail with candidates, evaluators, and scores
   */
  static async getSessionDetail(
    sessionId: string,
    supabase: SupabaseClient
  ): Promise<GDPISessionDetail | null> {
    // Fetch session
    const { data: session, error: sessionError } = await supabase
      .from('admission_gdpi_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      if (sessionError?.code === 'PGRST116') return null;
      logger.error('admission/gdpi', 'Failed to fetch session', sessionError);
      throw sessionError;
    }

    // Fetch candidates with lead info
    const { data: candidates } = await supabase
      .from('admission_gdpi_candidates')
      .select(`
        *,
        lead:admission_leads!lead_id(
          id, full_name, phone, email, funnel_stage, score, source
        )
      `)
      .eq('session_id', sessionId)
      .order('rank', { ascending: true, nullsFirst: false });

    // Fetch evaluators with profile info
    const { data: evaluators } = await supabase
      .from('admission_gdpi_evaluators')
      .select(`
        *,
        evaluator:profiles!evaluator_id(
          id, full_name, email, role
        )
      `)
      .eq('session_id', sessionId);

    // Fetch all scores for this session
    const { data: scores } = await supabase
      .from('admission_gdpi_scores')
      .select(`
        *,
        evaluator:profiles!evaluator_id(
          id, full_name
        )
      `)
      .eq('session_id', sessionId);

    // Attach scores to candidates
    const candidatesWithScores = (candidates || []).map((c: any) => ({
      ...c,
      scores: (scores || []).filter((s: any) => s.candidate_id === c.id),
    }));

    return {
      ...session,
      candidates: candidatesWithScores,
      evaluators: evaluators || [],
      candidates_count: candidates?.length || 0,
      evaluators_count: evaluators?.length || 0,
      evaluated_count: candidatesWithScores.filter(
        (c: any) => c.status === 'evaluated'
      ).length,
    } as GDPISessionDetail;
  }

  /**
   * Create a new GD-PI session
   */
  static async createSession(
    input: CreateGDPISessionInput,
    institutionId: string,
    userId: string,
    supabase: SupabaseClient
  ): Promise<GDPISession> {
    const { data, error } = await supabase
      .from('admission_gdpi_sessions')
      .insert({
        institution_id: institutionId,
        session_name: input.session_name,
        session_type: input.session_type,
        scheduled_date: input.scheduled_date,
        start_time: input.start_time || null,
        end_time: input.end_time || null,
        venue: input.venue || null,
        program_ids: input.program_ids || [],
        max_candidates: input.max_candidates || 30,
        scoring_criteria: input.scoring_criteria,
        notes: input.notes || null,
        academic_year: input.academic_year || null,
        created_by: userId,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      logger.error('admission/gdpi', 'Failed to create session', error);
      throw error;
    }

    return data as GDPISession;
  }

  /**
   * Update a session
   */
  static async updateSession(
    sessionId: string,
    updates: Partial<CreateGDPISessionInput> & { status?: GDPISessionStatus },
    supabase: SupabaseClient
  ): Promise<GDPISession> {
    const { data, error } = await supabase
      .from('admission_gdpi_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      logger.error('admission/gdpi', 'Failed to update session', error);
      throw error;
    }

    return data as GDPISession;
  }

  /**
   * Delete a session (only if draft/cancelled)
   */
  static async deleteSession(sessionId: string, supabase: SupabaseClient) {
    // Verify session is deletable
    const { data: session } = await supabase
      .from('admission_gdpi_sessions')
      .select('status')
      .eq('id', sessionId)
      .single();

    if (session && !['draft', 'cancelled'].includes(session.status)) {
      throw new Error('Only draft or cancelled sessions can be deleted');
    }

    const { error } = await supabase
      .from('admission_gdpi_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      logger.error('admission/gdpi', 'Failed to delete session', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // CANDIDATES
  // --------------------------------------------------------------------------

  /**
   * Add candidates (leads) to a session
   */
  static async addCandidates(
    sessionId: string,
    leadIds: string[],
    institutionId: string,
    supabase: SupabaseClient
  ): Promise<GDPICandidate[]> {
    // Verify session exists and is not completed
    const { data: session } = await supabase
      .from('admission_gdpi_sessions')
      .select('status, max_candidates')
      .eq('id', sessionId)
      .single();

    if (!session) throw new Error('Session not found');
    if (['completed', 'cancelled'].includes(session.status)) {
      throw new Error('Cannot add candidates to a completed or cancelled session');
    }

    // Check current candidate count
    const { count: currentCount } = await supabase
      .from('admission_gdpi_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    const remaining = session.max_candidates - (currentCount || 0);
    if (leadIds.length > remaining) {
      throw new Error(`Session can only accept ${remaining} more candidates (max: ${session.max_candidates})`);
    }

    const records = leadIds.map((lead_id) => ({
      session_id: sessionId,
      lead_id,
      institution_id: institutionId,
      status: 'registered' as GDPICandidateStatus,
    }));

    const { data, error } = await supabase
      .from('admission_gdpi_candidates')
      .upsert(records, { onConflict: 'session_id,lead_id', ignoreDuplicates: true })
      .select();

    if (error) {
      logger.error('admission/gdpi', 'Failed to add candidates', error);
      throw error;
    }

    return (data || []) as GDPICandidate[];
  }

  /**
   * Remove a candidate from session
   */
  static async removeCandidate(candidateId: string, supabase: SupabaseClient) {
    const { error } = await supabase
      .from('admission_gdpi_candidates')
      .delete()
      .eq('id', candidateId);

    if (error) {
      logger.error('admission/gdpi', 'Failed to remove candidate', error);
      throw error;
    }
  }

  /**
   * Mark candidate attendance
   */
  static async markAttendance(
    candidateId: string,
    status: 'present' | 'absent',
    supabase: SupabaseClient
  ) {
    const { data, error } = await supabase
      .from('admission_gdpi_candidates')
      .update({
        status,
        attendance_marked_at: status === 'present' ? new Date().toISOString() : null,
      })
      .eq('id', candidateId)
      .select()
      .single();

    if (error) {
      logger.error('admission/gdpi', 'Failed to mark attendance', error);
      throw error;
    }

    return data as GDPICandidate;
  }

  // --------------------------------------------------------------------------
  // EVALUATORS
  // --------------------------------------------------------------------------

  /**
   * Assign evaluators to a session
   */
  static async assignEvaluators(
    sessionId: string,
    evaluatorIds: string[],
    institutionId: string,
    supabase: SupabaseClient
  ): Promise<GDPIEvaluator[]> {
    const records = evaluatorIds.map((evaluator_id, idx) => ({
      session_id: sessionId,
      evaluator_id,
      institution_id: institutionId,
      is_lead_evaluator: idx === 0,
    }));

    const { data, error } = await supabase
      .from('admission_gdpi_evaluators')
      .upsert(records, { onConflict: 'session_id,evaluator_id', ignoreDuplicates: true })
      .select();

    if (error) {
      logger.error('admission/gdpi', 'Failed to assign evaluators', error);
      throw error;
    }

    return (data || []) as GDPIEvaluator[];
  }

  /**
   * Remove an evaluator from session
   */
  static async removeEvaluator(evaluatorRecordId: string, supabase: SupabaseClient) {
    const { error } = await supabase
      .from('admission_gdpi_evaluators')
      .delete()
      .eq('id', evaluatorRecordId);

    if (error) {
      logger.error('admission/gdpi', 'Failed to remove evaluator', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // SCORING
  // --------------------------------------------------------------------------

  /**
   * Submit score for a candidate by an evaluator
   */
  static async submitScore(
    sessionId: string,
    evaluatorId: string,
    input: SubmitGDPIScoreInput,
    institutionId: string,
    supabase: SupabaseClient
  ): Promise<GDPIScore> {
    // Get session scoring criteria for max score calculation
    const { data: session } = await supabase
      .from('admission_gdpi_sessions')
      .select('scoring_criteria')
      .eq('id', sessionId)
      .single();

    if (!session) throw new Error('Session not found');

    const criteria = (session.scoring_criteria || []) as GDPIScoringCriterion[];
    const maxPossibleScore = criteria.reduce((sum, c) => sum + c.max_score, 0);
    const totalScore = Object.values(input.scores).reduce((sum, s) => sum + s, 0);

    const { data, error } = await supabase
      .from('admission_gdpi_scores')
      .upsert(
        {
          session_id: sessionId,
          candidate_id: input.candidate_id,
          evaluator_id: evaluatorId,
          institution_id: institutionId,
          scores: input.scores,
          total_score: totalScore,
          max_possible_score: maxPossibleScore,
          recommendation: input.recommendation || null,
          feedback: input.feedback || null,
        },
        { onConflict: 'candidate_id,evaluator_id' }
      )
      .select()
      .single();

    if (error) {
      logger.error('admission/gdpi', 'Failed to submit score', error);
      throw error;
    }

    // Update evaluator count (best-effort, non-critical)
    try {
      await supabase
        .from('admission_gdpi_evaluators')
        .update({ evaluation_count: evaluatorId ? 1 : 0 })
        .eq('session_id', sessionId)
        .eq('evaluator_id', evaluatorId);
    } catch {
      // Non-critical: count update is best-effort
    }

    return data as GDPIScore;
  }

  // --------------------------------------------------------------------------
  // PUBLISH RESULTS
  // --------------------------------------------------------------------------

  /**
   * Publish session results: calculate final scores, rank candidates, update lead stages
   */
  static async publishResults(
    sessionId: string,
    supabase: SupabaseClient
  ) {
    // 1. Get all candidates with their scores
    const { data: candidates } = await supabase
      .from('admission_gdpi_candidates')
      .select('id, lead_id, status')
      .eq('session_id', sessionId)
      .in('status', ['present', 'evaluated']);

    if (!candidates || candidates.length === 0) {
      throw new Error('No evaluated candidates found');
    }

    // 2. Get all scores grouped by candidate
    const { data: allScores } = await supabase
      .from('admission_gdpi_scores')
      .select('candidate_id, total_score, max_possible_score')
      .eq('session_id', sessionId);

    // 3. Calculate average scores per candidate
    const candidateScores = new Map<string, { totalScore: number; maxScore: number; evalCount: number }>();
    for (const score of allScores || []) {
      const existing = candidateScores.get(score.candidate_id) || { totalScore: 0, maxScore: 0, evalCount: 0 };
      existing.totalScore += score.total_score;
      existing.maxScore += score.max_possible_score;
      existing.evalCount += 1;
      candidateScores.set(score.candidate_id, existing);
    }

    // 4. Build ranked list
    const ranked = candidates
      .map((c: any) => {
        const scores = candidateScores.get(c.id);
        const avgScore = scores ? scores.totalScore / scores.evalCount : 0;
        const avgMax = scores ? scores.maxScore / scores.evalCount : 0;
        const percentage = avgMax > 0 ? (avgScore / avgMax) * 100 : 0;
        return { id: c.id, lead_id: c.lead_id, avgScore, avgMax, percentage };
      })
      .sort((a, b) => b.percentage - a.percentage);

    // 5. Update candidates with final scores and ranks
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      await supabase
        .from('admission_gdpi_candidates')
        .update({
          total_score: r.avgScore,
          max_possible_score: r.avgMax,
          percentage: Math.round(r.percentage * 100) / 100,
          rank: i + 1,
          status: 'evaluated' as GDPICandidateStatus,
        })
        .eq('id', r.id);
    }

    // 6. Update session status to completed
    await supabase
      .from('admission_gdpi_sessions')
      .update({ status: 'completed' as GDPISessionStatus })
      .eq('id', sessionId);

    // 7. Update lead stages to 'interview_completed' for present candidates
    const leadIds = ranked.map((r) => r.lead_id);
    if (leadIds.length > 0) {
      await supabase
        .from('admission_leads')
        .update({
          funnel_stage: 'interview_completed',
          stage: 'interview_completed',
        })
        .in('id', leadIds);
    }

    logger.info('admission/gdpi', `Published results for session ${sessionId}`, {
      candidatesRanked: ranked.length,
    });

    return { ranked: ranked.length, session_status: 'completed' };
  }
}
