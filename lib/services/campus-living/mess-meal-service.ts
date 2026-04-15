import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessMealRecord,
  CreateMessMealRecordDTO,
  MessMealBooking,
  MealRecordFilters,
  MealType,
  BookingStatus,
} from '@/types/campus-living';

export class MessMealService {
  // ── List meal records with filters ────────────────────────────────
  static async getMealRecords(
    institutionId: string,
    filters?: MealRecordFilters,
    page = 1,
    pageSize = 100
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_meal_records')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.date) query = query.eq('date', filters.date);
      if (filters?.meal_type) query = query.eq('meal_type', filters.meal_type);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);

      const from = (page - 1) * pageSize;
      query = query.order('date', { ascending: false }).order('meal_type').range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/meals', 'Failed to fetch meal records', error);
        throw error;
      }
      return { data: data as MessMealRecord[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getMealRecords', error);
      throw error;
    }
  }

  // ── Single meal record ────────────────────────────────────────────
  static async getMealRecord(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_records')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to fetch meal record', error);
        throw error;
      }
      return data as MessMealRecord;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getMealRecord', error);
      throw error;
    }
  }

  // ── Record meal consumption (scan) ────────────────────────────────
  static async recordMeal(payload: CreateMessMealRecordDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_records')
        .insert({
          ...payload,
          consumed: true,
          scan_time: payload.scan_time || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to record meal', error);
        throw error;
      }
      return data as MessMealRecord;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in recordMeal', error);
      throw error;
    }
  }

  // ── Bulk record meals (batch scan) ────────────────────────────────
  static async bulkRecordMeals(records: CreateMessMealRecordDTO[]) {
    try {
      const supabase = createClientSupabaseClient();
      const enriched = records.map((r) => ({
        ...r,
        consumed: true,
        scan_time: r.scan_time || new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('mess_meal_records')
        .insert(enriched)
        .select();

      if (error) {
        logger.error('campus-living/meals', 'Failed to bulk record meals', error);
        throw error;
      }
      return data as MessMealRecord[];
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in bulkRecordMeals', error);
      throw error;
    }
  }

  // ── Record guest meal ─────────────────────────────────────────────
  static async recordGuestMeal(payload: CreateMessMealRecordDTO & { guest_name: string; guest_count: number }) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_records')
        .insert({
          ...payload,
          is_guest_meal: true,
          consumed: true,
          scan_time: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to record guest meal', error);
        throw error;
      }
      return data as MessMealRecord;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in recordGuestMeal', error);
      throw error;
    }
  }

  // ── Update meal record ────────────────────────────────────────────
  static async updateMealRecord(id: string, payload: Partial<CreateMessMealRecordDTO>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_records')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to update meal record', error);
        throw error;
      }
      return data as MessMealRecord;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in updateMealRecord', error);
      throw error;
    }
  }

  // ── Delete meal record ────────────────────────────────────────────
  static async deleteMealRecord(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('mess_meal_records')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/meals', 'Failed to delete meal record', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in deleteMealRecord', error);
      throw error;
    }
  }

  // ── Meal count for a date and meal type ───────────────────────────
  static async getMealCount(institutionId: string, date: string, mealType?: MealType) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_meal_records')
        .select('*', { count: 'exact', head: true })
        .eq('institution_id', institutionId)
        .eq('date', date)
        .eq('consumed', true);

      if (mealType) query = query.eq('meal_type', mealType);

      const { count, error } = await query;
      if (error) {
        logger.error('campus-living/meals', 'Failed to get meal count', error);
        throw error;
      }
      return count ?? 0;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getMealCount', error);
      throw error;
    }
  }

  // ── Meal bookings ─────────────────────────────────────────────────
  static async getBookings(
    institutionId: string,
    filters?: { learner_id?: string; date?: string; meal_type?: MealType; status?: BookingStatus }
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_meal_bookings')
        .select('*')
        .eq('institution_id', institutionId);

      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters?.date) query = query.eq('date', filters.date);
      if (filters?.meal_type) query = query.eq('meal_type', filters.meal_type);
      if (filters?.status) query = query.eq('status', filters.status);

      query = query.order('date').order('meal_type');

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/meals', 'Failed to fetch bookings', error);
        throw error;
      }
      return data as MessMealBooking[];
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getBookings', error);
      throw error;
    }
  }

  // ── Create booking ────────────────────────────────────────────────
  static async createBooking(payload: Omit<MessMealBooking, 'id' | 'created_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_bookings')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to create booking', error);
        throw error;
      }
      return data as MessMealBooking;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in createBooking', error);
      throw error;
    }
  }

  // ── Cancel booking ────────────────────────────────────────────────
  static async cancelBooking(bookingId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_bookings')
        .update({
          status: 'cancelled' as BookingStatus,
          cancellation_time: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to cancel booking', error);
        throw error;
      }
      return data as MessMealBooking;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in cancelBooking', error);
      throw error;
    }
  }

  // ── Learner meal history ──────────────────────────────────────────
  static async getLearnerMealHistory(
    learnerId: string,
    dateFrom?: string,
    dateTo?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_meal_records')
        .select('*')
        .eq('learner_id', learnerId);

      if (dateFrom) query = query.gte('date', dateFrom);
      if (dateTo) query = query.lte('date', dateTo);
      query = query.order('date', { ascending: false }).order('meal_type');

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/meals', 'Failed to fetch learner meal history', error);
        throw error;
      }
      return data as MessMealRecord[];
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getLearnerMealHistory', error);
      throw error;
    }
  }
}
