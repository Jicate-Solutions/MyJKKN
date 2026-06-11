/**
 * Choose Your Menu — resident-side reads (P0c, 2026-06-11).
 * ============================================================================
 *
 * Read layer for the resident "My Meals" surface. Everything here is READ —
 * the input modes (personalization swaps, dish votes, special-day proposals)
 * ship in later PRs, each WITH its return-arc. This service powers the
 * return-arc surface those modes will plug into:
 *
 *   • policy snapshot  — the 9 `mess.choose.*` rows via the client-callable
 *     `fn_get_policy*` readers (same family housekeeping-booking-service
 *     uses). Falls soft: master defaults FALSE so a failed read keeps the
 *     feature dark, never accidentally lights it up.
 *   • resident context — active allocation → hostel_tier_policy.tier_key
 *     (no tier row = 'standard'), profiles.learner_id bridge, and
 *     learners_profiles.gender (MALE/FEMALE) → menu gender (boys/girls).
 *     Same identity chain as housekeeping getMyEntitlement.
 *   • my activity      — own rows from mess_meal_choices / mess_dish_votes /
 *     mess_choose_recognition (RLS: owner via profiles.learner_id chain).
 *   • live counts      — fn_mess_choose_live_counts (SECURITY DEFINER,
 *     aggregate-only — per-resident rows never leak into the public tally).
 *
 * The substrate tables are not in types/supabase.ts yet (applied to prod via
 * exec_sql), so reads cast the client untyped — same idiom as
 * housekeeping-booking-service's hostel_tier_policy read (TS2589 guard).
 *
 * Spec: specs/choose-your-menu-platform-spec-2026-06-11.md.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  CHOOSE_MENU_POLICY_KEYS,
  type ChooseMenuTierKey,
} from '@/lib/services/campus-living/choose-your-menu-policy-keys';

const K = CHOOSE_MENU_POLICY_KEYS;
const MODULE = 'campus-living/choose-your-menu';

// ── Types ──────────────────────────────────────────────────────────────────

export type MenuGender = 'boys' | 'girls';

/** Snapshot of the resident-relevant `mess.choose.*` policy rows. */
export interface ChooseMenuPolicySnapshot {
  masterEnabled: boolean;
  personalizationTiers: string[];
  votingTiers: string[];
  feedbackLiveCounts: boolean;
  feedbackRecognition: boolean;
}

/** Who am I, menu-wise: tier + gender + the learners_profiles id own-rows key. */
export interface MyMealsContext {
  hasActiveAllocation: boolean;
  /** learners_profiles.id — the key mess_* engagement rows are owned by. */
  learnerId: string | null;
  tierKey: ChooseMenuTierKey | string;
  gender: MenuGender | null;
}

export interface MyWeekChoice {
  id: string;
  week_start_date: string;
  day_of_week: number;
  meal_type: string;
  dish: string;
  created_at: string;
}

export interface MyDishVote {
  id: string;
  vote: 1 | -1;
  dish: string;
  updated_at: string;
}

export interface MyRecognitionEvent {
  id: string;
  event_type: 'vote_landed' | 'proposal_approved' | 'choice_served';
  dish_name: string | null;
  menu_week: string | null;
  fired_at: string;
}

export interface LiveVoteCount {
  item_id: string;
  dish: string;
  net_score: number;
  voters: number;
}

/** Seeded migration defaults — used only when a policy read fails. */
const POLICY_DEFAULTS: ChooseMenuPolicySnapshot = {
  masterEnabled: false, // fail-dark: a broken read must never light the feature
  personalizationTiers: ['premium', 'premium_plus'],
  votingTiers: ['standard', 'premium', 'premium_plus'],
  feedbackLiveCounts: true,
  feedbackRecognition: true,
};

function libName(item: unknown): string {
  const row = item as { name_english?: string | null; name_tamil?: string | null } | null;
  return row?.name_english || row?.name_tamil || 'Unknown dish';
}

export class ChooseYourMenuService {
  // ── Policies ─────────────────────────────────────────────────────────

  static async getPolicySnapshot(): Promise<ChooseMenuPolicySnapshot> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpc = (supabase as any);
    try {
      const [master, persTiers, voteTiers, liveCounts, recognition] =
        await Promise.all([
          rpc.rpc('fn_get_policy_bool', {
            p_key: K.MASTER_ENABLED,
            p_default: POLICY_DEFAULTS.masterEnabled,
            p_scope_id: null,
          }),
          rpc.rpc('fn_get_policy', { p_key: K.PERSONALIZATION_ENABLED_TIERS, p_scope_id: null }),
          rpc.rpc('fn_get_policy', { p_key: K.VOTING_ENABLED_TIERS, p_scope_id: null }),
          rpc.rpc('fn_get_policy_bool', {
            p_key: K.FEEDBACK_LIVE_COUNTS,
            p_default: POLICY_DEFAULTS.feedbackLiveCounts,
            p_scope_id: null,
          }),
          rpc.rpc('fn_get_policy_bool', {
            p_key: K.FEEDBACK_RECOGNITION,
            p_default: POLICY_DEFAULTS.feedbackRecognition,
            p_scope_id: null,
          }),
        ]);

      const asTierArray = (v: unknown, fallback: string[]): string[] =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fallback;

      return {
        masterEnabled:
          typeof master.data === 'boolean' ? master.data : POLICY_DEFAULTS.masterEnabled,
        personalizationTiers: asTierArray(persTiers.data, POLICY_DEFAULTS.personalizationTiers),
        votingTiers: asTierArray(voteTiers.data, POLICY_DEFAULTS.votingTiers),
        feedbackLiveCounts:
          typeof liveCounts.data === 'boolean' ? liveCounts.data : POLICY_DEFAULTS.feedbackLiveCounts,
        feedbackRecognition:
          typeof recognition.data === 'boolean' ? recognition.data : POLICY_DEFAULTS.feedbackRecognition,
      };
    } catch (e) {
      logger.warn(MODULE, 'Policy snapshot read failed — staying dark', e);
      return POLICY_DEFAULTS;
    }
  }

  // ── Resident context ─────────────────────────────────────────────────

  static async getMyMealsContext(): Promise<MyMealsContext> {
    const supabase = createClientSupabaseClient();
    const none: MyMealsContext = {
      hasActiveAllocation: false,
      learnerId: null,
      tierKey: 'standard',
      gender: null,
    };

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return none;

    // 1. Active allocation (hostel_allocations.learner_id FKs profiles = auth uid).
    const { data: allocation, error: allocError } = await supabase
      .from('hostel_allocations')
      .select('id, tier_id')
      .eq('learner_id', user.id)
      .eq('status', 'active')
      .order('allocation_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (allocError) {
      logger.error(MODULE, 'Failed to fetch active allocation', allocError);
      throw allocError;
    }
    if (!allocation) return none;

    // 2. Tier row → tier_key (no tier row = standard) — housekeeping idiom.
    let tierKey = 'standard';
    if (allocation.tier_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tier, error: tierError } = await (supabase as any)
        .from('hostel_tier_policy')
        .select('tier_key')
        .eq('id', allocation.tier_id)
        .maybeSingle();
      if (tierError) {
        logger.error(MODULE, 'Failed to fetch tier policy', tierError);
        throw tierError;
      }
      if (tier?.tier_key) tierKey = tier.tier_key as string;
    }

    // 3. profiles.learner_id bridge → learners_profiles.gender (MALE/FEMALE).
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('learner_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) {
      logger.error(MODULE, 'Failed to fetch profile bridge', profileError);
      throw profileError;
    }
    const learnerId = profileRow?.learner_id ?? null;

    let gender: MenuGender | null = null;
    if (learnerId) {
      const { data: learner, error: learnerError } = await supabase
        .from('learners_profiles')
        .select('gender')
        .eq('id', learnerId)
        .maybeSingle();
      if (learnerError) {
        logger.error(MODULE, 'Failed to fetch learner gender', learnerError);
        throw learnerError;
      }
      const g = (learner?.gender ?? '').toString().toUpperCase();
      if (g === 'MALE') gender = 'boys';
      else if (g === 'FEMALE') gender = 'girls';
    }

    return { hasActiveAllocation: true, learnerId, tierKey, gender };
  }

  // ── My activity (own rows — RLS enforces ownership server-side) ──────

  static async getMyWeekChoices(learnerId: string, weekStart: string): Promise<MyWeekChoice[]> {
    if (!learnerId) return [];
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('mess_meal_choices')
      .select('id, week_start_date, day_of_week, meal_type, created_at, item:mess_menu_item_library!chosen_item_id(name_english, name_tamil)')
      .eq('learner_id', learnerId)
      .eq('week_start_date', weekStart)
      .order('day_of_week', { ascending: true });
    if (error) {
      logger.error(MODULE, 'getMyWeekChoices failed', error);
      throw error;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => ({
      id: r.id,
      week_start_date: r.week_start_date,
      day_of_week: r.day_of_week,
      meal_type: r.meal_type,
      dish: libName(r.item),
      created_at: r.created_at,
    }));
  }

  static async getMyVotes(learnerId: string): Promise<MyDishVote[]> {
    if (!learnerId) return [];
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('mess_dish_votes')
      .select('id, vote, updated_at, item:mess_menu_item_library!item_id(name_english, name_tamil)')
      .eq('learner_id', learnerId)
      .order('updated_at', { ascending: false });
    if (error) {
      logger.error(MODULE, 'getMyVotes failed', error);
      throw error;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => ({
      id: r.id,
      vote: r.vote,
      dish: libName(r.item),
      updated_at: r.updated_at,
    }));
  }

  static async getMyRecognition(learnerId: string, limit = 10): Promise<MyRecognitionEvent[]> {
    if (!learnerId) return [];
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('mess_choose_recognition')
      .select('id, event_type, dish_name, menu_week, fired_at')
      .eq('learner_id', learnerId)
      .order('fired_at', { ascending: false })
      .limit(limit);
    if (error) {
      logger.error(MODULE, 'getMyRecognition failed', error);
      throw error;
    }
    return (data ?? []) as MyRecognitionEvent[];
  }

  // ── Live counts (aggregate-only RPC — the public return-arc tally) ───

  static async getLiveVoteCounts(limit = 10): Promise<LiveVoteCount[]> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_mess_choose_live_counts', {
      p_scope: 'votes',
      p_limit: limit,
    });
    if (error) {
      logger.error(MODULE, 'getLiveVoteCounts failed', error);
      throw error;
    }
    const results = (data as { results?: unknown })?.results;
    return Array.isArray(results) ? (results as LiveVoteCount[]) : [];
  }
}
