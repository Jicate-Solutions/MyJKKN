/**
 * EKSAQ RCLTP — Passages domain service (Phase B) · REFERENCE PATTERN
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
 *   - content/formula-dependent logic is stubbed → awaiting EKSAQ
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
} from '@/types/rcltp';
import {
  rcltpRange,
  rcltpMetadata,
  rcltpServerWriteRequired,
  rcltpAwaitingEksaqContent,
} from './rcltp-helpers';

export class RcltpPassagesService {
  private static supabase = createClientSupabaseClient();

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

  static async createPassage(input: CreateRcltpPassageDto): Promise<RcltpPassage> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_passages')
      .insert([{ language: 'en', ...input }])
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

  static async createQuestion(
    input: CreateRcltpPartBQuestionDto
  ): Promise<RcltpPartBQuestion> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_part_b_questions')
      .insert([input])
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
    _gradeLevel?: number
  ): Promise<RcltpPassage> {
    return rcltpServerWriteRequired('POST /api/rcltp/passages/next');
  }

  // -------------------------------------------------------------------------
  // DEFERRED — content pipeline → awaiting EKSAQ
  // -------------------------------------------------------------------------

  /** AI passage generation (age-appropriate, per grade/language). Awaiting EKSAQ seed passages + guardrails. */
  static async generatePassage(_params: unknown): Promise<RcltpPassage> {
    return rcltpAwaitingEksaqContent('AI passage generation');
  }
}
