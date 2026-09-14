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

/**
 * What a caller may send when scoring a problem — the columns
 * ss_problem_scores actually has. composite_score is deliberately absent: it
 * is a generated column and supplying it makes the insert fail. Typed rather
 * than Record<string, any> because that is what let four field names that
 * never existed pass typecheck for six months.
 */
export interface ProblemScoreInput {
  severity_score?: number | null;
  validation_score?: number | null;
  uniqueness_score?: number | null;
  feasibility_score?: number | null;
  impact_potential_score?: number | null;
  scored_by?: string;
  scored_by_user?: string | null;
  notes?: string | null;
}

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
      // A NULL institution_id means "shared across the platform", not
      // "belongs to nobody". The list API always passes the caller's
      // institution (app/api/startup-studio/problem-bank/route.ts), so a
      // strict equality check made every unscoped row invisible to EVERY
      // user — 7 newspaper-sourced problems sat in the table while the page
      // read "No problems found". A civic problem from the local paper is
      // genuinely not owned by one college; it belongs to the shared pool.
      query = query.or(
        `institution_id.eq.${filters.institution_id},institution_id.is.null`
      );
    }
    if (filters?.event_id) {
      query = query.eq('event_id', filters.event_id);
    }
    if (filters?.min_severity != null) {
      // The column is severity_rating. 'severity' has never existed on
      // ss_problem_bank, so this filter sent an unknown column to Postgres
      // and returned HTTP 500 every time it was used — the same drift that
      // made four theme values 500 in #2977, and unreachable for the same
      // reason: an empty table cannot fail a filter.
      query = query.gte('severity_rating', filters.min_severity);
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
    data: ProblemScoreInput
  ): Promise<SSProblemScore> {
    // composite_score is a GENERATED column. Postgres computes it itself:
    //
    //   (COALESCE(severity_score, 0) + COALESCE(validation_score, 0)
    //    + COALESCE(uniqueness_score, 0) + COALESCE(feasibility_score, 0)
    //    + COALESCE(impact_potential_score, 0)) / 5.0
    //
    // and REFUSES any insert that supplies a value for it — SQLSTATE 428C9,
    // "cannot insert a non-DEFAULT value into column composite_score".
    //
    // What was here before computed a composite in TypeScript from
    // data.severity / data.frequency / data.solvability / data.market_size —
    // four names that have never been columns on this table — and then
    // inserted that number into the generated column. So every call threw
    // 428C9 before a row was ever written. ss_problem_scores has sat at zero
    // rows since March 2026 not because problems score badly, but because
    // scoring a problem has never once been able to succeed.
    //
    // The dimensions go in; the database does the arithmetic.
    const { data: score, error } = await this.supabase
      .from('ss_problem_scores')
      .insert({
        problem_id: problemId,
        ...data,
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
