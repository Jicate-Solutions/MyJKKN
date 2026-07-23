/**
 * MyJKKN RCLTP v2 — Gamification domain service (Phase 2)
 * ----------------------------------------------------------------------------
 * Tables: rcltp_badges (catalog), rcltp_learner_badges (earned), rcltp_streaks.
 *
 * Follows the canonical rcltp pattern (see passages-service.ts):
 *   - class with `static` methods + a singleton `createClientSupabaseClient()`
 *   - `(this.supabase as any).from('rcltp_*')` (the MyJKKN convention)
 *   - READS go through the client (RLS-scoped); badge CATALOG staff writes too
 *   - EARNED badges + streaks are SERVER-AWARDED ONLY (fn_rcltp_award_badge /
 *     fn_rcltp_update_streak, service_role EXECUTE). There is deliberately NO
 *     client write helper for them — a student cannot self-award (E2). Those
 *     methods are stubs that point at the Phase-3 server route.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  RcltpBadge,
  RcltpLearnerBadge,
  RcltpStreak,
  RcltpBadgeFilters,
  RcltpLearnerBadgeFilters,
  RcltpStreakFilters,
  RcltpListResponse,
  CreateRcltpBadgeDto,
  UpdateRcltpBadgeDto,
} from '@/types/rcltp';
import { rcltpRange, rcltpMetadata, rcltpPostJson } from './rcltp-helpers';

export class RcltpGamificationService {
  private static supabase = createClientSupabaseClient();

  // -------------------------------------------------------------------------
  // BADGE CATALOG — reads (library table; institution rows + global)
  // -------------------------------------------------------------------------

  static async getBadges(
    filters: RcltpBadgeFilters = {}
  ): Promise<RcltpListResponse<RcltpBadge>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_badges')
        .select('*', { count: 'exact' });

      if (filters.institution_id) {
        query = query.or(
          `institution_id.eq.${filters.institution_id},institution_id.is.null`
        );
      }
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.is_active !== undefined)
        query = query.eq('is_active', filters.is_active);
      if (filters.search)
        query = query.or(
          `name.ilike.%${filters.search}%,slug.ilike.%${filters.search}%`
        );

      query = query.range(from, to).order('points', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpBadge[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpGamificationService.getBadges error:', error);
      throw error;
    }
  }

  static async getBadgeById(id: string): Promise<RcltpBadge> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_badges')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!data) throw new Error('Badge not found');
    return data as RcltpBadge;
  }

  // -------------------------------------------------------------------------
  // BADGE CATALOG — staff/admin writes (RLS: rcltp.reward.config; global=admin)
  // -------------------------------------------------------------------------

  static async createBadge(input: CreateRcltpBadgeDto): Promise<RcltpBadge> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_badges')
      .insert([input])
      .select()
      .single();
    if (error) throw error;
    toast.success('Badge created');
    return data as RcltpBadge;
  }

  static async updateBadge(
    id: string,
    input: UpdateRcltpBadgeDto
  ): Promise<RcltpBadge> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_badges')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Badge updated');
    return data as RcltpBadge;
  }

  static async deleteBadge(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('rcltp_badges')
      .delete()
      .eq('id', id);
    if (error) throw error;
    toast.success('Badge deleted');
  }

  // -------------------------------------------------------------------------
  // EARNED BADGES — reads (own student + staff). No client write (server-awarded).
  // -------------------------------------------------------------------------

  static async getLearnerBadges(
    filters: RcltpLearnerBadgeFilters = {}
  ): Promise<RcltpListResponse<RcltpLearnerBadge>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_learner_badges')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters.badge_id) query = query.eq('badge_id', filters.badge_id);

      query = query.range(from, to).order('earned_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpLearnerBadge[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpGamificationService.getLearnerBadges error:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // STREAKS — reads (own student + staff). No client write (server-updated).
  // -------------------------------------------------------------------------

  static async getStreaks(
    filters: RcltpStreakFilters = {}
  ): Promise<RcltpListResponse<RcltpStreak>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_streaks')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters.streak_type) query = query.eq('streak_type', filters.streak_type);

      query = query.range(from, to).order('current_streak', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpStreak[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpGamificationService.getStreaks error:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // DEFERRED — awards are server-side only (E2). fn_rcltp_award_badge /
  // fn_rcltp_update_streak are SECURITY DEFINER, service_role EXECUTE only;
  // they are invoked from the Phase-3 server score-flow, never the client.
  // -------------------------------------------------------------------------

  /**
   * Award a badge via the server-side route (fn_rcltp_award_badge, service_role
   * only). The route is gated rcltp.assessment.manage — a student (assessment.take
   * only) gets 403, so a learner can never self-award (E2). The institution is
   * derived server-side from the learner record (not passed), preventing cross-tenant
   * awards. Returns { learner_badge_id, already_earned } (idempotent).
   */
  static async awardBadge(
    learnerId: string,
    badgeSlug: string,
    evidence?: string
  ): Promise<{ learner_badge_id: string | null; already_earned: boolean }> {
    return rcltpPostJson<{ learner_badge_id: string | null; already_earned: boolean }>(
      '/api/rcltp/gamification/award',
      { learner_id: learnerId, badge_slug: badgeSlug, evidence }
    );
  }

  /**
   * Update a learner's streak via the server-side route (fn_rcltp_update_streak,
   * service_role only; same-day re-log is a no-op DB-side). Gated
   * rcltp.assessment.manage at the route (students cannot self-update); the
   * institution is derived server-side from the learner record.
   */
  static async updateStreak(
    learnerId: string,
    streakType: string,
    loggedDate?: string
  ): Promise<{ updated: boolean }> {
    return rcltpPostJson<{ updated: boolean }>('/api/rcltp/gamification/streak', {
      learner_id: learnerId,
      streak_type: streakType,
      logged_date: loggedDate,
    });
  }
}
