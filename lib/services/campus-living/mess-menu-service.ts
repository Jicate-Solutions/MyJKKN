import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessMenu,
  CreateMessMenuDTO,
  MealType,
  MenuStatus,
} from '@/types/campus-living';

export class MessMenuService {
  // ── List menus with filters ───────────────────────────────────────
  static async getMenus(
    institutionId: string,
    filters?: {
      caterer_id?: string;
      block_id?: string;
      week_start_date?: string;
      meal_type?: MealType;
      status?: MenuStatus;
    },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_menus')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.caterer_id) query = query.eq('caterer_id', filters.caterer_id);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.week_start_date) query = query.eq('week_start_date', filters.week_start_date);
      if (filters?.meal_type) query = query.eq('meal_type', filters.meal_type);
      if (filters?.status) query = query.eq('status', filters.status);

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
        .single();

      if (error) {
        logger.error('campus-living/menu', 'Failed to fetch menu', error);
        throw error;
      }
      return data as MessMenu;
    } catch (error) {
      logger.error('campus-living/menu', 'Unexpected error in getMenu', error);
      throw error;
    }
  }

  // ── Weekly menu for a block ───────────────────────────────────────
  static async getWeeklyMenu(institutionId: string, weekStartDate: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_menus')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('week_start_date', weekStartDate);

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
  static async deleteWeeklyPlan(institutionId: string, weekStartDate: string, catererId: string) {
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
  static async getTodaysMenu(institutionId: string, blockId?: string) {
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
        .eq('institution_id', institutionId)
        .eq('week_start_date', weekStartDate)
        .eq('day_of_week', dayOfWeek);

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
}
