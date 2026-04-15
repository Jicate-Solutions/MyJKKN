import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessWasteLog,
  CreateMessWasteLogDTO,
  MealType,
  WasteCategory,
} from '@/types/campus-living';

export class MessWasteService {
  // ── List waste logs ───────────────────────────────────────────────
  static async getWasteLogs(
    institutionId: string,
    filters?: {
      caterer_id?: string;
      date_from?: string;
      date_to?: string;
      meal_type?: MealType;
      waste_category?: WasteCategory;
    },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_waste_log')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.caterer_id) query = query.eq('caterer_id', filters.caterer_id);
      if (filters?.date_from) query = query.gte('date', filters.date_from);
      if (filters?.date_to) query = query.lte('date', filters.date_to);
      if (filters?.meal_type) query = query.eq('meal_type', filters.meal_type);
      if (filters?.waste_category) query = query.eq('waste_category', filters.waste_category);

      const from = (page - 1) * pageSize;
      query = query.order('date', { ascending: false }).order('meal_type').range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/waste', 'Failed to fetch waste logs', error);
        throw error;
      }
      return { data: data as MessWasteLog[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/waste', 'Unexpected error in getWasteLogs', error);
      throw error;
    }
  }

  // ── Single waste log ──────────────────────────────────────────────
  static async getWasteLog(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_waste_log')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/waste', 'Failed to fetch waste log', error);
        throw error;
      }
      return data as MessWasteLog;
    } catch (error) {
      logger.error('campus-living/waste', 'Unexpected error in getWasteLog', error);
      throw error;
    }
  }

  // ── Create waste log ──────────────────────────────────────────────
  static async createWasteLog(payload: CreateMessWasteLogDTO) {
    try {
      const supabase = createClientSupabaseClient();

      // Auto-calculate waste percentage if not provided
      const enriched = {
        ...payload,
        waste_percentage:
          payload.waste_percentage ||
          (payload.prepared_quantity_kg > 0
            ? Math.round((payload.waste_quantity_kg / payload.prepared_quantity_kg) * 100 * 10) / 10
            : 0),
      };

      const { data, error } = await supabase
        .from('mess_waste_log')
        .insert(enriched)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/waste', 'Failed to create waste log', error);
        throw error;
      }
      return data as MessWasteLog;
    } catch (error) {
      logger.error('campus-living/waste', 'Unexpected error in createWasteLog', error);
      throw error;
    }
  }

  // ── Update waste log ──────────────────────────────────────────────
  static async updateWasteLog(id: string, payload: Partial<CreateMessWasteLogDTO>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_waste_log')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/waste', 'Failed to update waste log', error);
        throw error;
      }
      return data as MessWasteLog;
    } catch (error) {
      logger.error('campus-living/waste', 'Unexpected error in updateWasteLog', error);
      throw error;
    }
  }

  // ── Delete waste log ──────────────────────────────────────────────
  static async deleteWasteLog(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('mess_waste_log')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/waste', 'Failed to delete waste log', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/waste', 'Unexpected error in deleteWasteLog', error);
      throw error;
    }
  }

  // ── Waste analytics for a caterer over a date range ───────────────
  static async getWasteAnalytics(
    catererId: string,
    dateFrom: string,
    dateTo: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_waste_log')
        .select('*')
        .eq('caterer_id', catererId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date');

      if (error) {
        logger.error('campus-living/waste', 'Failed to fetch waste analytics', error);
        throw error;
      }

      const logs = (data ?? []) as MessWasteLog[];
      if (logs.length === 0) {
        return {
          total_prepared_kg: 0,
          total_consumed_kg: 0,
          total_waste_kg: 0,
          average_waste_percentage: 0,
          total_cost_of_waste: 0,
          by_meal_type: {},
          by_category: {},
          daily_trend: [],
        };
      }

      const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
      const avg = (arr: number[]) => arr.length > 0 ? sum(arr) / arr.length : 0;

      // By meal type
      const byMealType: Record<string, { count: number; waste_kg: number; avg_percentage: number }> = {};
      for (const l of logs) {
        if (!byMealType[l.meal_type]) byMealType[l.meal_type] = { count: 0, waste_kg: 0, avg_percentage: 0 };
        byMealType[l.meal_type].count++;
        byMealType[l.meal_type].waste_kg += l.waste_quantity_kg;
      }
      for (const mt of Object.keys(byMealType)) {
        const mtLogs = logs.filter((l) => l.meal_type === mt);
        byMealType[mt].avg_percentage = Math.round(avg(mtLogs.map((l) => l.waste_percentage)) * 10) / 10;
      }

      // By category
      const byCategory: Record<string, { count: number; waste_kg: number }> = {};
      for (const l of logs) {
        const cat = l.waste_category || 'other';
        if (!byCategory[cat]) byCategory[cat] = { count: 0, waste_kg: 0 };
        byCategory[cat].count++;
        byCategory[cat].waste_kg += l.waste_quantity_kg;
      }

      // Daily trend
      const dailyMap: Record<string, { waste_kg: number; percentage: number[] }> = {};
      for (const l of logs) {
        if (!dailyMap[l.date]) dailyMap[l.date] = { waste_kg: 0, percentage: [] };
        dailyMap[l.date].waste_kg += l.waste_quantity_kg;
        dailyMap[l.date].percentage.push(l.waste_percentage);
      }
      const dailyTrend = Object.entries(dailyMap).map(([date, v]) => ({
        date,
        waste_kg: Math.round(v.waste_kg * 10) / 10,
        avg_percentage: Math.round(avg(v.percentage) * 10) / 10,
      }));

      return {
        total_prepared_kg: Math.round(sum(logs.map((l) => l.prepared_quantity_kg)) * 10) / 10,
        total_consumed_kg: Math.round(sum(logs.map((l) => l.consumed_quantity_kg)) * 10) / 10,
        total_waste_kg: Math.round(sum(logs.map((l) => l.waste_quantity_kg)) * 10) / 10,
        average_waste_percentage: Math.round(avg(logs.map((l) => l.waste_percentage)) * 10) / 10,
        total_cost_of_waste: Math.round(sum(logs.map((l) => l.cost_of_waste ?? 0)) * 100) / 100,
        by_meal_type: byMealType,
        by_category: byCategory,
        daily_trend: dailyTrend,
      };
    } catch (error) {
      logger.error('campus-living/waste', 'Unexpected error in getWasteAnalytics', error);
      throw error;
    }
  }

  // ── Cost calculation for a period ─────────────────────────────────
  static async getWasteCost(institutionId: string, dateFrom: string, dateTo: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_waste_log')
        .select('cost_of_waste, waste_quantity_kg')
        .eq('institution_id', institutionId)
        .gte('date', dateFrom)
        .lte('date', dateTo);

      if (error) {
        logger.error('campus-living/waste', 'Failed to fetch waste cost', error);
        throw error;
      }

      const logs = data ?? [];
      return {
        total_cost: logs.reduce((s, l) => s + (l.cost_of_waste ?? 0), 0),
        total_waste_kg: logs.reduce((s, l) => s + l.waste_quantity_kg, 0),
        record_count: logs.length,
      };
    } catch (error) {
      logger.error('campus-living/waste', 'Unexpected error in getWasteCost', error);
      throw error;
    }
  }
}
