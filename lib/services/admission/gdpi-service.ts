// lib/services/admission/gdpi-service.ts
// Service for GD-PI (Group Discussion & Personal Interview) sessions
// Tables: admission_gdpi_sessions, admission_gdpi_evaluators,
//         admission_gdpi_candidates, admission_gdpi_scores

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type GDPISessionType = 'gd' | 'pi';
export type GDPISessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type GDPICandidateStatus = 'scheduled' | 'present' | 'absent' | 'evaluated';
export type GDPIRecommendation = 'strong_accept' | 'accept' | 'waitlist' | 'reject';
export type GDPIEvaluatorRole = 'lead' | 'evaluator' | 'observer';

export interface GDPISession {
  id: string;
  institution_id: string;
  type: GDPISessionType;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  venue: string | null;
  status: GDPISessionStatus;
  topic: string | null;
  max_candidates: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined counts
  candidate_count?: number;
  evaluator_count?: number;
  evaluated_count?: number;
  // Joined details (for single-session view)
  candidates?: GDPICandidate[];
  evaluators?: GDPIEvaluator[];
}

export interface GDPIEvaluator {
  id: string;
  session_id: string;
  evaluator_id: string;
  role: GDPIEvaluatorRole;
  created_at: string;
  // Joined
  profiles?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

export interface GDPICandidate {
  id: string;
  session_id: string;
  lead_id: string;
  status: GDPICandidateStatus;
  overall_score: number | null;
  recommendation: GDPIRecommendation | null;
  evaluator_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  admission_leads?: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string;
    program_interest: string | null;
  } | null;
  scores?: GDPIScore[];
}

export interface GDPIScore {
  id: string;
  candidate_id: string;
  evaluator_id: string;
  criterion: string;
  score: number;
  remarks: string | null;
  created_at: string;
  // Joined
  profiles?: {
    id: string;
    full_name: string | null;
  } | null;
}

export interface CreateSessionInput {
  institution_id: string;
  type: GDPISessionType;
  title: string;
  scheduled_at: string;
  duration_minutes?: number;
  venue?: string;
  topic?: string;
  max_candidates?: number;
  notes?: string;
  created_by?: string;
}

export interface UpdateSessionInput {
  title?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  venue?: string;
  status?: GDPISessionStatus;
  topic?: string;
  max_candidates?: number;
  notes?: string;
}

export interface ScoreInput {
  criterion: string;
  score: number;
  remarks?: string;
}

export interface GDPISessionFilters {
  type?: GDPISessionType;
  status?: GDPISessionStatus;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface GDPIStats {
  totalSessions: number;
  completedSessions: number;
  totalCandidates: number;
  evaluatedCandidates: number;
  avgScore: number;
  acceptRate: number;
  gdSessions: number;
  piSessions: number;
}

// ============================================================================
// GD CRITERIA & PI CRITERIA
// ============================================================================

export const GD_CRITERIA = [
  { key: 'communication', label: 'Communication Skills', description: 'Clarity, articulation, and language proficiency' },
  { key: 'content', label: 'Content & Knowledge', description: 'Depth of knowledge and relevant points raised' },
  { key: 'leadership', label: 'Leadership', description: 'Initiative, ability to steer discussion constructively' },
  { key: 'teamwork', label: 'Teamwork', description: 'Listening, building on others\' points, inclusiveness' },
  { key: 'confidence', label: 'Confidence & Body Language', description: 'Poise, eye contact, and assertiveness' },
  { key: 'reasoning', label: 'Analytical Reasoning', description: 'Logical thinking and structured argumentation' },
];

export const PI_CRITERIA = [
  { key: 'domain_knowledge', label: 'Domain Knowledge', description: 'Understanding of chosen field and curriculum' },
  { key: 'communication', label: 'Communication', description: 'Verbal clarity and expression' },
  { key: 'confidence', label: 'Confidence & Personality', description: 'Self-assurance, maturity, and demeanor' },
  { key: 'career_goals', label: 'Career Goals & Motivation', description: 'Clarity of purpose and future plans' },
  { key: 'problem_solving', label: 'Problem Solving', description: 'Approach to situational and analytical questions' },
  { key: 'general_awareness', label: 'General Awareness', description: 'Current affairs and general knowledge' },
];

// ============================================================================
// SERVICE
// ============================================================================

export class GDPIService {
  private static supabase = createClientSupabaseClient();

  /**
   * List sessions for an institution with candidate/evaluator counts
   */
  static async getSessions(
    institutionId: string,
    filters?: GDPISessionFilters
  ): Promise<GDPISession[]> {
    let query = (this.supabase as any)
      .from('admission_gdpi_sessions')
      .select(`
        *,
        admission_gdpi_candidates(id, status),
        admission_gdpi_evaluators(id)
      `)
      .eq('institution_id', institutionId)
      .order('scheduled_at', { ascending: false });

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.date_from) {
      query = query.gte('scheduled_at', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('scheduled_at', filters.date_to);
    }
    if (filters?.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Map joined arrays to counts
    return ((data || []) as any[]).map((s) => ({
      ...s,
      candidate_count: s.admission_gdpi_candidates?.length || 0,
      evaluator_count: s.admission_gdpi_evaluators?.length || 0,
      evaluated_count: s.admission_gdpi_candidates?.filter(
        (c: any) => c.status === 'evaluated'
      ).length || 0,
      // Remove raw joined data from the object
      admission_gdpi_candidates: undefined,
      admission_gdpi_evaluators: undefined,
    }));
  }

  /**
   * Get a single session with full details (candidates, evaluators, scores)
   */
  static async getSession(sessionId: string): Promise<GDPISession | null> {
    const { data, error } = await (this.supabase as any)
      .from('admission_gdpi_sessions')
      .select(`
        *,
        admission_gdpi_evaluators(
          id, session_id, evaluator_id, role, created_at,
          profiles(id, full_name, email, avatar_url)
        ),
        admission_gdpi_candidates(
          id, session_id, lead_id, status, overall_score,
          recommendation, evaluator_notes, created_at, updated_at,
          admission_leads(id, full_name, email, phone, program_interest)
        )
      `)
      .eq('id', sessionId)
      .single();

    if (error) throw error;
    if (!data) return null;

    // Also fetch scores for each candidate
    const candidateIds = (data.admission_gdpi_candidates || []).map((c: any) => c.id);
    let scores: any[] = [];
    if (candidateIds.length > 0) {
      const { data: scoreData, error: scoreError } = await (this.supabase as any)
        .from('admission_gdpi_scores')
        .select(`
          id, candidate_id, evaluator_id, criterion, score, remarks, created_at,
          profiles(id, full_name)
        `)
        .in('candidate_id', candidateIds);

      if (!scoreError && scoreData) {
        scores = scoreData;
      }
    }

    // Attach scores to candidates
    const candidates = (data.admission_gdpi_candidates || []).map((c: any) => ({
      ...c,
      scores: scores.filter((s: any) => s.candidate_id === c.id),
    }));

    return {
      ...data,
      evaluators: data.admission_gdpi_evaluators || [],
      candidates,
      candidate_count: candidates.length,
      evaluator_count: (data.admission_gdpi_evaluators || []).length,
      evaluated_count: candidates.filter((c: any) => c.status === 'evaluated').length,
      admission_gdpi_evaluators: undefined,
      admission_gdpi_candidates: undefined,
    } as GDPISession;
  }

  /**
   * Create a new session
   */
  static async createSession(input: CreateSessionInput): Promise<GDPISession> {
    const { data, error } = await (this.supabase as any)
      .from('admission_gdpi_sessions')
      .insert({
        institution_id: input.institution_id,
        type: input.type,
        title: input.title,
        scheduled_at: input.scheduled_at,
        duration_minutes: input.duration_minutes ?? 30,
        venue: input.venue || null,
        topic: input.topic || null,
        max_candidates: input.max_candidates ?? 10,
        notes: input.notes || null,
        created_by: input.created_by || null,
        status: 'scheduled',
      })
      .select()
      .single();

    if (error) throw error;
    return data as GDPISession;
  }

  /**
   * Update a session
   */
  static async updateSession(
    sessionId: string,
    updates: UpdateSessionInput
  ): Promise<GDPISession> {
    const { data, error } = await (this.supabase as any)
      .from('admission_gdpi_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data as GDPISession;
  }

  /**
   * Delete a session (cascades to evaluators, candidates, scores)
   */
  static async deleteSession(sessionId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_gdpi_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) throw error;
  }

  /**
   * Add candidates to a session by lead IDs
   */
  static async addCandidates(
    sessionId: string,
    leadIds: string[]
  ): Promise<GDPICandidate[]> {
    const rows = leadIds.map((leadId) => ({
      session_id: sessionId,
      lead_id: leadId,
      status: 'scheduled',
    }));

    const { data, error } = await (this.supabase as any)
      .from('admission_gdpi_candidates')
      .upsert(rows, { onConflict: 'session_id,lead_id', ignoreDuplicates: true })
      .select(`
        *,
        admission_leads(id, full_name, email, phone, program_interest)
      `);

    if (error) throw error;
    return (data || []) as GDPICandidate[];
  }

  /**
   * Remove a candidate from a session
   */
  static async removeCandidate(candidateId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_gdpi_candidates')
      .delete()
      .eq('id', candidateId);

    if (error) throw error;
  }

  /**
   * Add an evaluator to a session
   */
  static async addEvaluator(
    sessionId: string,
    evaluatorId: string,
    role: GDPIEvaluatorRole = 'evaluator'
  ): Promise<GDPIEvaluator> {
    const { data, error } = await (this.supabase as any)
      .from('admission_gdpi_evaluators')
      .upsert(
        { session_id: sessionId, evaluator_id: evaluatorId, role },
        { onConflict: 'session_id,evaluator_id' }
      )
      .select(`
        *,
        profiles(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) throw error;
    return data as GDPIEvaluator;
  }

  /**
   * Remove an evaluator from a session
   */
  static async removeEvaluator(evaluatorRecordId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_gdpi_evaluators')
      .delete()
      .eq('id', evaluatorRecordId);

    if (error) throw error;
  }

  /**
   * Submit scores for a candidate from a specific evaluator
   */
  static async scoreCandidate(
    candidateId: string,
    evaluatorId: string,
    scores: ScoreInput[]
  ): Promise<GDPIScore[]> {
    const rows = scores.map((s) => ({
      candidate_id: candidateId,
      evaluator_id: evaluatorId,
      criterion: s.criterion,
      score: s.score,
      remarks: s.remarks || null,
    }));

    const { data, error } = await (this.supabase as any)
      .from('admission_gdpi_scores')
      .upsert(rows, { onConflict: 'candidate_id,evaluator_id,criterion' })
      .select();

    if (error) throw error;

    // Calculate and update overall score for this candidate
    const { data: allScores } = await (this.supabase as any)
      .from('admission_gdpi_scores')
      .select('score')
      .eq('candidate_id', candidateId);

    if (allScores && allScores.length > 0) {
      const avg =
        allScores.reduce((sum: number, s: any) => sum + s.score, 0) /
        allScores.length;

      await (this.supabase as any)
        .from('admission_gdpi_candidates')
        .update({
          overall_score: Math.round(avg * 10) / 10,
          status: 'evaluated',
        })
        .eq('id', candidateId);
    }

    return (data || []) as GDPIScore[];
  }

  /**
   * Get aggregated results for a session
   */
  static async getSessionResults(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const candidates = session.candidates || [];
    const evaluatedCandidates = candidates.filter(
      (c) => c.status === 'evaluated'
    );
    const totalScores = evaluatedCandidates
      .map((c) => c.overall_score || 0)
      .filter((s) => s > 0);

    const avgScore =
      totalScores.length > 0
        ? totalScores.reduce((a, b) => a + b, 0) / totalScores.length
        : 0;

    const recommendations = {
      strong_accept: evaluatedCandidates.filter(
        (c) => c.recommendation === 'strong_accept'
      ).length,
      accept: evaluatedCandidates.filter((c) => c.recommendation === 'accept')
        .length,
      waitlist: evaluatedCandidates.filter(
        (c) => c.recommendation === 'waitlist'
      ).length,
      reject: evaluatedCandidates.filter((c) => c.recommendation === 'reject')
        .length,
    };

    return {
      session,
      candidates,
      evaluatedCount: evaluatedCandidates.length,
      totalCount: candidates.length,
      avgScore: Math.round(avgScore * 10) / 10,
      recommendations,
    };
  }

  /**
   * Update recommendation for a candidate
   */
  static async updateRecommendation(
    candidateId: string,
    recommendation: GDPIRecommendation,
    notes?: string
  ): Promise<GDPICandidate> {
    const updates: any = { recommendation };
    if (notes !== undefined) {
      updates.evaluator_notes = notes;
    }

    const { data, error } = await (this.supabase as any)
      .from('admission_gdpi_candidates')
      .update(updates)
      .eq('id', candidateId)
      .select()
      .single();

    if (error) throw error;
    return data as GDPICandidate;
  }

  /**
   * Update candidate attendance status
   */
  static async updateCandidateStatus(
    candidateId: string,
    status: GDPICandidateStatus
  ): Promise<GDPICandidate> {
    const { data, error } = await (this.supabase as any)
      .from('admission_gdpi_candidates')
      .update({ status })
      .eq('id', candidateId)
      .select()
      .single();

    if (error) throw error;
    return data as GDPICandidate;
  }

  /**
   * Get aggregate stats for the institution
   */
  static async getStats(institutionId: string): Promise<GDPIStats> {
    // Fetch sessions
    const { data: sessions, error: sessionsError } = await (this.supabase as any)
      .from('admission_gdpi_sessions')
      .select('id, type, status')
      .eq('institution_id', institutionId);

    if (sessionsError) throw sessionsError;

    const sessionIds = (sessions || []).map((s: any) => s.id);

    let candidates: any[] = [];
    if (sessionIds.length > 0) {
      const { data: candidateData, error: candidateError } = await (
        this.supabase as any
      )
        .from('admission_gdpi_candidates')
        .select('id, status, overall_score, recommendation')
        .in('session_id', sessionIds);

      if (!candidateError && candidateData) {
        candidates = candidateData;
      }
    }

    const evaluatedCandidates = candidates.filter(
      (c) => c.status === 'evaluated'
    );
    const scoredCandidates = evaluatedCandidates.filter(
      (c) => c.overall_score !== null
    );
    const avgScore =
      scoredCandidates.length > 0
        ? scoredCandidates.reduce(
            (sum: number, c: any) => sum + (c.overall_score || 0),
            0
          ) / scoredCandidates.length
        : 0;

    const acceptedCount = evaluatedCandidates.filter(
      (c) =>
        c.recommendation === 'strong_accept' || c.recommendation === 'accept'
    ).length;
    const acceptRate =
      evaluatedCandidates.length > 0
        ? (acceptedCount / evaluatedCandidates.length) * 100
        : 0;

    return {
      totalSessions: (sessions || []).length,
      completedSessions: (sessions || []).filter(
        (s: any) => s.status === 'completed'
      ).length,
      totalCandidates: candidates.length,
      evaluatedCandidates: evaluatedCandidates.length,
      avgScore: Math.round(avgScore * 10) / 10,
      acceptRate: Math.round(acceptRate * 10) / 10,
      gdSessions: (sessions || []).filter((s: any) => s.type === 'gd').length,
      piSessions: (sessions || []).filter((s: any) => s.type === 'pi').length,
    };
  }

  /**
   * Search leads for adding as candidates (not already in this session)
   */
  static async searchLeadsForSession(
    institutionId: string,
    sessionId: string,
    searchTerm: string
  ) {
    // Get existing candidate lead IDs
    const { data: existing } = await (this.supabase as any)
      .from('admission_gdpi_candidates')
      .select('lead_id')
      .eq('session_id', sessionId);

    const existingLeadIds = (existing || []).map((e: any) => e.lead_id);

    let query = (this.supabase as any)
      .from('admission_leads')
      .select('id, full_name, email, phone, program_interest, funnel_stage')
      .eq('institution_id', institutionId)
      .limit(20);

    if (searchTerm) {
      query = query.or(
        `full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    // Filter out already-added leads
    return (data || []).filter(
      (lead: any) => !existingLeadIds.includes(lead.id)
    );
  }

  /**
   * Search profiles for adding as evaluators
   */
  static async searchEvaluators(
    institutionId: string,
    searchTerm: string
  ) {
    let query = (this.supabase as any)
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .eq('institution_id', institutionId)
      .limit(20);

    if (searchTerm) {
      query = query.or(
        `full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
}
