/**
 * Mess Rating Service
 * ============================================================================
 * Per-item ratings (1-5 stars) submitted by Premium-Plus residents after a
 * meal. Distinct from `mess-feedback-service.ts` (meal-level dimensions).
 *
 * Substrate (PR 1):
 *   - Table: mess_meal_ratings
 *   - RPC:   fn_get_popular_items(institution_id uuid, days_back int)
 *   - Policies:
 *       mess.rating.premium_plus_only (boolean)
 *       mess.rating.window_hours (number)
 *
 * Tier gating + window enforcement lives in `mess-rating-gate.ts`. This file
 * exposes pure CRUD + aggregate accessors; callers MUST invoke `canRate` from
 * the gate module before allowing a submission to proceed.
 * ============================================================================
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessMealRating,
  CreateMessMealRatingDTO,
  PopularItem,
} from '@/types/campus-living';

const LOG_SCOPE = 'campus-living/mess-rating';

export class MessRatingService {
  // ── Submit (upsert) a single per-item rating ──────────────────────
  static async submitRating(payload: CreateMessMealRatingDTO): Promise<MessMealRating> {
    try {
      const supabase = createClientSupabaseClient();
      // Upsert on the unique (profile_id, menu_id, item_text) tuple so a
      // resident can revise their rating within the window without
      // triggering 23505 conflicts.
      const { data, error } = await supabase
        .from('mess_meal_ratings')
        .upsert(payload, {
          onConflict: 'profile_id,menu_id,item_text',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error(LOG_SCOPE, 'Failed to submit rating', error);
        throw error;
      }
      return data as MessMealRating;
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in submitRating', error);
      throw error;
    }
  }

  // ── Submit ratings in bulk (one network call per dialog submit) ───
  static async submitRatingsBulk(
    payloads: CreateMessMealRatingDTO[]
  ): Promise<MessMealRating[]> {
    if (payloads.length === 0) return [];
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_ratings')
        .upsert(payloads, {
          onConflict: 'profile_id,menu_id,item_text',
          ignoreDuplicates: false,
        })
        .select();

      if (error) {
        logger.error(LOG_SCOPE, 'Failed to submit ratings bulk', error);
        throw error;
      }
      return (data ?? []) as MessMealRating[];
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in submitRatingsBulk', error);
      throw error;
    }
  }

  // ── Get a resident's own ratings ──────────────────────────────────
  static async getMyRatings(profileId: string, limit = 100): Promise<MessMealRating[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_ratings')
        .select('*')
        .eq('profile_id', profileId)
        .order('rated_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error(LOG_SCOPE, 'Failed to fetch own ratings', error);
        throw error;
      }
      return (data ?? []) as MessMealRating[];
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in getMyRatings', error);
      throw error;
    }
  }

  // ── Get the resident's existing ratings for a specific menu cell ──
  // Used by the rate-meal dialog to pre-fill stars + comment when the
  // resident re-opens the dialog within the window.
  static async getMyRatingsForMenu(
    profileId: string,
    menuId: string
  ): Promise<MessMealRating[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_ratings')
        .select('*')
        .eq('profile_id', profileId)
        .eq('menu_id', menuId);

      if (error) {
        logger.error(LOG_SCOPE, 'Failed to fetch ratings for menu', error);
        throw error;
      }
      return (data ?? []) as MessMealRating[];
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in getMyRatingsForMenu', error);
      throw error;
    }
  }

  // ── Get popular items (chairperson insights) ──────────────────────
  static async getPopularItems(
    institutionId: string,
    daysBack = 30
  ): Promise<PopularItem[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_get_popular_items', {
        p_institution_id: institutionId,
        p_days_back: daysBack,
      });

      if (error) {
        logger.error(LOG_SCOPE, 'Failed to fetch popular items', error);
        throw error;
      }
      return (data ?? []) as PopularItem[];
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in getPopularItems', error);
      throw error;
    }
  }

  // ── Activity count by day (insights chart) ────────────────────────
  // Lightweight aggregate computed client-side from raw rated_at values
  // — no separate RPC needed for the small data volumes expected.
  static async getActivityByDay(
    institutionId: string,
    daysBack = 30
  ): Promise<{ day: string; total: number }[]> {
    try {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - daysBack);

      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_ratings')
        .select('rated_at')
        .eq('institution_id', institutionId)
        .gte('rated_at', since.toISOString());

      if (error) {
        logger.error(LOG_SCOPE, 'Failed to fetch activity rows', error);
        throw error;
      }

      const buckets = new Map<string, number>();
      for (const row of (data ?? []) as { rated_at: string }[]) {
        const day = row.rated_at.slice(0, 10); // YYYY-MM-DD
        buckets.set(day, (buckets.get(day) ?? 0) + 1);
      }
      return Array.from(buckets.entries())
        .map(([day, total]) => ({ day, total }))
        .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in getActivityByDay', error);
      throw error;
    }
  }
}
