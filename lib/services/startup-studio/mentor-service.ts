// lib/services/startup-studio/mentor-service.ts
// CRUD operations for ss_mentors, ss_mentor_matches, ss_mentor_sessions

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  SSMentor,
  SSMentorMatch,
  SSMentorSession,
  MentorFilters,
  CreateMentorInput,
  UpdateMentorInput,
  CreateMatchInput,
  LogSessionInput,
  MatchStatus,
  MentorDashboardData,
} from '@/types/startup-studio';

const MENTOR_SELECT = '*';

const MENTOR_WITH_MATCHES_SELECT = `
  *,
  matches:ss_mentor_matches(
    *,
    candidate:ss_nif_candidates(id, startup_name, stage)
  )
`;

const MATCH_WITH_MENTOR_SELECT = `
  *,
  mentor:ss_mentors(id, name, email, mentor_type, domain_expertise, status)
`;

const MATCH_WITH_CANDIDATE_SELECT = `
  *,
  candidate:ss_nif_candidates(id, startup_name, stage)
`;

export class MentorService extends BaseService {
  /**
   * List mentors with optional filters and pagination
   */
  static async getMentors(
    filters?: MentorFilters
  ): Promise<BaseListResponse<SSMentor>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('ss_mentors')
      .select(MENTOR_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.mentor_type) {
      query = query.eq('mentor_type', filters.mentor_type);
    }
    if (filters?.domain) {
      query = query.contains('domain_expertise', [filters.domain]);
    }
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,organization.ilike.%${escaped}%`);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to fetch mentors: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as SSMentor[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  /**
   * Fetch a single mentor by ID with their matches
   */
  static async getMentorById(id: string): Promise<SSMentor | null> {
    const { data, error } = await this.supabase
      .from('ss_mentors')
      .select(MENTOR_WITH_MATCHES_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error('Failed to fetch mentor: ' + error.message);
    }

    return data as SSMentor;
  }

  /**
   * Create a new mentor
   */
  static async createMentor(input: CreateMentorInput): Promise<SSMentor> {
    const { data, error } = await this.supabase
      .from('ss_mentors')
      .insert({
        ...input,
        status: 'prospect' as const,
        current_mentees: 0,
        total_sessions: 0,
        total_hours: 0,
        startups_mentored: 0,
        successful_exits: 0,
        orientation_completed: false,
        nda_signed: false,
        agreement_signed: false,
        domain_expertise: input.domain_expertise || [],
        functional_expertise: input.functional_expertise || [],
        max_mentees: input.max_mentees ?? 3,
        preferred_session_frequency: input.preferred_session_frequency ?? 'biweekly',
        preferred_session_mode: input.preferred_session_mode ?? 'virtual',
      })
      .select(MENTOR_SELECT)
      .single();

    if (error) throw new Error('Failed to create mentor: ' + error.message);
    return data as SSMentor;
  }

  /**
   * Update an existing mentor
   */
  static async updateMentor(id: string, input: UpdateMentorInput): Promise<SSMentor> {
    const { data, error } = await this.supabase
      .from('ss_mentors')
      .update(input)
      .eq('id', id)
      .select(MENTOR_SELECT)
      .single();

    if (error) throw new Error('Failed to update mentor: ' + error.message);
    return data as SSMentor;
  }

  /**
   * Onboard a mentor: set status to 'onboarded' and timestamp
   */
  static async onboardMentor(id: string): Promise<SSMentor> {
    const { data, error } = await this.supabase
      .from('ss_mentors')
      .update({
        status: 'onboarded' as const,
        onboarded_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(MENTOR_SELECT)
      .single();

    if (error) throw new Error('Failed to onboard mentor: ' + error.message);
    return data as SSMentor;
  }

  /**
   * Create a mentor-candidate match
   */
  static async createMatch(input: CreateMatchInput): Promise<SSMentorMatch> {
    const { data, error } = await this.supabase
      .from('ss_mentor_matches')
      .insert({
        mentor_id: input.mentor_id,
        candidate_id: input.candidate_id,
        status: 'proposed' as const,
        match_reason: input.match_reason || null,
        matched_by: input.matched_by || null,
        matched_at: new Date().toISOString(),
        primary_goal: input.primary_goal || null,
        expected_duration_months: input.expected_duration_months || null,
        session_frequency: input.session_frequency || 'biweekly',
        sessions_completed: 0,
        goals_met: [],
        goals_pending: [],
      })
      .select(MATCH_WITH_MENTOR_SELECT)
      .single();

    if (error) throw new Error('Failed to create mentor match: ' + error.message);

    // Increment mentor's current_mentees counter
    await this.supabase.rpc('increment_field', {
      table_name: 'ss_mentors',
      row_id: input.mentor_id,
      field_name: 'current_mentees',
      amount: 1,
    }).then(({ error: rpcError }) => {
      // Fallback: manual increment if RPC doesn't exist
      if (rpcError) {
        return this.supabase
          .from('ss_mentors')
          .select('current_mentees')
          .eq('id', input.mentor_id)
          .single()
          .then(({ data: mentor }) => {
            if (mentor) {
              return this.supabase
                .from('ss_mentors')
                .update({ current_mentees: (mentor.current_mentees || 0) + 1 })
                .eq('id', input.mentor_id);
            }
          });
      }
    });

    return data as SSMentorMatch;
  }

  /**
   * Update match status with lifecycle timestamps
   */
  static async updateMatchStatus(
    matchId: string,
    status: MatchStatus,
    reason?: string
  ): Promise<SSMentorMatch> {
    const updatePayload: Record<string, any> = { status };

    switch (status) {
      case 'active':
        updatePayload.started_at = new Date().toISOString();
        break;
      case 'paused':
        updatePayload.paused_at = new Date().toISOString();
        if (reason) updatePayload.pause_reason = reason;
        break;
      case 'completed':
        updatePayload.completed_at = new Date().toISOString();
        if (reason) updatePayload.completion_reason = reason;
        break;
      case 'terminated':
        updatePayload.terminated_at = new Date().toISOString();
        if (reason) updatePayload.termination_reason = reason;
        break;
    }

    const { data, error } = await this.supabase
      .from('ss_mentor_matches')
      .update(updatePayload)
      .eq('id', matchId)
      .select(MATCH_WITH_MENTOR_SELECT)
      .single();

    if (error) throw new Error('Failed to update match status: ' + error.message);

    // If match ended, decrement mentor's current_mentees
    if (status === 'completed' || status === 'terminated') {
      const mentorId = data.mentor_id;
      const { data: mentor } = await this.supabase
        .from('ss_mentors')
        .select('current_mentees')
        .eq('id', mentorId)
        .single();

      if (mentor && mentor.current_mentees > 0) {
        await this.supabase
          .from('ss_mentors')
          .update({ current_mentees: mentor.current_mentees - 1 })
          .eq('id', mentorId);
      }
    }

    return data as SSMentorMatch;
  }

  /**
   * Get matches for a NIF candidate (with mentor info joined)
   */
  static async getMatchesForCandidate(candidateId: string): Promise<SSMentorMatch[]> {
    const { data, error } = await this.supabase
      .from('ss_mentor_matches')
      .select(MATCH_WITH_MENTOR_SELECT)
      .eq('candidate_id', candidateId)
      .order('matched_at', { ascending: false });

    if (error) throw new Error('Failed to fetch matches for candidate: ' + error.message);
    return (data || []) as SSMentorMatch[];
  }

  /**
   * Get matches for a mentor (with candidate info joined)
   */
  static async getMatchesForMentor(mentorId: string): Promise<SSMentorMatch[]> {
    const { data, error } = await this.supabase
      .from('ss_mentor_matches')
      .select(MATCH_WITH_CANDIDATE_SELECT)
      .eq('mentor_id', mentorId)
      .order('matched_at', { ascending: false });

    if (error) throw new Error('Failed to fetch matches for mentor: ' + error.message);
    return (data || []) as SSMentorMatch[];
  }

  /**
   * Log a mentoring session
   */
  static async logSession(input: LogSessionInput): Promise<SSMentorSession> {
    const { data, error } = await this.supabase
      .from('ss_mentor_sessions')
      .insert({
        match_id: input.match_id,
        session_date: input.session_date,
        duration_minutes: input.duration_minutes,
        mode: input.mode || 'virtual',
        location: input.location || null,
        topics_discussed: input.topics_discussed || [],
        key_takeaways: input.key_takeaways || null,
        action_items: input.action_items || [],
        blockers_identified: input.blockers_identified || [],
        focus_area: input.focus_area || null,
        mentee_progress_notes: input.mentee_progress_notes || null,
        next_session_date: input.next_session_date || null,
        mentor_rating_of_session: input.mentor_rating_of_session || null,
        mentee_rating_of_session: input.mentee_rating_of_session || null,
        recorded_by: input.recorded_by || null,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to log mentor session: ' + error.message);

    // Increment sessions_completed on match
    const { data: match } = await this.supabase
      .from('ss_mentor_matches')
      .select('sessions_completed, mentor_id')
      .eq('id', input.match_id)
      .single();

    if (match) {
      await this.supabase
        .from('ss_mentor_matches')
        .update({ sessions_completed: (match.sessions_completed || 0) + 1 })
        .eq('id', input.match_id);

      // Increment mentor's total_sessions and total_hours
      const { data: mentor } = await this.supabase
        .from('ss_mentors')
        .select('total_sessions, total_hours')
        .eq('id', match.mentor_id)
        .single();

      if (mentor) {
        const hoursToAdd = Math.round((input.duration_minutes / 60) * 100) / 100;
        await this.supabase
          .from('ss_mentors')
          .update({
            total_sessions: (mentor.total_sessions || 0) + 1,
            total_hours: Math.round(((mentor.total_hours || 0) + hoursToAdd) * 100) / 100,
          })
          .eq('id', match.mentor_id);
      }
    }

    return data as SSMentorSession;
  }

  /**
   * Get session history for a match
   */
  static async getSessionHistory(matchId: string): Promise<SSMentorSession[]> {
    const { data, error } = await this.supabase
      .from('ss_mentor_sessions')
      .select('*')
      .eq('match_id', matchId)
      .order('session_date', { ascending: false });

    if (error) throw new Error('Failed to fetch session history: ' + error.message);
    return (data || []) as SSMentorSession[];
  }

  /**
   * Suggest mentors for a NIF candidate based on problem theme matching
   */
  static async suggestMentorsForCandidate(candidateId: string): Promise<SSMentor[]> {
    // Fetch candidate to find their problem theme
    const { data: candidate, error: candidateError } = await this.supabase
      .from('ss_nif_candidates')
      .select('problem_id, ss_problem_bank(theme)')
      .eq('id', candidateId)
      .single();

    if (candidateError) throw new Error('Failed to fetch candidate: ' + candidateError.message);

    // Map problem theme to domain expertise keywords
    const theme = (candidate as any)?.ss_problem_bank?.theme as string | undefined;

    // Fetch onboarded mentors with capacity
    let query = this.supabase
      .from('ss_mentors')
      .select(MENTOR_SELECT)
      .eq('status', 'onboarded')
      .order('avg_mentee_rating', { ascending: false, nullsFirst: false });

    const { data: mentors, error: mentorError } = await query;
    if (mentorError) throw new Error('Failed to fetch mentors for suggestions: ' + mentorError.message);

    // Filter: must have capacity (current_mentees < max_mentees)
    const available = (mentors || []).filter(
      (m: any) => m.current_mentees < m.max_mentees
    );

    // If we have a theme, prioritise mentors whose domain_expertise contains it
    if (theme && available.length > 0) {
      const themeNormalized = theme.toLowerCase();
      const matched = available.filter(
        (m: any) => Array.isArray(m.domain_expertise) &&
          m.domain_expertise.some((d: string) => d.toLowerCase().includes(themeNormalized))
      );
      const unmatched = available.filter(
        (m: any) => !matched.includes(m)
      );
      return [...matched, ...unmatched] as SSMentor[];
    }

    return available as SSMentor[];
  }

  /**
   * Aggregated mentor dashboard data
   */
  static async getMentorDashboard(): Promise<MentorDashboardData> {
    // Fetch all mentors
    const { data: mentors, error: mentorsError } = await this.supabase
      .from('ss_mentors')
      .select('id, name, status, current_mentees, max_mentees, domain_expertise, avg_mentee_rating');

    if (mentorsError) throw new Error('Failed to fetch mentor dashboard: ' + mentorsError.message);

    const allMentors = mentors || [];
    const activeMentors = allMentors.filter((m: any) => m.status === 'onboarded');

    // Fetch active matches
    const { count: activeMatchCount, error: matchError } = await this.supabase
      .from('ss_mentor_matches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    if (matchError) throw new Error('Failed to fetch active matches: ' + matchError.message);

    // Fetch sessions this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: sessionsThisMonth, error: sessionError } = await this.supabase
      .from('ss_mentor_sessions')
      .select('id', { count: 'exact', head: true })
      .gte('session_date', monthStart);

    if (sessionError) throw new Error('Failed to fetch sessions this month: ' + sessionError.message);

    // Average satisfaction from active mentors
    const ratings = activeMentors
      .filter((m: any) => m.avg_mentee_rating !== null)
      .map((m: any) => m.avg_mentee_rating as number);
    const avgSatisfaction = ratings.length > 0
      ? Math.round((ratings.reduce((s: number, v: number) => s + v, 0) / ratings.length) * 10) / 10
      : null;

    // Top domains
    const domainCounts: Record<string, number> = {};
    for (const m of allMentors) {
      if (Array.isArray((m as any).domain_expertise)) {
        for (const d of (m as any).domain_expertise) {
          domainCounts[d] = (domainCounts[d] || 0) + 1;
        }
      }
    }
    const topDomains = Object.entries(domainCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Utilization
    const utilization = activeMentors.map((m: any) => ({
      mentor_id: m.id as string,
      name: m.name as string,
      current_mentees: (m.current_mentees || 0) as number,
      max_mentees: (m.max_mentees || 3) as number,
      utilization_pct: m.max_mentees > 0
        ? Math.round(((m.current_mentees || 0) / m.max_mentees) * 100)
        : 0,
    }));

    return {
      total_mentors: allMentors.length,
      active_mentors: activeMentors.length,
      active_matches: activeMatchCount || 0,
      sessions_this_month: sessionsThisMonth || 0,
      avg_satisfaction: avgSatisfaction,
      top_domains: topDomains,
      utilization,
    };
  }
}

export const mentorService = {
  getMentors: MentorService.getMentors.bind(MentorService),
  getMentorById: MentorService.getMentorById.bind(MentorService),
  createMentor: MentorService.createMentor.bind(MentorService),
  updateMentor: MentorService.updateMentor.bind(MentorService),
  onboardMentor: MentorService.onboardMentor.bind(MentorService),
  createMatch: MentorService.createMatch.bind(MentorService),
  updateMatchStatus: MentorService.updateMatchStatus.bind(MentorService),
  getMatchesForCandidate: MentorService.getMatchesForCandidate.bind(MentorService),
  getMatchesForMentor: MentorService.getMatchesForMentor.bind(MentorService),
  logSession: MentorService.logSession.bind(MentorService),
  getSessionHistory: MentorService.getSessionHistory.bind(MentorService),
  suggestMentorsForCandidate: MentorService.suggestMentorsForCandidate.bind(MentorService),
  getMentorDashboard: MentorService.getMentorDashboard.bind(MentorService),
};
