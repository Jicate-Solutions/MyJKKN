// lib/services/learners-council/selection-service.ts
// LC-005: Selection & Elections - Service Layer

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LCElection,
  LCNomination,
  LCInterview,
  LCElectionVote,
  CreateElectionDto,
  CreateNominationDto,
  ElectionStatus
} from '@/types/learners-council';

export class LCSelectionService {
  private static supabase = createClientSupabaseClient();

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
    let query = this.supabase
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
    const { data, error } = await this.supabase
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
    const { data: election, error } = await this.supabase
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

    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    // Check for duplicate nomination
    const { data: existing } = await this.supabase
      .from('lc_nominations')
      .select('id')
      .eq('election_id', data.election_id)
      .eq('nominee_id', userId)
      .maybeSingle();

    if (existing) {
      throw new Error('You have already submitted a nomination for this election');
    }

    const { data: nomination, error } = await this.supabase
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
    const { data, error } = await this.supabase
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

    return data as LCNomination;
  }

  // ============================================================================
  // INTERVIEW METHODS
  // ============================================================================

  /**
   * Get interviews for a nomination
   */
  static async getInterviews(nominationId: string): Promise<LCInterview[]> {
    const { data, error } = await this.supabase
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
    const { data: interview, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    // Check if already voted for this position in this election
    const { data: existingVote } = await this.supabase
      .from('lc_election_votes')
      .select('id')
      .eq('election_id', electionId)
      .eq('voter_id', voterId)
      .eq('position_id', positionId)
      .maybeSingle();

    if (existingVote) {
      throw new Error('You have already voted for this position');
    }

    const { data, error } = await this.supabase
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
    const { data: votes, error: votesError } = await this.supabase
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
      nominee_avatar: nom.nominee?.avatar_url || null,
      position_id: nom.position_id,
      role_sought: nom.role_sought,
      vote_count: voteCounts[nom.id] || 0,
      status: nom.status
    }));

    // Sort by vote count descending
    results.sort((a, b) => b.vote_count - a.vote_count);

    return { election, results };
  }
}
