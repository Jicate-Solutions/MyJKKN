import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessMenu,
  CreateMessMenuDTO,
  MealType,
  MenuStatus,
  TierKey,
} from '@/types/campus-living';
import { getEditCutoffMinutes } from './mess-menu-policy-service';

/**
 * Meal-slot start times in IST (Asia/Kolkata). Director D3 lock 2026-05-25.
 * Edits to a meal cell for the current week are blocked once
 *   now() >= meal_start - cutoff_minutes
 * (cutoff_minutes is the `mess.menu.edit_cutoff_minutes` policy, default 120).
 */
const MEAL_START_TIMES_IST: Record<MealType, string> = {
  breakfast: '07:30',
  lunch: '12:30',
  // 'snacks' retained for back-compat with pre-2026-05-25 rows; same window as tea.
  snacks: '16:30',
  tea: '16:30',
  dinner: '19:00',
};

const ISO_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Build a UTC Date for the given ISO-day-of-week, week_start_date and IST meal start. */
function mealStartUtc(weekStartDate: string, dayOfWeek: number, meal: MealType): Date {
  // dayOfWeek is ISO 1..7 (Mon..Sun). week_start_date is Monday.
  // Offset days: Mon=0, Tue=1, ..., Sun=6.
  const offsetDays = ((dayOfWeek - 1) + 7) % 7;
  const [hh, mm] = MEAL_START_TIMES_IST[meal].split(':').map(Number);
  // Build an IST wall-clock timestamp then translate to UTC.
  // IST is UTC+5:30 (no DST). Compose as ISO with the explicit +05:30 offset.
  const base = new Date(`${weekStartDate}T00:00:00+05:30`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hh - 5, mm - 30, 0, 0); // wall HH:MM IST → UTC by -5:30
  // Note: setUTCHours auto-normalizes negative minutes/hours.
  return base;
}

export class MessMenuService {
  // ── List menus with filters ───────────────────────────────────────
  static async getMenus(
    institutionId: string | undefined,
    filters?: {
      caterer_id?: string;
      block_id?: string;
      week_start_date?: string;
      meal_type?: MealType;
      status?: MenuStatus;
      tier_key?: TierKey;
    },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_menus')
        .select('*', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.caterer_id) query = query.eq('caterer_id', filters.caterer_id);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.week_start_date) query = query.eq('week_start_date', filters.week_start_date);
      if (filters?.meal_type) query = query.eq('meal_type', filters.meal_type);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.tier_key) query = query.eq('tier_key', filters.tier_key);

      const from = (page - 1) * pageSize;
      query = query
        .order('week_start_date', { ascending: false })
        .order('day_of_week')
        .order('meal_type')
        .range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/menu', 'Failed to fetch menus', error);
        throw error;
      }
      return { data: data as MessMenu[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in getMenus', error);
      throw error;
    }
  }

  // ── Single menu ───────────────────────────────────────────────────
  static async getMenu(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_menus')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/menu', 'Failed to fetch menu', error);
        throw error;
      }
      return data as MessMenu | null;
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in getMenu', error);
      throw error;
    }
  }

  // ── Weekly menu for a block ───────────────────────────────────────
  static async getWeeklyMenu(institutionId: string | undefined, weekStartDate: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_menus')
        .select('*')
        .eq('week_start_date', weekStartDate);

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (blockId) query = query.eq('block_id', blockId);
      query = query.order('day_of_week').order('meal_type');

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/menu', 'Failed to fetch weekly menu', error);
        throw error;
      }

      // Organize by day
      const weeklyMenu: Record<number, MessMenu[]> = {};
      for (const menu of (data ?? []) as MessMenu[]) {
        if (!weeklyMenu[menu.day_of_week]) weeklyMenu[menu.day_of_week] = [];
        weeklyMenu[menu.day_of_week].push(menu);
      }

      return weeklyMenu;
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in getWeeklyMenu', error);
      throw error;
    }
  }

  // ── Create menu item ──────────────────────────────────────────────
  static async createMenu(payload: CreateMessMenuDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_menus')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/menu', 'Failed to create menu', error);
        throw error;
      }
      return data as MessMenu;
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in createMenu', error);
      throw error;
    }
  }

  // ── Bulk create weekly plan ───────────────────────────────────────
  static async bulkCreateWeeklyPlan(menus: CreateMessMenuDTO[]) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_menus')
        .insert(menus)
        .select();

      if (error) {
        logger.error('campus-living/menu', 'Failed to bulk create weekly plan', error);
        throw error;
      }
      return data as MessMenu[];
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in bulkCreateWeeklyPlan', error);
      throw error;
    }
  }

  // ── Update menu item ──────────────────────────────────────────────
  static async updateMenu(id: string, payload: Partial<CreateMessMenuDTO>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_menus')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/menu', 'Failed to update menu', error);
        throw error;
      }
      return data as MessMenu;
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in updateMenu', error);
      throw error;
    }
  }

  // ── Delete menu item ──────────────────────────────────────────────
  static async deleteMenu(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('mess_menus')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/menu', 'Failed to delete menu', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in deleteMenu', error);
      throw error;
    }
  }

  // ── Delete entire weekly plan ─────────────────────────────────────
  static async deleteWeeklyPlan(institutionId: string | undefined, weekStartDate: string, catererId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('mess_menus')
        .delete()
        .eq('institution_id', institutionId)
        .eq('week_start_date', weekStartDate)
        .eq('caterer_id', catererId);

      if (error) {
        logger.error('campus-living/menu', 'Failed to delete weekly plan', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in deleteWeeklyPlan', error);
      throw error;
    }
  }

  // ── Update menu status ────────────────────────────────────────────
  static async updateMenuStatus(id: string, status: MenuStatus) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_menus')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/menu', 'Failed to update menu status', error);
        throw error;
      }
      return data as MessMenu;
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in updateMenuStatus', error);
      throw error;
    }
  }

  // ── Get today's menu for a block ──────────────────────────────────
  static async getTodaysMenu(institutionId: string | undefined, blockId?: string) {
    try {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday
      // Calculate week start (Monday)
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      const weekStartDate = monday.toISOString().split('T')[0];

      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_menus')
        .select('*')
        .eq('week_start_date', weekStartDate)
        .eq('day_of_week', dayOfWeek);

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (blockId) query = query.eq('block_id', blockId);
      query = query.order('meal_type');

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/menu', 'Failed to fetch todays menu', error);
        throw error;
      }
      return data as MessMenu[];
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in getTodaysMenu', error);
      throw error;
    }
  }

  // ── NEW (PR 3) — tier-aware weekly menu ───────────────────────────
  /**
   * Fetch the 7 days × 4 meal slots = 28 rows for a single tier in a week.
   * Used by the admin grid editor (PR 4) and the resident-facing menu view.
   */
  static async getMenuForWeek(
    institutionId: string,
    weekStartDate: string,
    tierKey: TierKey,
    catererId?: string,
  ): Promise<MessMenu[]> {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_menus')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('week_start_date', weekStartDate)
        .eq('tier_key', tierKey);

      // Gender dimension: when a caterer is supplied, scope to its rows only so
      // Boys and Girls menus for the same (week, tier) don't bleed together.
      if (catererId) query = query.eq('caterer_id', catererId);

      const { data, error } = await query
        .order('day_of_week')
        .order('meal_type');

      if (error) {
        logger.error('campus-living/menu', 'Failed to fetch menu for week+tier', error);
        throw error;
      }
      return (data ?? []) as MessMenu[];
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in getMenuForWeek', error);
      throw error;
    }
  }

  // ── NEW (PR 3) — distinct active tier_keys ────────────────────────
  /**
   * Returns the distinct tier_key values present for an institution's menus.
   * NULL tier_key rows are excluded. Used by the admin UI tier-selector.
   */
  static async getActiveTiers(institutionId: string): Promise<TierKey[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_menus')
        .select('tier_key')
        .eq('institution_id', institutionId)
        .not('tier_key', 'is', null);

      if (error) {
        logger.error('campus-living/menu', 'Failed to fetch active tiers', error);
        throw error;
      }
      const distinct = new Set<TierKey>();
      for (const row of (data ?? []) as { tier_key: TierKey | null }[]) {
        if (row.tier_key) distinct.add(row.tier_key);
      }
      // Sort by canonical ladder order so UI is deterministic.
      const order: TierKey[] = ['classic', 'premium'];
      return order.filter((t) => distinct.has(t));
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in getActiveTiers', error);
      throw error;
    }
  }

  // ── Copy a week forward (menu-continuity friction-killer) ─────────
  /**
   * Copy the most-recent PRIOR week's menu cells for a (institution, caterer,
   * tier) slot into `targetWeekStart`, so a chairperson starts the week from
   * last week's menu and edits only the deltas — instead of rebuilding all
   * 28 cells from scratch. That rebuild friction is what let weekly publishing
   * lapse, which in turn starves the Choose Your Menu loop of a rating baseline.
   *
   *   • Source = the latest week_start_date < targetWeekStart that has cells
   *     for this exact (institution, caterer, tier).
   *   • Idempotent — cells already present in the target (same day + meal) are
   *     left untouched, so re-clicking never duplicates rows or overwrites an
   *     edit already made this week.
   *   • Copied cells land as status 'planned' (never auto-'published') — the
   *     chairperson reviews/edits first. Human approval stays in the loop.
   *   • Special-day flags are NOT carried forward (a festival is a one-off).
   *
   * Returns { copied, skipped, sourceWeek } for a precise, honest toast.
   */
  static async copyWeekForward(params: {
    institutionId: string;
    catererId: string;
    tierKey: TierKey;
    targetWeekStart: string;
  }): Promise<{ copied: number; skipped: number; sourceWeek: string | null }> {
    const { institutionId, catererId, tierKey, targetWeekStart } = params;
    try {
      const supabase = createClientSupabaseClient();

      // 1) Latest prior week that actually has cells for this slot.
      const { data: priorRows, error: priorErr } = await supabase
        .from('mess_menus')
        .select('week_start_date')
        .eq('institution_id', institutionId)
        .eq('caterer_id', catererId)
        .eq('tier_key', tierKey)
        .lt('week_start_date', targetWeekStart)
        .order('week_start_date', { ascending: false })
        .limit(1);
      if (priorErr) {
        logger.error('campus-living/menu', 'copyWeekForward prior-week lookup failed', priorErr);
        throw priorErr;
      }
      const sourceWeek = (priorRows?.[0]?.week_start_date as string | undefined) ?? null;
      if (!sourceWeek) return { copied: 0, skipped: 0, sourceWeek: null };

      // 2) Source cells + already-present target cells (for idempotency).
      const [srcRes, tgtRes] = await Promise.all([
        supabase
          .from('mess_menus')
          .select('*')
          .eq('institution_id', institutionId)
          .eq('caterer_id', catererId)
          .eq('tier_key', tierKey)
          .eq('week_start_date', sourceWeek),
        supabase
          .from('mess_menus')
          .select('day_of_week, meal_type')
          .eq('institution_id', institutionId)
          .eq('caterer_id', catererId)
          .eq('tier_key', tierKey)
          .eq('week_start_date', targetWeekStart),
      ]);
      if (srcRes.error) {
        logger.error('campus-living/menu', 'copyWeekForward source-load failed', srcRes.error);
        throw srcRes.error;
      }
      if (tgtRes.error) {
        logger.error('campus-living/menu', 'copyWeekForward target-load failed', tgtRes.error);
        throw tgtRes.error;
      }

      const srcCells = (srcRes.data ?? []) as MessMenu[];
      const present = new Set(
        (tgtRes.data ?? []).map((r) => `${r.day_of_week}-${r.meal_type}`),
      );
      const toInsert = srcCells
        .filter((r) => !present.has(`${r.day_of_week}-${r.meal_type}`))
        .map((r) => ({
          institution_id: institutionId,
          caterer_id: catererId,
          tier_key: tierKey,
          week_start_date: targetWeekStart,
          day_of_week: r.day_of_week,
          meal_type: r.meal_type,
          // items is NOT NULL — mirror items_tamil when the source lacked it.
          items: r.items ?? r.items_tamil ?? [],
          items_tamil: r.items_tamil ?? null,
          items_english: r.items_english ?? null,
          status: 'planned' as MenuStatus,
          is_special_day: false,
          special_day_name: null,
          dietary_tags: r.dietary_tags ?? null,
        }));

      const skipped = srcCells.length - toInsert.length;
      if (toInsert.length === 0) return { copied: 0, skipped, sourceWeek };

      const { error: insErr } = await supabase
        .from('mess_menus')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(toInsert as any);
      if (insErr) {
        logger.error('campus-living/menu', 'copyWeekForward insert failed', insErr);
        throw insErr;
      }
      return { copied: toInsert.length, skipped, sourceWeek };
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in copyWeekForward', error);
      throw error;
    }
  }

  // ── NEW (PR 3) — cutoff-aware single-cell upsert ──────────────────
  /**
   * Update a single (institution, week, day, meal, tier) cell, respecting the
   * `mess.menu.edit_cutoff_minutes` policy.
   *
   * Cutoff rule (Director D3, 2026-05-25):
   *   If now() is on/after (meal_start_IST − cutoff_minutes) for that cell,
   *   the edit is rejected with a "meal cutoff exceeded" error.
   *
   * Cutoff applies only to the cell's own (week + day + meal) — editing next
   * week's menu is always allowed because mealStartUtc() returns a future
   * timestamp for next-week cells.
   *
   * If the row does not yet exist (sparse seed cell never written), inserts.
   * If it does, updates only the writable fields (items_tamil, items_english,
   * items, status, is_special_day, special_day_name, dietary_tags).
   */
  static async upsertMenuCell(payload: {
    institution_id: string;
    caterer_id: string;
    week_start_date: string;
    day_of_week: number;
    meal_type: MealType;
    tier_key: TierKey;
    items_tamil?: string[] | null;
    items_english?: string[] | null;
    items?: string[];
    status?: MenuStatus;
    is_special_day?: boolean | null;
    special_day_name?: string | null;
    dietary_tags?: string[] | null;
  }): Promise<MessMenu> {
    try {
      // 1) Cutoff check.
      const cutoffMinutes = await getEditCutoffMinutes();
      const mealStart = mealStartUtc(payload.week_start_date, payload.day_of_week, payload.meal_type);
      const lockAt = new Date(mealStart.getTime() - cutoffMinutes * 60_000);
      const now = new Date();
      if (now >= lockAt) {
        const dayName = ISO_DAYS[payload.day_of_week % 7];
        throw new Error(
          `meal cutoff exceeded: ${dayName} ${payload.meal_type} for week ${payload.week_start_date} ` +
            `locked at ${lockAt.toISOString()} (now ${now.toISOString()}, cutoff ${cutoffMinutes}min)`,
        );
      }

      const supabase = createClientSupabaseClient();

      // 2) Look up existing row (no unique constraint — we identify by tuple).
      //    caterer_id is part of the identity: Boys and Girls cells for the same
      //    (institution, week, day, meal, tier) are DISTINCT rows, so without
      //    this filter a Girls edit would overwrite the Boys row (or vice versa).
      const { data: existingRows, error: lookupError } = await supabase
        .from('mess_menus')
        .select('id')
        .eq('institution_id', payload.institution_id)
        .eq('week_start_date', payload.week_start_date)
        .eq('day_of_week', payload.day_of_week)
        .eq('meal_type', payload.meal_type)
        .eq('tier_key', payload.tier_key)
        .eq('caterer_id', payload.caterer_id)
        .limit(1);

      if (lookupError) {
        logger.error('campus-living/menu', 'upsertMenuCell lookup failed', lookupError);
        throw lookupError;
      }

      // Items column is NOT NULL. Keep `items` mirrored to `items_tamil` when
      // caller doesn't supply it (preserves PR 1 back-compat invariant).
      const items =
        payload.items ?? payload.items_tamil ?? ([] as string[]);

      if (existingRows && existingRows.length > 0) {
        const id = existingRows[0]!.id as string;
        const updatePayload: Record<string, unknown> = {
          items,
          items_tamil: payload.items_tamil ?? null,
          items_english: payload.items_english ?? null,
        };
        if (payload.status !== undefined) updatePayload.status = payload.status;
        if (payload.is_special_day !== undefined) updatePayload.is_special_day = payload.is_special_day;
        if (payload.special_day_name !== undefined) updatePayload.special_day_name = payload.special_day_name;
        if (payload.dietary_tags !== undefined) updatePayload.dietary_tags = payload.dietary_tags;

        const { data, error } = await supabase
          .from('mess_menus')
          .update(updatePayload)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          logger.error('campus-living/menu', 'upsertMenuCell update failed', error);
          throw error;
        }
        return data as MessMenu;
      }

      // 3) Insert new row.
      const insertPayload = {
        institution_id: payload.institution_id,
        caterer_id: payload.caterer_id,
        week_start_date: payload.week_start_date,
        day_of_week: payload.day_of_week,
        meal_type: payload.meal_type,
        tier_key: payload.tier_key,
        items,
        items_tamil: payload.items_tamil ?? null,
        items_english: payload.items_english ?? null,
        status: payload.status ?? 'planned',
        is_special_day: payload.is_special_day ?? false,
        special_day_name: payload.special_day_name ?? null,
        dietary_tags: payload.dietary_tags ?? null,
      };

      const { data, error } = await supabase
        .from('mess_menus')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(insertPayload as any)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/menu', 'upsertMenuCell insert failed', error);
        throw error;
      }
      return data as MessMenu;
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in upsertMenuCell', error);
      throw error;
    }
  }
}
