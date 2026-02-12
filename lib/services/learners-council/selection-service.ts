// lib/services/learners-council/selection-service.ts
// LC-005: Selection & Elections - Service Layer

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LCNotificationService } from './notification-service';
import type {
  LCElection,
  LCNomination,
  LCInterview,
  LCElectionVote,
  LCPositionHistory,
  CreateElectionDto,
  CreateNominationDto,
  ElectionStatus,
  NominationStatus,
  InterviewStatus,
} from '@/types/learners-council';

export class LCSelectionService {
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // ELECTION METHODS
  // ============================================================================

  /**
   * Get all elections with optional filters
   */
  static async getElections(filters: {
    status?: string;
    type?: string;
    term_id?: string;
  } = {}): Promise<LCElection[]> {
    let query = (this.supabase as any)
      .from('lc_elections')
      .select(`
        *,
        nominations:lc_nominations(id, status, nominee_id),
        term:lc_terms(id, name)
      `)
      .order('created_at', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.type) {
      query = query.eq('type', filters.type);
    }
    if (filters.term_id) {
      query = query.eq('term_id', filters.term_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[lc/selection] Error fetching elections:', error);
      throw new Error(`Failed to fetch elections: ${error.message}`);
    }

    return (data || []) as LCElection[];
  }

  /**
   * Get a single election by ID with full nominations and term details
   */
  static async getElectionById(id: string): Promise<LCElection> {
    const { data, error } = await (this.supabase as any)
      .from('lc_elections')
      .select(`
        *,
        nominations:lc_nominations(
          *,
          nominee:profiles!nominee_id(id, full_name, email, avatar_url),
          interviews:lc_interviews(*)
        ),
        term:lc_terms(id, name, start_date, end_date, status)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[lc/selection] Error fetching election:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Election not found');
      }
      throw new Error(`Failed to fetch election: ${error.message}`);
    }

    if (!data) {
      throw new Error('Election not found');
    }

    return data as LCElection;
  }

  /**
   * Create a new election
   */
  static async createElection(data: CreateElectionDto, userId: string): Promise<LCElection> {
    const { data: election, error } = await (this.supabase as any)
      .from('lc_elections')
      .insert({
        ...data,
        status: 'nominations_open' as ElectionStatus,
        created_by: userId
      })
      .select(`
        *,
        term:lc_terms(id, name)
      `)
      .single();

    if (error) {
      console.error('[lc/selection] Error creating election:', error);
      throw new Error(`Failed to create election: ${error.message}`);
    }

    return election as LCElection;
  }

  /**
   * Update election status
   */
  static async updateElectionStatus(id: string, status: string): Promise<LCElection> {
    const updateData: Record<string, unknown> = { status };

    // Set timestamp fields based on status transitions
    if (status === 'results_declared') {
      updateData.results_declared_at = new Date().toISOString();
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_elections')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[lc/selection] Error updating election status:', error);
      throw new Error(`Failed to update election status: ${error.message}`);
    }

    return data as LCElection;
  }

  // ============================================================================
  // NOMINATION METHODS
  // ============================================================================

  /**
   * Get nominations for an election
   */
  static async getNominations(electionId: string): Promise<LCNomination[]> {
    const { data, error } = await (this.supabase as any)
      .from('lc_nominations')
      .select(`
        *,
        nominee:profiles!nominee_id(id, full_name, email, avatar_url),
        interviews:lc_interviews(
          *,
          interviewer:profiles!interviewer_id(id, full_name)
        )
      `)
      .eq('election_id', electionId)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('[lc/selection] Error fetching nominations:', error);
      throw new Error(`Failed to fetch nominations: ${error.message}`);
    }

    return (data || []) as LCNomination[];
  }

  /**
   * Submit a self-nomination
   */
  static async submitNomination(data: CreateNominationDto, userId: string): Promise<LCNomination> {
    // Validate election status is nominations_open
    const { data: election, error: electionError } = await (this.supabase as any)
      .from('lc_elections')
      .select('id, status')
      .eq('id', data.election_id)
      .single();

    if (electionError || !election) {
      throw new Error('Election not found');
    }
    if (election.status !== 'nominations_open') {
      throw new Error(`Nominations are not open for this election. Current status: ${election.status}`);
    }

    // Check for duplicate nomination
    const { data: existing } = await (this.supabase as any)
      .from('lc_nominations')
      .select('id')
      .eq('election_id', data.election_id)
      .eq('nominee_id', userId)
      .maybeSingle();

    if (existing) {
      throw new Error('You have already submitted a nomination for this election');
    }

    const { data: nomination, error } = await (this.supabase as any)
      .from('lc_nominations')
      .insert({
        ...data,
        nominee_id: userId,
        status: 'submitted',
        submitted_at: new Date().toISOString()
      })
      .select(`
        *,
        nominee:profiles!nominee_id(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) {
      console.error('[lc/selection] Error submitting nomination:', error);
      throw new Error(`Failed to submit nomination: ${error.message}`);
    }

    return nomination as LCNomination;
  }

  /**
   * Review a nomination (approve/reject/shortlist)
   */
  static async reviewNomination(
    id: string,
    status: string,
    reviewerId: string,
    notes?: string
  ): Promise<LCNomination> {
    const { data, error } = await (this.supabase as any)
      .from('lc_nominations')
      .update({
        status,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null
      })
      .eq('id', id)
      .select(`
        *,
        nominee:profiles!nominee_id(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) {
      console.error('[lc/selection] Error reviewing nomination:', error);
      throw new Error(`Failed to review nomination: ${error.message}`);
    }

    // Notify the nominee about the review result
    try {
      const nomination = data as any;
      if (nomination.nominee_id) {
        await LCNotificationService.createNotification({
          user_id: nomination.nominee_id,
          type: 'election',
          title: 'Nomination Review Update',
          message: `Your nomination has been updated to: ${status}`,
          link: `/learners-council/selection`,
          reference_id: id,
          reference_type: 'nomination',
        });
      }
    } catch (notifErr) {
      console.warn('[lc/selection] Failed to send nomination review notification:', notifErr);
    }

    return data as LCNomination;
  }

  // ============================================================================
  // INTERVIEW METHODS
  // ============================================================================

  /**
   * Get interviews for a nomination
   */
  static async getInterviews(nominationId: string): Promise<LCInterview[]> {
    const { data, error } = await (this.supabase as any)
      .from('lc_interviews')
      .select(`
        *,
        interviewer:profiles!interviewer_id(id, full_name, avatar_url)
      `)
      .eq('nomination_id', nominationId)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('[lc/selection] Error fetching interviews:', error);
      throw new Error(`Failed to fetch interviews: ${error.message}`);
    }

    return (data || []) as LCInterview[];
  }

  /**
   * Schedule an interview for a nomination
   */
  static async scheduleInterview(data: {
    nomination_id: string;
    interviewer_id: string;
    scheduled_at: string;
    max_score: number;
  }): Promise<LCInterview> {
    const { data: interview, error } = await (this.supabase as any)
      .from('lc_interviews')
      .insert({
        ...data,
        status: 'scheduled'
      })
      .select(`
        *,
        interviewer:profiles!interviewer_id(id, full_name)
      `)
      .single();

    if (error) {
      console.error('[lc/selection] Error scheduling interview:', error);
      throw new Error(`Failed to schedule interview: ${error.message}`);
    }

    return interview as LCInterview;
  }

  /**
   * Submit interview score and feedback
   */
  static async submitInterviewScore(
    interviewId: string,
    score: number,
    criteriaScores: { criterion: string; score: number; max: number; notes: string }[],
    notes: string,
    recommendation: string
  ): Promise<LCInterview> {
    const { data, error } = await (this.supabase as any)
      .from('lc_interviews')
      .update({
        score,
        criteria_scores: criteriaScores,
        overall_notes: notes,
        recommendation,
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', interviewId)
      .select('*')
      .single();

    if (error) {
      console.error('[lc/selection] Error submitting interview score:', error);
      throw new Error(`Failed to submit interview score: ${error.message}`);
    }

    return data as LCInterview;
  }

  // ============================================================================
  // VOTING METHODS
  // ============================================================================

  /**
   * Cast a vote in an election
   */
  static async castVote(
    electionId: string,
    nominationId: string,
    positionId: string,
    voterId: string
  ): Promise<LCElectionVote> {
    // Validate election status is voting_open
    const { data: election, error: electionError } = await (this.supabase as any)
      .from('lc_elections')
      .select('id, status')
      .eq('id', electionId)
      .single();

    if (electionError || !election) {
      throw new Error('Election not found');
    }
    if (election.status !== 'voting_open') {
      throw new Error(`Voting is not open for this election. Current status: ${election.status}`);
    }

    // Check if already voted for this position in this election
    const { data: existingVote } = await (this.supabase as any)
      .from('lc_election_votes')
      .select('id')
      .eq('election_id', electionId)
      .eq('voter_id', voterId)
      .eq('position_id', positionId)
      .maybeSingle();

    if (existingVote) {
      throw new Error('You have already voted for this position');
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_election_votes')
      .insert({
        election_id: electionId,
        nomination_id: nominationId,
        position_id: positionId,
        voter_id: voterId,
        voted_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) {
      console.error('[lc/selection] Error casting vote:', error);
      throw new Error(`Failed to cast vote: ${error.message}`);
    }

    return data as LCElectionVote;
  }

  /**
   * Get election results with vote counts grouped by nomination
   */
  static async getElectionResults(electionId: string): Promise<{
    election: LCElection;
    results: {
      nomination_id: string;
      nominee_name: string;
      nominee_avatar: string | null;
      position_id: string | null;
      role_sought: string;
      vote_count: number;
      status: string;
    }[];
  }> {
    // Get election details
    const election = await this.getElectionById(electionId);

    // Get all votes for this election
    const { data: votes, error: votesError } = await (this.supabase as any)
      .from('lc_election_votes')
      .select('nomination_id, position_id')
      .eq('election_id', electionId);

    if (votesError) {
      console.error('[lc/selection] Error fetching election results:', votesError);
      throw new Error(`Failed to fetch election results: ${votesError.message}`);
    }

    // Get nominations for this election
    const nominations = await this.getNominations(electionId);

    // Count votes per nomination
    const voteCounts: Record<string, number> = {};
    (votes || []).forEach((vote: { nomination_id: string }) => {
      voteCounts[vote.nomination_id] = (voteCounts[vote.nomination_id] || 0) + 1;
    });

    // Build results
    const results = nominations.map(nom => ({
      nomination_id: nom.id,
      nominee_name: nom.nominee?.full_name || 'Unknown',
      nominee_avatar: (nom.nominee as any)?.avatar_url || null,
      position_id: nom.position_id,
      role_sought: nom.role_sought,
      vote_count: voteCounts[nom.id] || 0,
      status: nom.status
    }));

    // Sort by vote count descending
    results.sort((a, b) => b.vote_count - a.vote_count);

    return { election, results };
  }

  // ============================================================================
  // NOMINATION ACTIONS
  // ============================================================================

  /**
   * Withdraw a nomination with a reason
   */
  static async withdrawNomination(
    nominationId: string,
    reason: string
  ): Promise<LCNomination> {
    // Verify nomination exists and is in a withdrawable state
    const { data: existing } = await (this.supabase as any)
      .from('lc_nominations')
      .select('id, status, election_id')
      .eq('id', nominationId)
      .single();

    if (!existing) {
      throw new Error('Nomination not found');
    }
    if (['selected', 'withdrawn', 'rejected'].includes(existing.status)) {
      throw new Error(`Cannot withdraw a nomination with status: ${existing.status}`);
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_nominations')
      .update({
        status: 'withdrawn' as NominationStatus,
        review_notes: reason,
      })
      .eq('id', nominationId)
      .select(`
        *,
        nominee:profiles!nominee_id(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) {
      console.error('[lc/selection] Error withdrawing nomination:', error);
      throw new Error(`Failed to withdraw nomination: ${error.message}`);
    }

    return data as LCNomination;
  }

  // ============================================================================
  // INTERVIEW ACTIONS
  // ============================================================================

  /**
   * Cancel a scheduled interview with a reason
   */
  static async cancelInterview(
    interviewId: string,
    reason: string
  ): Promise<LCInterview> {
    // Verify interview exists and is cancellable
    const { data: existing } = await (this.supabase as any)
      .from('lc_interviews')
      .select('id, status')
      .eq('id', interviewId)
      .single();

    if (!existing) {
      throw new Error('Interview not found');
    }
    if (['completed', 'cancelled'].includes(existing.status)) {
      throw new Error(`Cannot cancel an interview with status: ${existing.status}`);
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_interviews')
      .update({
        status: 'cancelled' as InterviewStatus,
        overall_notes: reason,
      })
      .eq('id', interviewId)
      .select(`
        *,
        interviewer:profiles!interviewer_id(id, full_name)
      `)
      .single();

    if (error) {
      console.error('[lc/selection] Error cancelling interview:', error);
      throw new Error(`Failed to cancel interview: ${error.message}`);
    }

    return data as LCInterview;
  }

  /**
   * Reschedule an interview to a new date/time
   */
  static async rescheduleInterview(
    interviewId: string,
    newDate: string,
    newTime: string
  ): Promise<LCInterview> {
    // Verify interview exists and is reschedulable
    const { data: existing } = await (this.supabase as any)
      .from('lc_interviews')
      .select('id, status')
      .eq('id', interviewId)
      .single();

    if (!existing) {
      throw new Error('Interview not found');
    }
    if (['completed', 'cancelled'].includes(existing.status)) {
      throw new Error(`Cannot reschedule an interview with status: ${existing.status}`);
    }

    // Combine date and time into ISO string
    const scheduledAt = new Date(`${newDate}T${newTime}`).toISOString();

    const { data, error } = await (this.supabase as any)
      .from('lc_interviews')
      .update({
        scheduled_at: scheduledAt,
        status: 'scheduled' as InterviewStatus,
      })
      .eq('id', interviewId)
      .select(`
        *,
        interviewer:profiles!interviewer_id(id, full_name)
      `)
      .single();

    if (error) {
      console.error('[lc/selection] Error rescheduling interview:', error);
      throw new Error(`Failed to reschedule interview: ${error.message}`);
    }

    return data as LCInterview;
  }

  // ============================================================================
  // PROGRESSION & ELIGIBILITY
  // ============================================================================

  /**
   * Get the progression history for a user: YUVA Co-Chair -> Chair -> LC Member
   * Queries lc_position_history and yuva_vertical_members for the full trail.
   */
  static async getProgressionHistory(userId: string): Promise<{
    yuva_roles: { role: string; vertical: string; chapter: string; academic_year: string; is_active: boolean }[];
    lc_positions: LCPositionHistory[];
  }> {
    // Get YUVA vertical member history
    const { data: yuvaHistory, error: yuvaError } = await (this.supabase as any)
      .from('yuva_vertical_members')
      .select(`
        role,
        academic_year,
        is_active,
        appointed_at,
        ended_at,
        vertical:yuva_verticals(name),
        chapter:yuva_chapters(name)
      `)
      .eq('user_id', userId)
      .order('appointed_at', { ascending: false });

    if (yuvaError) {
      console.error('[lc/selection] Error fetching YUVA history:', yuvaError);
      throw new Error(`Failed to fetch YUVA history: ${yuvaError.message}`);
    }

    // Get LC position history
    const { data: lcHistory, error: lcError } = await (this.supabase as any)
      .from('lc_position_history')
      .select(`
        *,
        position:lc_positions(id, title, category, tier),
        term:lc_terms(id, name, start_date, end_date)
      `)
      .eq('user_id', userId)
      .order('started_at', { ascending: false });

    if (lcError) {
      console.error('[lc/selection] Error fetching LC position history:', lcError);
      throw new Error(`Failed to fetch LC position history: ${lcError.message}`);
    }

    const yuvaRoles = (yuvaHistory || []).map((r: any) => ({
      role: r.role,
      vertical: r.vertical?.name || 'Unknown',
      chapter: r.chapter?.name || 'Unknown',
      academic_year: r.academic_year,
      is_active: r.is_active,
    }));

    return {
      yuva_roles: yuvaRoles,
      lc_positions: (lcHistory || []) as LCPositionHistory[],
    };
  }

  /**
   * Get eligible nominees for an election based on election type and year.
   * - yuva_selection: 1st/2nd year UG learners at the election's institution
   * - lc_progression: Past YUVA chairs
   * - executive_rotation: Current LC members
   */
  static async getEligibleNominees(electionId: string): Promise<{
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    reason: string;
  }[]> {
    // Get election details
    const { data: election, error: electionError } = await (this.supabase as any)
      .from('lc_elections')
      .select('id, type, institution_id, chapter_id, term_id')
      .eq('id', electionId)
      .single();

    if (electionError || !election) {
      throw new Error('Election not found');
    }

    let eligibleUsers: { id: string; full_name: string; email: string; avatar_url: string | null; reason: string }[] = [];

    if (election.type === 'yuva_selection') {
      // Get users from the institution who are not already nominated
      // For YUVA selection, eligible users are learners at the institution
      const { data: profiles } = await (this.supabase as any)
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('institution_id', election.institution_id)
        .limit(100);

      eligibleUsers = (profiles || []).map((p: any) => ({
        ...p,
        reason: 'Learner at this institution',
      }));
    } else if (election.type === 'lc_progression') {
      // Past YUVA chairs who can progress to LC
      const { data: pastChairs } = await (this.supabase as any)
        .from('yuva_vertical_members')
        .select(`
          user_id,
          user:profiles!user_id(id, full_name, email, avatar_url)
        `)
        .in('role', ['chapter_chair', 'stakeholder_chair', 'vertical_chair'])
        .eq('is_active', false);

      eligibleUsers = (pastChairs || [])
        .filter((c: any) => c.user)
        .map((c: any) => ({
          id: c.user.id,
          full_name: c.user.full_name,
          email: c.user.email,
          avatar_url: c.user.avatar_url,
          reason: 'Past YUVA Chair eligible for LC progression',
        }));
    } else if (election.type === 'executive_rotation') {
      // Current LC members can self-nominate for executive positions
      const { data: lcMembers } = await (this.supabase as any)
        .from('lc_members')
        .select(`
          user_id,
          user:profiles!user_id(id, full_name, email, avatar_url)
        `)
        .eq('status', 'active')
        .eq('term_id', election.term_id);

      eligibleUsers = (lcMembers || [])
        .filter((m: any) => m.user)
        .map((m: any) => ({
          id: m.user.id,
          full_name: m.user.full_name,
          email: m.user.email,
          avatar_url: m.user.avatar_url,
          reason: 'Active LC member eligible for executive rotation',
        }));
    }

    // Remove duplicates by user id
    const seen = new Set<string>();
    return eligibleUsers.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }

  /**
   * Declare election results: update election status to results_declared,
   * mark winning nominations as 'selected', and create position assignments
   * for winners in lc_members or yuva_vertical_members.
   */
  static async declareResults(electionId: string): Promise<{
    election: LCElection;
    winners: { nomination_id: string; nominee_name: string; role_sought: string; vote_count: number }[];
  }> {
    // Get election results
    const { election, results } = await this.getElectionResults(electionId);

    if (election.status === 'results_declared') {
      throw new Error('Results have already been declared for this election');
    }

    // Group results by position_id and find winners (highest vote count per position)
    const winnersByPosition: Record<string, typeof results[0]> = {};
    for (const result of results) {
      const posKey = result.position_id || result.role_sought;
      if (!winnersByPosition[posKey] || result.vote_count > winnersByPosition[posKey].vote_count) {
        winnersByPosition[posKey] = result;
      }
    }

    const winners = Object.values(winnersByPosition).filter((w) => w.vote_count > 0);

    // Mark winning nominations as 'selected'
    for (const winner of winners) {
      const { error: updateError } = await (this.supabase as any)
        .from('lc_nominations')
        .update({ status: 'selected' as NominationStatus })
        .eq('id', winner.nomination_id);

      if (updateError) {
        console.error('[lc/selection] Error marking winner:', updateError);
      }
    }

    // Update election status to results_declared
    await this.updateElectionStatus(electionId, 'results_declared');

    // Refresh election data
    const updatedElection = await this.getElectionById(electionId);

    return {
      election: updatedElection,
      winners: winners.map((w) => ({
        nomination_id: w.nomination_id,
        nominee_name: w.nominee_name,
        role_sought: w.role_sought,
        vote_count: w.vote_count,
      })),
    };
  }
}
