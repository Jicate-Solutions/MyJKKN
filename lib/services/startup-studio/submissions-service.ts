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
  user:profiles!user_id(id, full_name),
  event:ss_events!event_id(id, name, slug)
`;

const SUBMISSION_WITH_SCORES_SELECT = `
  *,
  user:profiles!user_id(id, full_name),
  event:ss_events!event_id(id, name, slug),
  cycle:ss_cycles!cycle_id(id, name),
  scores:ss_judge_scores!submission_id(*, judge:profiles!judge_id(id, full_name))
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
        github_repo_url: input.github_repo_url || null,
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
   * Judging criteria weights (must sum to 1.0)
   * Matches ops plan: Real Problem 25%, Working App 25%, User Tested 20%, Completeness 15%, Presentation 15%
   */
  static readonly CRITERIA_WEIGHTS = {
    real_problem: 0.25,
    working_app: 0.25,
    user_tested: 0.20,
    completeness: 0.15,
    presentation: 0.15,
  } as const;

  /**
   * Calculate weighted score from individual criteria (each 1-5).
   * Returns a score out of 100: (weighted_average / 5) * 100
   */
  static calculateWeightedScore(data: Record<string, any>): number {
    const weightedSum =
      (data.real_problem || 0) * this.CRITERIA_WEIGHTS.real_problem +
      (data.working_app || 0) * this.CRITERIA_WEIGHTS.working_app +
      (data.user_tested || 0) * this.CRITERIA_WEIGHTS.user_tested +
      (data.completeness || 0) * this.CRITERIA_WEIGHTS.completeness +
      (data.presentation || 0) * this.CRITERIA_WEIGHTS.presentation;
    // weightedSum is on a 1-5 scale; multiply by 20 to get 0-100
    return Math.round(weightedSum * 20 * 100) / 100;
  }

  /**
   * Add a judge score for a submission
   * Auto-calculates weighted_score and total_score from 5 criteria (each 1-5)
   * Criteria: real_problem (25%), working_app (25%), user_tested (20%), completeness (15%), presentation (15%)
   */
  static async addJudgeScore(
    submissionId: string,
    judgeId: string,
    data: Record<string, any>
  ): Promise<SSJudgeScore> {
    const weightedScore = this.calculateWeightedScore(data);

    const { data: score, error } = await this.supabase
      .from('ss_judge_scores')
      .insert({
        submission_id: submissionId,
        judge_id: judgeId,
        track_id: data.track_id || null,
        real_problem: data.real_problem || null,
        working_app: data.working_app || null,
        user_tested: data.user_tested || null,
        completeness: data.completeness || null,
        presentation: data.presentation || null,
        weighted_score: weightedScore,
        total_score: weightedScore,
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
      'real_problem' in data ||
      'working_app' in data ||
      'user_tested' in data ||
      'completeness' in data ||
      'presentation' in data;

    if (hasCriteria) {
      // Fetch current score to merge with updates for recalculation
      const { data: current, error: fetchError } = await this.supabase
        .from('ss_judge_scores')
        .select('*')
        .eq('id', scoreId)
        .single();

      if (fetchError) throw new Error(`Failed to fetch score for update: ${fetchError.message}`);

      const merged = { ...current, ...data };
      const weightedScore = this.calculateWeightedScore(merged);

      updates.weighted_score = weightedScore;
      updates.total_score = weightedScore;
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
