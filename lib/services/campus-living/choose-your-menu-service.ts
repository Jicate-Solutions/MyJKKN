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
 *   • resident context — active allocation = "is a hosteller" (existence
 *     only); the MENU resolves from the resident's MESS PLAN
 *     (learners_profiles.mess_category_id → mess_categories.name/type →
 *     'classic'|'premium' + boys/girls), NOT the room tier (Director
 *     2026-06-12 — a standard-room resident can buy the Premium mess).
 *   • my activity      — own rows from mess_meal_choices / mess_dish_votes
 *     (RLS: owner via profiles.learner_id chain). Recognition reads moved to
 *     recognition-service.ts (cross-module stream, CARE keystone).
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

/** Who am I, menu-wise: mess plan + gender + the learners_profiles own-rows key. */
export interface MyMealsContext {
  hasActiveAllocation: boolean;
  /** Has a mess plan assigned (mess_category_id) — day scholars included. */
  hasMessPlan: boolean;
  /**
   * Page gate (Director 2026-06-12, interview Q1): allocation OR mess plan —
   * a day scholar who pays for mess sees My Meals too.
   */
  hasMessAccess: boolean;
  /** learners_profiles.id — the key mess_* engagement rows are owned by. */
  learnerId: string | null;
  /** profiles.id (== auth.uid()) — the key mess_meal_ratings rows are owned by. */
  profileId: string | null;
  /** Mess-plan key (mess_categories.menu_tier_key), NOT room tier. */
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

export interface LiveVoteCount {
  item_id: string;
  dish: string;
  net_score: number;
  voters: number;
}

/** One library dish on the resident "Rate dishes" surface (Mode B). */
export interface VotableDish {
  item_id: string;
  dish: string;
  name_tamil: string | null;
  category: string | null;
  net_score: number;
  voters: number;
  /** The caller's own vote, or null if they haven't voted. */
  my_vote: 1 | -1 | null;
}

/** Result of casting/clearing a vote. */
export interface VoteResult {
  ok: boolean;
  error?:
    | 'not_authenticated'
    | 'invalid_vote'
    | 'feature_disabled'
    | 'no_learner_profile'
    | 'plan_not_enabled'
    | 'invalid_dish';
  dish?: string;
  vote?: 1 | -1;
}

/** Result of the admin "recognise upvoters" return-arc action (Mode B). */
export interface RecognizeVotedDishResult {
  ok: boolean;
  error?: 'not_authenticated' | 'not_authorized' | 'invalid_dish' | 'dish_not_on_menu';
  dish?: string;
  /** How many residents were freshly recognised (idempotent — re-runs return 0). */
  recognised?: number;
}

/** One pickable dish for a meal cell (Mode A). */
export interface SwapOption {
  item_id: string;
  dish: string;
  /** Plan line the dish came from, or 'curated'. */
  source_plan: string;
}

/** Error codes fn_mess_choose_set_choice / clear_choice return. */
export type ChooseChoiceError =
  | 'not_authenticated'
  | 'feature_disabled'
  | 'no_learner_profile'
  | 'no_mess_plan'
  | 'plan_not_enabled'
  | 'invalid_meal'
  | 'invalid_day'
  | 'cutoff_passed'
  | 'invalid_option';

export interface ChoiceResult {
  ok: boolean;
  error?: ChooseChoiceError;
  dish?: string;
}

/** Seeded defaults (post vocab-fix migration) — used only when a read fails. */
const POLICY_DEFAULTS: ChooseMenuPolicySnapshot = {
  masterEnabled: false, // fail-dark: a broken read must never light the feature
  personalizationTiers: ['premium'],
  votingTiers: ['classic', 'premium'],
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
      hasMessPlan: false,
      hasMessAccess: false,
      learnerId: null,
      profileId: null,
      tierKey: 'classic',
      gender: null,
    };

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return none;

    // 1. Active allocation EXISTENCE (hostel_allocations.learner_id FKs
    //    profiles = auth uid). Allocation = "you're a hosteller". Access is
    //    allocation OR mess plan (Q1: paying day scholars see My Meals too).
    const { data: allocation, error: allocError } = await supabase
      .from('hostel_allocations')
      .select('id')
      .eq('learner_id', user.id)
      .eq('status', 'active')
      .order('allocation_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (allocError) {
      logger.error(MODULE, 'Failed to fetch active allocation', allocError);
      throw allocError;
    }

    // 2. profiles.learner_id bridge → learners_profiles: the MESS PLAN
    //    (mess_category_id → mess_categories) + learner gender.
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

    // Menu tier = lower(mess_categories.name): 'classic' | 'premium'.
    // No mess plan assigned yet → 'classic' (the base menu everyone gets).
    let tierKey = 'classic';
    let gender: MenuGender | null = null;
    let hasMessPlan = false;
    if (learnerId) {
      const { data: learner, error: learnerError } = await supabase
        .from('learners_profiles')
        .select('gender, messCategory:mess_category_id(name, type, menu_tier_key)')
        .eq('id', learnerId)
        .maybeSingle();
      if (learnerError) {
        logger.error(MODULE, 'Failed to fetch learner mess plan', learnerError);
        throw learnerError;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cat = (learner as any)?.messCategory as
        | { name?: string; type?: string; menu_tier_key?: string | null }
        | null;
      hasMessPlan = !!cat;
      // Stable slug first (rename-safe); name-derived fallback for any row
      // predating the freeze trigger.
      const catKey =
        cat?.menu_tier_key ??
        (cat?.name ?? '').trim().toLowerCase().replace(/\s+/g, '_');
      if (catKey) tierKey = catKey;
      // Gender: the mess the plan belongs to wins (you eat where you're
      // enrolled); learner profile gender is the fallback.
      if (cat?.type === 'boys' || cat?.type === 'girls') {
        gender = cat.type;
      } else {
        const g = ((learner as { gender?: string } | null)?.gender ?? '')
          .toString()
          .toUpperCase();
        if (g === 'MALE') gender = 'boys';
        else if (g === 'FEMALE') gender = 'girls';
      }
    }

    const hasActiveAllocation = !!allocation;
    return {
      hasActiveAllocation,
      hasMessPlan,
      hasMessAccess: hasActiveAllocation || hasMessPlan,
      learnerId,
      profileId: user.id,
      tierKey,
      gender,
    };
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

  // ── Mode A: pick your meal (RPCs guard master/plan/cutoff server-side) ──

  static async getSwapOptions(
    weekStart: string,
    dayOfWeek: number,
    mealType: string,
    gender: MenuGender
  ): Promise<SwapOption[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_mess_choose_swap_options', {
        p_week_start: weekStart,
        p_day_of_week: dayOfWeek,
        p_meal_type: mealType,
        p_gender: gender,
      });
      if (error) throw error;
      const options = (data as { options?: unknown })?.options;
      return Array.isArray(options) ? (options as SwapOption[]) : [];
    } catch (e) {
      logger.warn(MODULE, 'getSwapOptions failed — rendering empty', e);
      return [];
    }
  }

  static async setChoice(
    weekStart: string,
    dayOfWeek: number,
    mealType: string,
    itemId: string
  ): Promise<ChoiceResult> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_mess_choose_set_choice', {
      p_week_start: weekStart,
      p_day_of_week: dayOfWeek,
      p_meal_type: mealType,
      p_item_id: itemId,
    });
    if (error) {
      logger.error(MODULE, 'setChoice failed', error);
      throw error;
    }
    return (data ?? { ok: false }) as ChoiceResult;
  }

  static async clearChoice(
    weekStart: string,
    dayOfWeek: number,
    mealType: string
  ): Promise<ChoiceResult> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_mess_choose_clear_choice', {
      p_week_start: weekStart,
      p_day_of_week: dayOfWeek,
      p_meal_type: mealType,
    });
    if (error) {
      logger.error(MODULE, 'clearChoice failed', error);
      throw error;
    }
    return (data ?? { ok: false }) as ChoiceResult;
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

  // ── Mode B: menu voting / wishlist ───────────────────────────────────

  /**
   * Browse/search the library WITH the live tally + my own vote per dish.
   * Server-side aggregate (fn_mess_choose_votable_dishes) so the per-resident
   * rows of OTHER residents never reach the client — only the caller's own
   * vote and the public net score do.
   */
  static async getVotableDishes(search = '', limit = 50): Promise<VotableDish[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_mess_choose_votable_dishes', {
        p_search: search || null,
        p_limit: limit,
      });
      if (error) throw error;
      const results = (data as { results?: unknown })?.results;
      return Array.isArray(results) ? (results as VotableDish[]) : [];
    } catch (e) {
      logger.warn(MODULE, 'getVotableDishes failed — rendering empty', e);
      return [];
    }
  }

  /** Cast (or flip) my thumbs ±1 on a dish. RPC re-checks master + tier gate. */
  static async castVote(itemId: string, vote: 1 | -1): Promise<VoteResult> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_mess_choose_cast_vote', {
      p_item_id: itemId,
      p_vote: vote,
    });
    if (error) {
      logger.error(MODULE, 'castVote failed', error);
      throw error;
    }
    return (data ?? { ok: false }) as VoteResult;
  }

  /** Withdraw my vote on a dish. */
  static async clearVote(itemId: string): Promise<VoteResult> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_mess_choose_clear_vote', {
      p_item_id: itemId,
    });
    if (error) {
      logger.error(MODULE, 'clearVote failed', error);
      throw error;
    }
    return (data ?? { ok: false }) as VoteResult;
  }

  /**
   * ADMIN return-arc — confer 'vote_landed' recognition on every upvoter of a
   * dish, but only when it is verifiably on a real menu cell that week (the RPC
   * enforces both the menu.publish permission and the on-menu integrity check;
   * idempotent per learner+item+week).
   */
  static async recognizeVotedDish(
    itemId: string,
    weekStart: string
  ): Promise<RecognizeVotedDishResult> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_mess_choose_recognize_voted_dish', {
      p_item_id: itemId,
      p_week_start: weekStart,
    });
    if (error) {
      logger.error(MODULE, 'recognizeVotedDish failed', error);
      throw error;
    }
    return (data ?? { ok: false }) as RecognizeVotedDishResult;
  }
}
