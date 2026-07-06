/**
 * Choose Your Menu self-improving loop — chairperson verdict + causal guard (PR3).
 * ============================================================================
 *
 * Backend-mostly surface for the loop's CONTROL LABEL. The generator (PR2) drops
 * `status='proposed'` rows into `mess_menu_recommendations`; the chairperson
 * accepts / rejects / edits each one. That verdict is dual-purpose:
 *   • human-in-the-loop control over generated menus (the chairperson stays in charge), and
 *   • the causal control label — 'rejected' slots (old menu kept) are the quasi-control
 *     the 2-cycle sim uses to tell real lift from regression-to-the-mean.
 *
 * Reads ride the spine table's RLS (mmr_select: manage-permission + institution scope).
 * The verdict WRITE goes through the anon-locked SECURITY DEFINER RPC
 * `fn_mess_recommendation_set_verdict` (PR3 migration 20260729000000).
 *
 * The spine table is not in types/supabase.ts (applied via raw migration), so reads
 * cast the client untyped — same idiom as choose-your-menu-service.ts.
 *
 * Spec: specs/mess-choose-your-menu-self-improving-loop-2026-06-28.md (PR3).
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'campus-living/mess-menu-loop';

export type VerdictStatus = 'accepted' | 'rejected' | 'edited';

/** One proposed recommendation awaiting the chairperson's verdict. */
export interface ProposedRecommendation {
  id: string;
  tier_key: string;
  meal_type: string;
  week_start_date: string;
  recommended_count: number;
  demoted_count: number;
  rationale: Record<string, unknown>;
  /** Last measured lift for this slot's prior cycle, if any (NULL until measured). */
  rating_lift: number | null;
  baseline_avg_rating: number | null;
  baseline_rating_n: number | null;
  created_at: string;
}

/** One row of the causal-validity guard: lift distribution per verdict status. */
export interface CausalGuardRow {
  status: string;
  n: number;
  avg_lift: number | null;
  sd: number | null;
}

export class MessMenuLoopService {
  /**
   * Proposed recommendations awaiting a verdict, newest week first. Optionally
   * filtered to one tier. RLS gates visibility to manage-permission holders for
   * institutions they can access.
   */
  static async listProposed(tierKey?: string): Promise<ProposedRecommendation[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('mess_menu_recommendations')
        .select(
          'id, tier_key, meal_type, week_start_date, recommended_item_ids, demoted_item_ids, rationale, rating_lift, baseline_avg_rating, baseline_rating_n, created_at'
        )
        .eq('status', 'proposed')
        .order('week_start_date', { ascending: false })
        .order('meal_type', { ascending: true });
      if (tierKey) q = q.eq('tier_key', tierKey);
      const { data, error } = await q;
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        tier_key: r.tier_key,
        meal_type: r.meal_type,
        week_start_date: r.week_start_date,
        recommended_count: Array.isArray(r.recommended_item_ids) ? r.recommended_item_ids.length : 0,
        demoted_count: Array.isArray(r.demoted_item_ids) ? r.demoted_item_ids.length : 0,
        rationale: (r.rationale ?? {}) as Record<string, unknown>,
        rating_lift: r.rating_lift,
        baseline_avg_rating: r.baseline_avg_rating,
        baseline_rating_n: r.baseline_rating_n,
        created_at: r.created_at,
      }));
    } catch (e) {
      logger.warn(MODULE, 'listProposed failed — rendering empty', e);
      return [];
    }
  }

  /** Record the chairperson's verdict via the anon-locked DEFINER RPC. */
  static async setVerdict(
    recommendationId: string,
    status: VerdictStatus,
    note?: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('fn_mess_recommendation_set_verdict', {
      p_recommendation_id: recommendationId,
      p_status: status,
      p_note: note ?? null,
    });
    if (error) {
      logger.error(MODULE, 'setVerdict failed', error);
      throw error;
    }
  }

  /**
   * Causal-validity guard. The loop fires on the WORST slots, so acting on the
   * bottom of a noisy distribution rebounds regardless of the action (regression
   * to the mean). If 'rejected' slots (old menu kept) show the SAME lift
   * distribution as 'accepted', the lift is time/regression — NOT the
   * recommendation → the loop is self-REINFORCING, not self-IMPROVING.
   *
   * Equivalent to:
   *   SELECT status, count(*), round(avg(rating_lift),2), round(stddev(rating_lift),2)
   *   FROM mess_menu_recommendations WHERE rating_lift IS NOT NULL GROUP BY status;
   * Computed client-side over the RLS-gated rows (PostgREST has no GROUP BY in the
   * JS client; the rows are few — one per measured slot-week).
   */
  static async getCausalGuard(): Promise<CausalGuardRow[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('mess_menu_recommendations')
        .select('status, rating_lift')
        .not('rating_lift', 'is', null);
      if (error) throw error;

      const groups = new Map<string, number[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (data ?? []) as any[]) {
        const lift = typeof r.rating_lift === 'number' ? r.rating_lift : Number(r.rating_lift);
        if (!Number.isFinite(lift)) continue;
        const arr = groups.get(r.status) ?? [];
        arr.push(lift);
        groups.set(r.status, arr);
      }

      const round2 = (x: number) => Math.round(x * 100) / 100;
      const rows: CausalGuardRow[] = [];
      for (const [status, lifts] of groups) {
        const n = lifts.length;
        const mean = lifts.reduce((a, b) => a + b, 0) / n;
        // Sample stddev (stddev_samp, matching Postgres stddev()): NULL when n < 2.
        const sd =
          n < 2
            ? null
            : round2(Math.sqrt(lifts.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)));
        rows.push({ status, n, avg_lift: round2(mean), sd });
      }
      // Stable, readable order.
      const order = ['accepted', 'edited', 'rejected', 'proposed'];
      rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
      return rows;
    } catch (e) {
      logger.warn(MODULE, 'getCausalGuard failed — rendering empty', e);
      return [];
    }
  }
}
