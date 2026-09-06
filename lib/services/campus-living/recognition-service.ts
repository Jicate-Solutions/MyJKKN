/**
 * Campus Living Recognition — read layer (CARE keystone, 2026-06-12).
 * ============================================================================
 *
 * Reads the cross-module `campus_living_recognition` event stream (migration
 * 20260612003000) — the generalisation of the mess-only P0 recognition table.
 * Every campus-living module fires into ONE stream; both feeds (the resident's
 * private "Your wins" and the public attributable "Hostel wins") read from
 * here, so a new module needs only to INSERT, never to build a feed.
 *
 * ALL reads fail SOFT (log + empty list): the migration is applied to prod
 * via exec_sql on its own schedule (show-SQL-first), so the code must render
 * calm empty states if it ever runs ahead of the DDL.
 *
 * Recognition is CONFERRED, never claimed — there are deliberately NO write
 * methods here. Writer RPCs ship with each input mode (SECURITY DEFINER).
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'campus-living/recognition';

/** Feed kill-switch config row (seeded by the keystone migration). */
export const RECOGNITION_FEED_POLICY_KEY = 'campus_living.recognition.feed_enabled';

/** A recognition event as the signed-in resident sees their own. */
export interface MyRecognitionRow {
  id: string;
  module: string;
  event_type: string;
  title: string;
  detail: string | null;
  fired_at: string;
  /** The confer's stable source keys (e.g. { suggestion_id } for
   *  voice_confirmed_better, { build_id } for gold_prompt). Consumers that
   *  need to line a conferred act up against the act that earned it read
   *  this; feeds that only render title/detail can ignore it. */
  ref?: Record<string, unknown> | null;
}

/** A public win — attributable (first name only; the RPC controls columns). */
export interface PublicWinRow extends MyRecognitionRow {
  first_name: string;
}

export class RecognitionService {
  /** Own rows, newest first. Optionally scoped to one module and/or one
   *  event_type. RLS does the real scoping: the select policy returns a row
   *  only when it is public or the caller's own, so a PRIVATE confer
   *  (is_public = false, e.g. voice_confirmed_better) reaches its own learner
   *  here and nobody else. */
  static async getMyRecognition(
    learnerId: string,
    module?: string,
    limit = 10,
    eventType?: string
  ): Promise<MyRecognitionRow[]> {
    if (!learnerId) return [];
    try {
      const supabase = createClientSupabaseClient();
      // Table not in generated types yet — untyped-client cast (TS2589 guard).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('campus_living_recognition')
        .select('id, module, event_type, title, detail, fired_at, ref')
        .eq('learner_id', learnerId)
        .order('fired_at', { ascending: false })
        .limit(limit);
      if (module) q = q.eq('module', module);
      if (eventType) q = q.eq('event_type', eventType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MyRecognitionRow[];
    } catch (e) {
      logger.warn(MODULE, 'getMyRecognition failed — rendering empty', e);
      return [];
    }
  }

  /** The public attributable wins feed (SECURITY DEFINER RPC, controlled columns). */
  static async getPublicWins(module?: string, limit = 20): Promise<PublicWinRow[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'fn_campus_living_recognition_feed',
        { p_module: module ?? null, p_limit: limit }
      );
      if (error) throw error;
      const results = (data as { results?: unknown })?.results;
      return Array.isArray(results) ? (results as PublicWinRow[]) : [];
    } catch (e) {
      logger.warn(MODULE, 'getPublicWins failed — rendering empty', e);
      return [];
    }
  }

  /** Feed kill-switch — defaults ON (the stream is harmless while empty). */
  static async getFeedEnabled(): Promise<boolean> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_get_policy_bool', {
        p_key: RECOGNITION_FEED_POLICY_KEY,
        p_default: true,
        p_scope_id: null,
      });
      if (error) throw error;
      return typeof data === 'boolean' ? data : true;
    } catch (e) {
      logger.warn(MODULE, 'feed_enabled read failed — defaulting on', e);
      return true;
    }
  }
}
