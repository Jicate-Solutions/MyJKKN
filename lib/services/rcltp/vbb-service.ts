/**
 * MyJKKN RCLTP — VBB (vocabulary) domain service (Phase B)
 * ----------------------------------------------------------------------------
 * Tables: rcltp_vbb_words (§3.11 — content library, institution_id NULL = global),
 *         rcltp_vbb_progress (§3.12 — per-student progress, institution-scoped).
 *
 * Follows the canonical passages-service pattern:
 *   - class with `static` methods + a singleton `createClientSupabaseClient()`
 *   - `(this.supabase as any).from('rcltp_*')` (generated Database type lacks
 *     rcltp_ tables; the cast is the MyJKKN convention)
 *   - library table (vbb_words) ALSO surfaces global rows (institution_id IS NULL)
 *   - READS + STAFF/ADMIN writes go through the client (RLS allows them — §6.2)
 *   - STUDENT-affecting writes are stubs → server-side route (migration §6.12)
 *   - content-dependent logic is stubbed → awaiting MyJKKN
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  RcltpVbbWord,
  RcltpVbbProgress,
  RcltpVbbWordFilters,
  RcltpVbbProgressFilters,
  RcltpListResponse,
  CreateRcltpVbbWordDto,
  UpdateRcltpVbbWordDto,
} from '@/types/rcltp';
import {
  rcltpRange,
  rcltpMetadata,
  rcltpPostJson,
  rcltpAwaitingValidationContent,
} from './rcltp-helpers';

export class RcltpVbbService {
  private static supabase = createClientSupabaseClient();

  // -------------------------------------------------------------------------
  // VBB WORDS — reads (RLS-scoped; library table also exposes global rows)
  // -------------------------------------------------------------------------

  static async getWords(
    filters: RcltpVbbWordFilters = {}
  ): Promise<RcltpListResponse<RcltpVbbWord>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_vbb_words')
        .select('*', { count: 'exact' });

      if (filters.institution_id) {
        // institution-owned rows + global/shared rows (institution_id IS NULL)
        query = query.or(
          `institution_id.eq.${filters.institution_id},institution_id.is.null`
        );
      }
      if (filters.language) query = query.eq('language', filters.language);
      if (filters.stage) query = query.eq('stage', filters.stage);
      if (filters.is_active !== undefined)
        query = query.eq('is_active', filters.is_active);
      if (filters.search)
        query = query.or(
          `word.ilike.%${filters.search}%,definition.ilike.%${filters.search}%`
        );

      query = query.range(from, to).order('word', { ascending: true });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpVbbWord[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpVbbService.getWords error:', error);
      throw error;
    }
  }

  static async getWordById(id: string): Promise<RcltpVbbWord> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_vbb_words')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!data) throw new Error('VBB word not found');
    return data as RcltpVbbWord;
  }

  // -------------------------------------------------------------------------
  // VBB PROGRESS — read (institution-scoped per-learner progress)
  // -------------------------------------------------------------------------

  static async getProgress(
    filters: RcltpVbbProgressFilters = {}
  ): Promise<RcltpListResponse<RcltpVbbProgress>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_vbb_progress')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters.stage) query = query.eq('stage', filters.stage);
      if (filters.week_of) query = query.eq('week_of', filters.week_of);

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpVbbProgress[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpVbbService.getProgress error:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // VBB WORDS — staff/admin writes (RLS: rcltp.config.manage; global = admin only)
  // -------------------------------------------------------------------------

  static async createWord(input: CreateRcltpVbbWordDto): Promise<RcltpVbbWord> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_vbb_words')
      .insert([{ language: 'en', ...input }])
      .select()
      .single();
    if (error) throw error;
    toast.success('Word created');
    return data as RcltpVbbWord;
  }

  static async updateWord(
    id: string,
    input: UpdateRcltpVbbWordDto
  ): Promise<RcltpVbbWord> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_vbb_words')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Word updated');
    return data as RcltpVbbWord;
  }

  static async deleteWord(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('rcltp_vbb_words')
      .delete()
      .eq('id', id);
    if (error) throw error;
    toast.success('Word deleted');
  }

  // -------------------------------------------------------------------------
  // DEFERRED — student-affecting write (VBB progress) → server-side route
  // -------------------------------------------------------------------------

  /**
   * Record a learner's VBB progress (score / completion_rate per stage/week).
   * This is a student-affecting write — score drives band progression — so it
   * runs server-side only (service-role) per migration §6.12. Never client-side.
   */
  static async recordVbbProgress(
    _learnerId: string,
    payload?: { stage?: string; score?: number; completion_rate?: number; week_of?: string }
  ): Promise<RcltpVbbProgress> {
    // The server route derives the learner from the session (NEVER a passed id);
    // we forward only the progress payload. _learnerId kept for call-site compatibility.
    return rcltpPostJson<RcltpVbbProgress>('/api/rcltp/vbb/progress', payload ?? {});
  }

  // -------------------------------------------------------------------------
  // DEFERRED — content import → awaiting MyJKKN
  // -------------------------------------------------------------------------

  /** Bulk import the VBB 5,000-word vocabulary list. Awaiting MyJKKN wordlist content. */
  static async importWordList(_payload?: unknown): Promise<void> {
    return rcltpAwaitingValidationContent('VBB 5,000-word list import');
  }
}
