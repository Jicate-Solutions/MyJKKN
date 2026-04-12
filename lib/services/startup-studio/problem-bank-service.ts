// lib/services/startup-studio/problem-bank-service.ts
// CRUD operations for ss_problem_bank and related tables (attempts, tags, scores, evidence)

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  SSProblemBank,
  SSProblemBankWithDetails,
  SSProblemAttempt,
  SSProblemTag,
  SSProblemScore,
  ProblemBankFilters,
  CreateProblemBankInput,
  ProblemBankStatus,
  ProblemTheme,
} from '@/types/startup-studio';

const PROBLEM_SELECT = `
  *,
  submitted_by_user:profiles(id, full_name)
`;

const PROBLEM_WITH_DETAILS_SELECT = `
  *,
  submitted_by_user:profiles(id, full_name),
  attempts:ss_problem_attempts(*),
  tags:ss_problem_tags(*),
  scores:ss_problem_scores(*),
  nif_candidate:ss_nif_candidates(*)
`;

export class ProblemBankService extends BaseService {
  // ── List problems with pagination & filters ──────────────────────────

  static async getProblems(
    filters?: ProblemBankFilters
  ): Promise<BaseListResponse<SSProblemBank>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('ss_problem_bank')
      .select(PROBLEM_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.theme) {
      query = query.eq('theme', filters.theme);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.event_id) {
      query = query.eq('event_id', filters.event_id);
    }
    if (filters?.min_severity != null) {
      query = query.gte('severity', filters.min_severity);
    }
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.or(
        `title.ilike.%${escaped}%,problem_statement.ilike.%${escaped}%`
      );
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to fetch problems: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as SSProblemBank[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  // ── Single problem with all relations ────────────────────────────────

  static async getProblemById(id: string): Promise<SSProblemBankWithDetails | null> {
    const { data, error } = await this.supabase
      .from('ss_problem_bank')
      .select(PROBLEM_WITH_DETAILS_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error('Failed to fetch problem: ' + error.message);
    }

    return data as SSProblemBankWithDetails;
  }

  // ── Create ───────────────────────────────────────────────────────────

  static async createProblem(input: CreateProblemBankInput): Promise<SSProblemBank> {
    const { data, error } = await this.supabase
      .from('ss_problem_bank')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error('Failed to create problem: ' + error.message);
    return data as SSProblemBank;
  }

  // ── Update ───────────────────────────────────────────────────────────

  static async updateProblem(
    id: string,
    input: Partial<CreateProblemBankInput & { status: ProblemBankStatus }>
  ): Promise<SSProblemBank> {
    const { data, error } = await this.supabase
      .from('ss_problem_bank')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Failed to update problem: ' + error.message);
    return data as SSProblemBank;
  }

  // ── Delete ───────────────────────────────────────────────────────────

  static async deleteProblem(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('ss_problem_bank')
      .delete()
      .eq('id', id);

    if (error) throw new Error('Failed to delete problem: ' + error.message);
  }

  // ── Attempts ─────────────────────────────────────────────────────────

  static async addAttempt(
    problemId: string,
    data: { cycle_id?: string; user_id?: string; team_name?: string }
  ): Promise<SSProblemAttempt> {
    const { data: attempt, error } = await this.supabase
      .from('ss_problem_attempts')
      .insert({ problem_id: problemId, ...data })
      .select()
      .single();

    if (error) throw new Error('Failed to add attempt: ' + error.message);
    return attempt as SSProblemAttempt;
  }

  static async updateAttempt(
    attemptId: string,
    data: Record<string, any>
  ): Promise<SSProblemAttempt> {
    const { data: updated, error } = await this.supabase
      .from('ss_problem_attempts')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', attemptId)
      .select()
      .single();

    if (error) throw new Error('Failed to update attempt: ' + error.message);
    return updated as SSProblemAttempt;
  }

  // ── Tags ─────────────────────────────────────────────────────────────

  static async addTag(
    problemId: string,
    tag: string,
    tagType: string,
    createdBy?: string
  ): Promise<SSProblemTag> {
    const { data, error } = await this.supabase
      .from('ss_problem_tags')
      .insert({
        problem_id: problemId,
        tag,
        tag_type: tagType,
        ...(createdBy ? { created_by: createdBy } : {}),
      })
      .select()
      .single();

    if (error) throw new Error('Failed to add tag: ' + error.message);
    return data as SSProblemTag;
  }

  static async removeTag(tagId: string): Promise<void> {
    const { error } = await this.supabase
      .from('ss_problem_tags')
      .delete()
      .eq('id', tagId);

    if (error) throw new Error('Failed to remove tag: ' + error.message);
  }

  // ── Scores ───────────────────────────────────────────────────────────

  static async addScore(
    problemId: string,
    data: Record<string, any>
  ): Promise<SSProblemScore> {
    // Calculate composite score from provided dimensions
    const severity = data.severity ?? 0;
    const frequency = data.frequency ?? 0;
    const solvability = data.solvability ?? 0;
    const marketSize = data.market_size ?? 0;
    const compositeScore =
      (severity + frequency + solvability + marketSize) / 4;

    const { data: score, error } = await this.supabase
      .from('ss_problem_scores')
      .insert({
        problem_id: problemId,
        ...data,
        composite_score: compositeScore,
      })
      .select()
      .single();

    if (error) throw new Error('Failed to add score: ' + error.message);
    return score as SSProblemScore;
  }

  // ── Top problems by composite score ──────────────────────────────────

  static async getTopProblems(limit: number = 10): Promise<SSProblemBank[]> {
    const { data, error } = await this.supabase
      .from('ss_problem_scores')
      .select(`
        composite_score,
        problem:ss_problem_bank(${PROBLEM_SELECT})
      `)
      .order('composite_score', { ascending: false })
      .limit(limit);

    if (error) throw new Error('Failed to fetch top problems: ' + error.message);

    // Unwrap the join — each row has { composite_score, problem: {...} }
    return (data || []).map((row: any) => ({
      ...row.problem,
      composite_score: row.composite_score,
    })) as SSProblemBank[];
  }
}

export const problemBankService = {
  getProblems: ProblemBankService.getProblems.bind(ProblemBankService),
  getProblemById: ProblemBankService.getProblemById.bind(ProblemBankService),
  createProblem: ProblemBankService.createProblem.bind(ProblemBankService),
  updateProblem: ProblemBankService.updateProblem.bind(ProblemBankService),
  deleteProblem: ProblemBankService.deleteProblem.bind(ProblemBankService),
  addAttempt: ProblemBankService.addAttempt.bind(ProblemBankService),
  updateAttempt: ProblemBankService.updateAttempt.bind(ProblemBankService),
  addTag: ProblemBankService.addTag.bind(ProblemBankService),
  removeTag: ProblemBankService.removeTag.bind(ProblemBankService),
  addScore: ProblemBankService.addScore.bind(ProblemBankService),
  getTopProblems: ProblemBankService.getTopProblems.bind(ProblemBankService),
};
