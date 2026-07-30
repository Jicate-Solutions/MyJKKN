/**
 * MyJKKN RCLTP — Passages domain service (Phase B) · REFERENCE PATTERN
 * ----------------------------------------------------------------------------
 * Tables: rcltp_passages, rcltp_part_b_questions, rcltp_passage_exposure.
 *
 * This file is the canonical pattern every other rcltp domain service follows:
 *   - class with `static` methods + a singleton `createClientSupabaseClient()`
 *   - `(this.supabase as any).from('rcltp_*')` (generated Database type lacks
 *     rcltp_ tables; the cast is the MyJKKN convention — see favorites-service.ts)
 *   - tenant scoping by institution_id; library tables ALSO surface global rows
 *     (institution_id IS NULL)
 *   - READS + STAFF/ADMIN writes go through the client (RLS allows them)
 *   - STUDENT-affecting writes are stubs → server-side route (migration §6)
 *   - content/formula-dependent logic is stubbed → awaiting MyJKKN
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  RcltpPassage,
  RcltpPartBQuestion,
  RcltpPassageExposure,
  RcltpPassageFilters,
  RcltpPartBQuestionFilters,
  RcltpPassageExposureFilters,
  RcltpListResponse,
  CreateRcltpPassageDto,
  UpdateRcltpPassageDto,
  CreateRcltpPartBQuestionDto,
  UpdateRcltpPartBQuestionDto,
  UpdateRcltpQuestionReviewDto,
  RcltpPassageReviewPriority,
  RcltpReviewSpotcheck,
} from '@/types/rcltp';
import {
  rcltpRange,
  rcltpMetadata,
  rcltpPostJson,
  rcltpAwaitingValidationContent,
} from './rcltp-helpers';

export class RcltpPassagesService {
  private static supabase = createClientSupabaseClient();

  /**
   * The signed-in user's profile id, for attribution columns.
   *
   * auth.users.id == profiles.id (1:1), so the session user's id IS the
   * profiles.id that created_by FKs to.
   *
   * getSession(), NOT getUser(): getUser() revalidates the token against the
   * auth server on every call and can stall the mutation that awaits it
   * (bug #1205 — change-request create hung on "Creating…" indefinitely). For
   * "who is logged in right now" the locally-cached session is the correct
   * source. Never throws — an unauthenticated client returns null so a missing
   * actor degrades to a null column instead of blocking the write.
   */
  private static async currentUserId(): Promise<string | null> {
    try {
      const { data } = await this.supabase.auth.getSession();
      return data.session?.user?.id ?? null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // PASSAGES — reads (RLS-scoped; library table also exposes global rows)
  // -------------------------------------------------------------------------

  static async getPassages(
    filters: RcltpPassageFilters = {}
  ): Promise<RcltpListResponse<RcltpPassage>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_passages')
        .select('*', { count: 'exact' });

      if (filters.institution_id) {
        // institution-owned rows + global/shared rows (institution_id IS NULL)
        query = query.or(
          `institution_id.eq.${filters.institution_id},institution_id.is.null`
        );
      }
      if (filters.language) query = query.eq('language', filters.language);
      if (filters.grade_level !== undefined)
        query = query.eq('grade_level', filters.grade_level);
      if (filters.content_level)
        query = query.eq('content_level', filters.content_level);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.source) query = query.eq('source', filters.source);
      if (filters.is_active !== undefined)
        query = query.eq('is_active', filters.is_active);
      if (filters.search)
        query = query.or(
          `title.ilike.%${filters.search}%,body.ilike.%${filters.search}%`
        );

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpPassage[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpPassagesService.getPassages error:', error);
      throw error;
    }
  }

  static async getPassageById(id: string): Promise<RcltpPassage> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_passages')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!data) throw new Error('Passage not found');
    return data as RcltpPassage;
  }

  // -------------------------------------------------------------------------
  // PASSAGES — staff/admin writes (RLS: rcltp.config.manage; global = admin only)
  // -------------------------------------------------------------------------

  /**
   * created_by is stamped from the session because nothing else fills it: the
   * column has no DB default and rcltp_set_updated_at is the table's only
   * trigger. Director decision 7 (2026-07-28) notifies the person who added a
   * non-English passage, and that recipient does not exist unless it is
   * recorded here. Pre-existing rows keep created_by NULL and correctly fall
   * back to the school head — their author is genuinely unknown.
   */
  static async createPassage(input: CreateRcltpPassageDto): Promise<RcltpPassage> {
    const createdBy = input.created_by ?? (await this.currentUserId());
    const { data, error } = await (this.supabase as any)
      .from('rcltp_passages')
      .insert([{ language: 'en', ...input, created_by: createdBy }])
      .select()
      .single();
    if (error) throw error;
    toast.success('Passage created');
    return data as RcltpPassage;
  }

  static async updatePassage(
    id: string,
    input: UpdateRcltpPassageDto
  ): Promise<RcltpPassage> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_passages')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Passage updated');
    return data as RcltpPassage;
  }

  static async deletePassage(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('rcltp_passages')
      .delete()
      .eq('id', id);
    if (error) throw error;
    toast.success('Passage deleted');
  }

  // -------------------------------------------------------------------------
  // PART B QUESTIONS — reads + staff/admin writes
  // -------------------------------------------------------------------------

  static async getQuestions(
    filters: RcltpPartBQuestionFilters = {}
  ): Promise<RcltpListResponse<RcltpPartBQuestion>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_part_b_questions')
        .select('*', { count: 'exact' });

      if (filters.passage_id) query = query.eq('passage_id', filters.passage_id);
      if (filters.institution_id)
        query = query.or(
          `institution_id.eq.${filters.institution_id},institution_id.is.null`
        );
      if (filters.competency_id)
        query = query.eq('competency_id', filters.competency_id);
      if (filters.is_active !== undefined)
        query = query.eq('is_active', filters.is_active);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.source) query = query.eq('source', filters.source);

      query = query.range(from, to).order('order_index', { ascending: true });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpPartBQuestion[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpPassagesService.getQuestions error:', error);
      throw error;
    }
  }

  /**
   * Learner-safe read for the "take the assessment" flow. Calls the SECURITY
   * DEFINER RPC `fn_rcltp_questions_for_take`, which returns ONLY the columns a
   * learner needs to answer and OMITS `correct_answer` + `ai_meta` (the answer
   * key). The base-table `select('*')` path (getQuestions) must NEVER be used for
   * a learner — RLS now blocks it, and it would put the key on the wire. Returns
   * the same `{ data }` shape the take flow consumes; correct_answer/ai_meta are
   * forced null so the learner payload can never carry them.
   */
  static async getQuestionsForTake(
    passageId: string
  ): Promise<{ data: RcltpPartBQuestion[] }> {
    if (!passageId) return { data: [] };
    const { data, error } = await (this.supabase as any).rpc(
      'fn_rcltp_questions_for_take',
      { p_passage_id: passageId }
    );
    if (error) {
      console.error('RcltpPassagesService.getQuestionsForTake error:', error);
      throw error;
    }
    const rows = ((data ?? []) as Array<Partial<RcltpPartBQuestion>>).map((r) => ({
      ...r,
      correct_answer: null, // answer key is never delivered to a learner
      ai_meta: null,
    }));
    return { data: rows as RcltpPartBQuestion[] };
  }

  static async createQuestion(
    input: CreateRcltpPartBQuestionDto
  ): Promise<RcltpPartBQuestion> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_part_b_questions')
      // Safe defaults for MANUAL authoring (curated + approved). The AI-generate path
      // passes source='ai_generated' + status='draft' in `input`, which OVERRIDES these
      // — so AI questions are never silently auto-approved by the DB default (C1/F2).
      .insert([{ source: 'curated', status: 'approved', ...input }])
      .select()
      .single();
    if (error) throw error;
    toast.success('Question created');
    return data as RcltpPartBQuestion;
  }

  static async updateQuestion(
    id: string,
    input: UpdateRcltpPartBQuestionDto
  ): Promise<RcltpPartBQuestion> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_part_b_questions')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Question updated');
    return data as RcltpPartBQuestion;
  }

  static async deleteQuestion(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('rcltp_part_b_questions')
      .delete()
      .eq('id', id);
    if (error) throw error;
    toast.success('Question deleted');
  }

  // -------------------------------------------------------------------------
  // PASSAGE EXPOSURE — read OK (no-repeat ledger); writes are server-side only
  // -------------------------------------------------------------------------

  static async getExposure(
    filters: RcltpPassageExposureFilters = {}
  ): Promise<RcltpListResponse<RcltpPassageExposure>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_passage_exposure')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters.passage_id) query = query.eq('passage_id', filters.passage_id);

      query = query.range(from, to).order('seen_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpPassageExposure[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpPassagesService.getExposure error:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // DEFERRED — student-affecting write (exposure ledger) → server-side route
  // -------------------------------------------------------------------------

  /**
   * Serve the next unseen, grade-calibrated passage to a learner and log it to
   * rcltp_passage_exposure. Logging exposure is a student-affecting write, so
   * this runs server-side only (service-role) — never from the client.
   */
  static async serveNextPassageForLearner(
    _learnerId: string,
    gradeLevel?: number
  ): Promise<RcltpPassage> {
    // The server route derives the learner from the session (NEVER a passed id),
    // logs exposure, and applies the served-level guardrail; we forward only the
    // optional grade hint. _learnerId is kept for call-site compatibility.
    return rcltpPostJson<RcltpPassage>('/api/rcltp/passages/next', {
      grade_level: gradeLevel,
    });
  }

  // -------------------------------------------------------------------------
  // DEFERRED — content pipeline → awaiting MyJKKN
  // -------------------------------------------------------------------------

  /** AI passage generation (age-appropriate, per grade/language). Awaiting MyJKKN seed passages + guardrails. */
  static async generatePassage(_params: unknown): Promise<RcltpPassage> {
    return rcltpAwaitingValidationContent('AI passage generation');
  }

  // -------------------------------------------------------------------------
  // QUESTION REVIEW (D6) — staff promotes an AI-generated question to approved.
  // RLS: rcltp.question.approve / rcltp.config.manage (a legitimate client write).
  // -------------------------------------------------------------------------
  static async reviewQuestion(
    id: string,
    input: UpdateRcltpQuestionReviewDto
  ): Promise<RcltpPartBQuestion> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_part_b_questions')
      .update({
        ...input,
        reviewed_at: input.reviewed_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Question review saved');
    return data as RcltpPartBQuestion;
  }

  /**
   * Promote MANY reviewed questions in one statement (locked decision #1 —
   * "approve all AI-agreed"). One `.update().in('id', ids)` round-trip rather
   * than N mutations: the console can clear a whole passage's agreed drafts
   * without N network calls, and RLS still evaluates per row, so a caller who
   * may not touch one of the ids simply does not update it.
   *
   * FREEZE BY OMISSION: the patch is an UpdateRcltpQuestionReviewDto (status +
   * reviewed_by + reviewed_at only). It carries no ai_meta, so the frozen
   * ai_meta.ai_draft survives untouched — the invariant holds by construction,
   * exactly as in the single-row reviewQuestion path.
   *
   * Returns the rows actually updated, so the caller reports what really landed
   * rather than what it hoped would land.
   */
  static async reviewQuestionsBulk(
    ids: string[],
    input: UpdateRcltpQuestionReviewDto
  ): Promise<RcltpPartBQuestion[]> {
    if (ids.length === 0) return [];
    const { data, error } = await (this.supabase as any)
      .from('rcltp_part_b_questions')
      .update({
        ...input,
        reviewed_at: input.reviewed_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .select();
    if (error) throw error;
    const rows = (data ?? []) as RcltpPartBQuestion[];
    if (rows.length < ids.length) {
      // Honest partial result — never report N approved when the DB took fewer.
      toast.success(
        `Approved ${rows.length} of ${ids.length} — the rest were not permitted or already reviewed.`
      );
    } else {
      toast.success(`Approved ${rows.length} questions`);
    }
    return rows;
  }

  /**
   * Most-needed-first ordering for the review queue (locked decision #5), via
   * fn_rcltp_passage_review_priority. Returns one row per visible passage with
   * its counts and a server-computed priority_rank.
   */
  static async getPassageReviewPriority(
    institutionId?: string | null
  ): Promise<RcltpPassageReviewPriority[]> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_rcltp_passage_review_priority',
      { p_institution_id: institutionId ?? null }
    );
    if (error) throw error;
    return (data ?? []) as RcltpPassageReviewPriority[];
  }

  /**
   * This week's anti-rubber-stamp sample for the signed-in Senior Learner
   * (locked decision #7). The RPC is self-healing: the first call in a week
   * draws the sample, later calls return the same rows — no scheduler that can
   * silently stop running.
   */
  static async getSpotcheckWeek(): Promise<RcltpReviewSpotcheck[]> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_rcltp_spotcheck_week'
    );
    if (error) throw error;
    return (data ?? []) as RcltpReviewSpotcheck[];
  }

  /** Record the outcome of one sampled item: it reads correctly, or it needs a look. */
  static async resolveSpotcheck(
    id: string,
    status: 'confirmed' | 'flagged',
    note?: string | null
  ): Promise<void> {
    const { error } = await (this.supabase as any).rpc(
      'fn_rcltp_spotcheck_resolve',
      { p_id: id, p_status: status, p_note: note ?? null }
    );
    if (error) throw error;
    toast.success(
      status === 'confirmed' ? 'Spot-check confirmed' : 'Flagged for a second look'
    );
  }

  /**
   * Auto-generate comprehension questions from a passage (D6). Reuses the
   * production LLM pattern (work-pulse/analyze) via a Phase-3 server route
   * POST /api/rcltp/questions/generate; generated questions land
   * source='ai_generated', status='draft' for teacher review. The passage->question
   * prompt + MyJKKN competency/band alignment guardrails are awaiting MyJKKN content.
   */
  static async generatePartBQuestions(
    passageId: string
  ): Promise<RcltpPartBQuestion[]> {
    // The route + LLM client wiring exist; the passage→question prompt + MyJKKN
    // competency/band guardrails are content-gated, so this currently throws the
    // route's honest "awaiting MyJKKN content" message until that content lands.
    return rcltpPostJson<RcltpPartBQuestion[]>('/api/rcltp/questions/generate', {
      passage_id: passageId,
    });
  }
}
