'use client';

/**
 * Choose Your Menu — resident hooks (P0c, 2026-06-11).
 *
 * Every query key lives under ['mess', 'choose', ...] — the EXACT prefix the
 * P0b settings form invalidates after a save (`choose-your-menu-policy-form
 * .tsx` fires invalidateQueries({ queryKey: ['mess', 'choose'] })), so a
 * super-admin flipping the master switch propagates to open resident pages
 * on their next focus/refetch without a deploy.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  ChooseYourMenuService,
  type MenuGender,
} from '@/lib/services/campus-living/choose-your-menu-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export function useChoosePolicies() {
  return useQuery({
    queryKey: ['mess', 'choose', 'policies'],
    queryFn: () => ChooseYourMenuService.getPolicySnapshot(),
    staleTime: 60_000,
  });
}

export function useMyMealsContext() {
  const { profile } = useAuth();
  const uid = profile?.id ?? '';
  return useQuery({
    queryKey: ['mess', 'choose', 'context', uid],
    queryFn: () => ChooseYourMenuService.getMyMealsContext(),
    enabled: !!uid,
    staleTime: 5 * 60_000,
  });
}

export function useMyWeekChoices(learnerId: string | null, weekStart: string, enabled = true) {
  return useQuery({
    queryKey: ['mess', 'choose', 'my-choices', learnerId, weekStart],
    queryFn: () => ChooseYourMenuService.getMyWeekChoices(learnerId!, weekStart),
    enabled: enabled && !!learnerId && !!weekStart,
  });
}

export function useMyVotes(learnerId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['mess', 'choose', 'my-votes', learnerId],
    queryFn: () => ChooseYourMenuService.getMyVotes(learnerId!),
    enabled: enabled && !!learnerId,
  });
}

export function useLiveVoteCounts(enabled = true, limit = 10) {
  return useQuery({
    queryKey: ['mess', 'choose', 'live-votes', limit],
    queryFn: () => ChooseYourMenuService.getLiveVoteCounts(limit),
    enabled,
    // The live tally is the return-arc — keep it fresh-ish without hammering.
    staleTime: 30_000,
  });
}

// ── Mode A: pick your meal ──────────────────────────────────────────────────

export function useSwapOptions(
  weekStart: string,
  dayOfWeek: number | null,
  mealType: string | null,
  gender: MenuGender | null,
  enabled = true
) {
  return useQuery({
    queryKey: ['mess', 'choose', 'swap-options', weekStart, dayOfWeek, mealType, gender],
    queryFn: () =>
      ChooseYourMenuService.getSwapOptions(weekStart, dayOfWeek!, mealType!, gender!),
    enabled: enabled && !!weekStart && !!dayOfWeek && !!mealType && !!gender,
    staleTime: 60_000,
  });
}

/** Set/clear a meal pick. Invalidates the ['mess','choose'] family so "my
 *  activity" and the live tally (the return-arc) move immediately. */
export function useSetChoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { weekStart: string; dayOfWeek: number; mealType: string; itemId: string }) =>
      ChooseYourMenuService.setChoice(vars.weekStart, vars.dayOfWeek, vars.mealType, vars.itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mess', 'choose'] }),
  });
}

export function useClearChoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { weekStart: string; dayOfWeek: number; mealType: string }) =>
      ChooseYourMenuService.clearChoice(vars.weekStart, vars.dayOfWeek, vars.mealType),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mess', 'choose'] }),
  });
}

// ── Mode B: menu voting / wishlist ──────────────────────────────────────────

/** Browseable/searchable library with live tally + my vote per dish. */
export function useVotableDishes(search = '', enabled = true) {
  return useQuery({
    queryKey: ['mess', 'choose', 'votable-dishes', search],
    queryFn: () => ChooseYourMenuService.getVotableDishes(search),
    enabled,
    staleTime: 30_000,
  });
}

/** Cast/flip a thumbs ±1. Invalidates the family so my-votes + the live tally move. */
export function useCastVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { itemId: string; vote: 1 | -1 }) =>
      ChooseYourMenuService.castVote(vars.itemId, vars.vote),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mess', 'choose'] }),
  });
}

/** Withdraw my vote. Invalidates the family. */
export function useClearVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { itemId: string }) => ChooseYourMenuService.clearVote(vars.itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mess', 'choose'] }),
  });
}

/** ADMIN — confer recognition on a voted dish that landed on the menu (return-arc). */
export function useRecognizeVotedDish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { itemId: string; weekStart: string }) =>
      ChooseYourMenuService.recognizeVotedDish(vars.itemId, vars.weekStart),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mess', 'choose'] }),
  });
}

// ── Weekly menu (shared cache with the staff viewer) ────────────────────────

/** Cell shape returned by fn_mess_menu_week (matches the mess/menu viewer). */
export interface MenuWeekCell {
  day_of_week: number;
  meal_type: string;
  items: string[];
  items_tamil: string[];
  items_english: string[];
  status: string;
  is_special_day: boolean;
  special_day_name: string | null;
  /**
   * Menu-row identity (mess_menus.id / institution_id / week_start_date of the
   * EFFECTIVE week the cell came from). Present only once the 2026-07-26
   * mess-loop migration extends fn_mess_menu_week — optional so the rating
   * surface stays dark until the migration is applied (Director-gated).
   */
  id?: string;
  institution_id?: string;
  week_start_date?: string;
}

export interface MenuWeekResult {
  week_start: string;
  tier_key: string;
  gender: string;
  cells: MenuWeekCell[];
}

/**
 * Same query key family as the staff viewer's useMenuWeek
 * (['mess-menu-week', week, tier, gender]) so the two surfaces share cache.
 * fn_mess_menu_week has the default-week fallback baked in server-side.
 */
export function useMyMenuWeek(
  weekStart: string,
  tier: string,
  gender: MenuGender | null
) {
  return useQuery({
    queryKey: ['mess-menu-week', weekStart, tier, gender],
    staleTime: 5 * 60_000,
    enabled: !!weekStart && !!tier && !!gender,
    queryFn: async (): Promise<MenuWeekResult> => {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_mess_menu_week', {
        p_week_start: weekStart,
        p_tier_key: tier,
        p_gender: gender,
      });
      if (error) throw error;
      return (data ?? { week_start: weekStart, tier_key: tier, gender, cells: [] }) as MenuWeekResult;
    },
  });
}
