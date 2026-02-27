// lib/services/startup-studio/submissions-service.ts
// CRUD operations for ss_appathon_submissions, ss_judge_scores, and related judging tables

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  SSAppathonSubmission,
  SSJudgeScore,
  SubmissionFilters,
  CreateSubmissionInput,
  SubmissionStatus,
} from '@/types/startup-studio';

const SUBMISSION_SELECT = `
  *,
  user:profiles(id, full_name),
  event:ss_events(id, name, slug)
`;

const SUBMISSION_WITH_SCORES_SELECT = `
  *,
  user:profiles(id, full_name),
  event:ss_events(id, name, slug),
  cycle:ss_cycles(id, name),
  scores:ss_judge_scores(*, judge:profiles(id, full_name))
`;

export class SubmissionsService extends BaseService {
  /**
   * List submissions with pagination and filters
   */
  static async getSubmissions(
    filters?: SubmissionFilters
  ): Promise<BaseListResponse<SSAppathonSubmission>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('ss_appathon_submissions')
      .select(SUBMISSION_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.event_id) {
      query = query.eq('event_id', filters.event_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.or(`app_name.ilike.%${escaped}%,team_name.ilike.%${escaped}%`);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch submissions: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as SSAppathonSubmission[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  /**
   * Get a single submission with scores and user details
   */
  static async getSubmissionById(id: string): Promise<SSAppathonSubmission | null> {
    const { data, error } = await this.supabase
      .from('ss_appathon_submissions')
      .select(SUBMISSION_WITH_SCORES_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch submission: ${error.message}`);
    }

    return data as SSAppathonSubmission;
  }

  /**
   * Create a new submission with draft status
   */
  static async createSubmission(input: CreateSubmissionInput): Promise<SSAppathonSubmission> {
    const { data, error } = await this.supabase
      .from('ss_appathon_submissions')
      .insert({
        event_id: input.event_id,
        user_id: input.user_id,
        cycle_id: input.cycle_id || null,
        participation_type: input.participation_type || null,
        team_name: input.team_name || null,
        team_members: input.team_members || [],
        applicant_name: input.applicant_name || null,
        applicant_email: input.applicant_email || null,
        institution_id: input.institution_id || null,
        department: input.department || null,
        app_name: input.app_name || null,
        problem_statement: input.problem_statement || null,
        solution_summary: input.solution_summary || null,
        live_url: input.live_url || null,
        lovable_url: input.lovable_url || null,
        elevator_pitch: input.elevator_pitch || null,
        category: input.category || null,
        status: 'draft' as SubmissionStatus,
      })
      .select(SUBMISSION_SELECT)
      .single();

    if (error) throw new Error(`Failed to create submission: ${error.message}`);
    return data as SSAppathonSubmission;
  }

  /**
   * Update an existing submission
   */
  static async updateSubmission(
    id: string,
    input: Partial<CreateSubmissionInput & { status?: SubmissionStatus; score?: number }>
  ): Promise<SSAppathonSubmission> {
    const { data, error } = await this.supabase
      .from('ss_appathon_submissions')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SUBMISSION_SELECT)
      .single();

    if (error) throw new Error(`Failed to update submission: ${error.message}`);
    return data as SSAppathonSubmission;
  }

  /**
   * Submit a draft for review (sets status to 'submitted' and records timestamp)
   */
  static async submitForReview(id: string): Promise<SSAppathonSubmission> {
    const { data, error } = await this.supabase
      .from('ss_appathon_submissions')
      .update({
        status: 'submitted' as SubmissionStatus,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SUBMISSION_SELECT)
      .single();

    if (error) throw new Error(`Failed to submit for review: ${error.message}`);
    return data as SSAppathonSubmission;
  }

  /**
   * Delete a submission
   */
  static async deleteSubmission(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('ss_appathon_submissions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete submission: ${error.message}`);
  }

  /**
   * Add a judge score for a submission
   * Auto-calculates weighted_score and total_score from individual criteria
   */
  static async addJudgeScore(
    submissionId: string,
    judgeId: string,
    data: Record<string, any>
  ): Promise<SSJudgeScore> {
    const totalScore =
      (data.problem_impact || 0) +
      (data.solution_innovation || 0) +
      (data.working_prototype || 0) +
      (data.user_validation || 0) +
      (data.presentation_quality || 0) +
      (data.bioconvergence_alignment || 0);

    const { data: score, error } = await this.supabase
      .from('ss_judge_scores')
      .insert({
        submission_id: submissionId,
        judge_id: judgeId,
        track_id: data.track_id || null,
        problem_impact: data.problem_impact || null,
        solution_innovation: data.solution_innovation || null,
        working_prototype: data.working_prototype || null,
        user_validation: data.user_validation || null,
        presentation_quality: data.presentation_quality || null,
        bioconvergence_alignment: data.bioconvergence_alignment || null,
        weighted_score: totalScore,
        total_score: totalScore,
        notes: data.notes || null,
        strengths: data.strengths || null,
        improvements: data.improvements || null,
        submitted_at: new Date().toISOString(),
      })
      .select('*, judge:profiles(id, full_name)')
      .single();

    if (error) throw new Error(`Failed to add judge score: ${error.message}`);
    return score as SSJudgeScore;
  }

  /**
   * Update an existing judge score
   */
  static async updateJudgeScore(
    scoreId: string,
    data: Record<string, any>
  ): Promise<SSJudgeScore> {
    // Recalculate totals if any criteria fields are being updated
    const updates: Record<string, any> = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    // If any scoring criteria are present, recalculate total
    const hasCriteria =
      'problem_impact' in data ||
      'solution_innovation' in data ||
      'working_prototype' in data ||
      'user_validation' in data ||
      'presentation_quality' in data ||
      'bioconvergence_alignment' in data;

    if (hasCriteria) {
      // Fetch current score to merge with updates for recalculation
      const { data: current, error: fetchError } = await this.supabase
        .from('ss_judge_scores')
        .select('*')
        .eq('id', scoreId)
        .single();

      if (fetchError) throw new Error(`Failed to fetch score for update: ${fetchError.message}`);

      const merged = { ...current, ...data };
      const totalScore =
        (merged.problem_impact || 0) +
        (merged.solution_innovation || 0) +
        (merged.working_prototype || 0) +
        (merged.user_validation || 0) +
        (merged.presentation_quality || 0) +
        (merged.bioconvergence_alignment || 0);

      updates.weighted_score = totalScore;
      updates.total_score = totalScore;
    }

    const { data: score, error } = await this.supabase
      .from('ss_judge_scores')
      .update(updates)
      .eq('id', scoreId)
      .select('*, judge:profiles(id, full_name)')
      .single();

    if (error) throw new Error(`Failed to update judge score: ${error.message}`);
    return score as SSJudgeScore;
  }

  /**
   * Get leaderboard for an event, ordered by average score descending
   */
  static async getLeaderboard(eventId: string): Promise<SSAppathonSubmission[]> {
    const { data, error } = await this.supabase
      .from('ss_appathon_submissions')
      .select(SUBMISSION_WITH_SCORES_SELECT)
      .eq('event_id', eventId)
      .not('score', 'is', null)
      .order('score', { ascending: false });

    if (error) throw new Error(`Failed to fetch leaderboard: ${error.message}`);
    return (data || []) as SSAppathonSubmission[];
  }
}

export const submissionsService = {
  getSubmissions: SubmissionsService.getSubmissions.bind(SubmissionsService),
  getSubmissionById: SubmissionsService.getSubmissionById.bind(SubmissionsService),
  createSubmission: SubmissionsService.createSubmission.bind(SubmissionsService),
  updateSubmission: SubmissionsService.updateSubmission.bind(SubmissionsService),
  submitForReview: SubmissionsService.submitForReview.bind(SubmissionsService),
  deleteSubmission: SubmissionsService.deleteSubmission.bind(SubmissionsService),
  addJudgeScore: SubmissionsService.addJudgeScore.bind(SubmissionsService),
  updateJudgeScore: SubmissionsService.updateJudgeScore.bind(SubmissionsService),
  getLeaderboard: SubmissionsService.getLeaderboard.bind(SubmissionsService),
};
