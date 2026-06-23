/**
 * Choose Your Menu — Mode C: Special-Day / Festival Picker (2026-06-23).
 * ============================================================================
 *
 * propose -> approve/reject flow over the live `mess_special_day_proposals`
 * substrate (#1341). All cross-resident reads/writes go through the SECURITY
 * DEFINER RPCs added in 20260623001000 (anon-revoked):
 *
 *   • fn_mess_special_day_can_propose()      — am I allowed to propose?
 *   • fn_mess_special_day_propose(...)        — create a 'pending' proposal
 *   • fn_mess_special_day_approve(id)         — approve + mark cell + recognise upvoters
 *   • fn_mess_special_day_reject(id)          — reject
 *   • fn_mess_special_day_list(status, upcoming) — admin queue + resident "coming up"
 *
 * The dish picker reuses ChooseYourMenuService.getVotableDishes (Mode B).
 * Untyped client cast (substrate tables not in generated types). Reads fail soft.
 *
 * Spec: specs/choose-your-menu-platform-spec-2026-06-11.md §Mode C.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'campus-living/mess-special-day';

export type SpecialDayStatus = 'pending' | 'approved' | 'rejected';

export interface SpecialDayProposal {
  id: string;
  special_date: string;
  meal_type: string;
  tier_key: string;
  gender: string;
  occasion_name: string | null;
  status: SpecialDayStatus;
  created_at: string;
  reviewed_at: string | null;
  proposed_by_name: string;
  dishes: string[] | null;
}

export interface ProposeResult {
  ok: boolean;
  error?:
    | 'not_authenticated'
    | 'feature_disabled'
    | 'special_day_disabled'
    | 'not_authorized'
    | 'invalid_date'
    | 'invalid_meal'
    | 'invalid_gender'
    | 'no_items'
    | 'invalid_items';
  proposal_id?: string;
}

export interface ReviewResult {
  ok: boolean;
  error?: 'not_authenticated' | 'not_authorized' | 'not_found' | 'already_reviewed';
  status?: string;
  occasion?: string;
  cells_marked?: number;
  recognised?: number;
}

export class MessSpecialDayService {
  /** Can the signed-in user propose festival menus? (admin or a proposer role) */
  static async canPropose(): Promise<boolean> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_mess_special_day_can_propose');
      if (error) throw error;
      return data === true;
    } catch (e) {
      logger.warn(MODULE, 'canPropose failed — defaulting false', e);
      return false;
    }
  }

  /** List proposals. status=null → all; upcomingOnly → special_date >= today. */
  static async list(status: SpecialDayStatus | null = null, upcomingOnly = false): Promise<SpecialDayProposal[]> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_mess_special_day_list', {
        p_status: status,
        p_upcoming_only: upcomingOnly,
      });
      if (error) throw error;
      const results = (data as { results?: unknown })?.results;
      return Array.isArray(results) ? (results as SpecialDayProposal[]) : [];
    } catch (e) {
      logger.warn(MODULE, 'list failed — rendering empty', e);
      return [];
    }
  }

  static async propose(input: {
    specialDate: string;
    mealType: string;
    tierKey: string;
    gender: 'boys' | 'girls';
    itemIds: string[];
    occasion?: string;
  }): Promise<ProposeResult> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_mess_special_day_propose', {
      p_special_date: input.specialDate,
      p_meal_type: input.mealType,
      p_tier_key: input.tierKey,
      p_gender: input.gender,
      p_item_ids: input.itemIds,
      p_occasion: input.occasion ?? null,
    });
    if (error) {
      logger.error(MODULE, 'propose failed', error);
      throw error;
    }
    return (data ?? { ok: false }) as ProposeResult;
  }

  static async approve(proposalId: string): Promise<ReviewResult> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_mess_special_day_approve', {
      p_proposal_id: proposalId,
    });
    if (error) {
      logger.error(MODULE, 'approve failed', error);
      throw error;
    }
    return (data ?? { ok: false }) as ReviewResult;
  }

  static async reject(proposalId: string): Promise<ReviewResult> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_mess_special_day_reject', {
      p_proposal_id: proposalId,
    });
    if (error) {
      logger.error(MODULE, 'reject failed', error);
      throw error;
    }
    return (data ?? { ok: false }) as ReviewResult;
  }
}
