import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessFeedback,
  CreateMessFeedbackDTO,
  MealType,
} from '@/types/campus-living';

export class MessFeedbackService {
  // ── List feedback ─────────────────────────────────────────────────
  static async getFeedback(
    institutionId: string,
    filters?: {
      caterer_id?: string;
      date?: string;
      meal_type?: MealType;
      is_complaint?: boolean;
      learner_id?: string;
    },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_feedback')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.caterer_id) query = query.eq('caterer_id', filters.caterer_id);
      if (filters?.date) query = query.eq('date', filters.date);
      if (filters?.meal_type) query = query.eq('meal_type', filters.meal_type);
      if (filters?.is_complaint !== undefined) query = query.eq('is_complaint', filters.is_complaint);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/feedback', 'Failed to fetch feedback', error);
        throw error;
      }
      return { data: data as MessFeedback[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/feedback', 'Unexpected error in getFeedback', error);
      throw error;
    }
  }

  // ── Single feedback ───────────────────────────────────────────────
  static async getFeedbackById(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_feedback')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/feedback', 'Failed to fetch feedback', error);
        throw error;
      }
      return data as MessFeedback;
    } catch (error) {
      logger.error('campus-living/feedback', 'Unexpected error in getFeedbackById', error);
      throw error;
    }
  }

  // ── Submit feedback ───────────────────────────────────────────────
  static async submitFeedback(payload: CreateMessFeedbackDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_feedback')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/feedback', 'Failed to submit feedback', error);
        throw error;
      }
      return data as MessFeedback;
    } catch (error) {
      logger.error('campus-living/feedback', 'Unexpected error in submitFeedback', error);
      throw error;
    }
  }

  // ── Update feedback ───────────────────────────────────────────────
  static async updateFeedback(id: string, payload: Partial<CreateMessFeedbackDTO>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_feedback')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/feedback', 'Failed to update feedback', error);
        throw error;
      }
      return data as MessFeedback;
    } catch (error) {
      logger.error('campus-living/feedback', 'Unexpected error in updateFeedback', error);
      throw error;
    }
  }

  // ── Delete feedback ───────────────────────────────────────────────
  static async deleteFeedback(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('mess_feedback')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/feedback', 'Failed to delete feedback', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/feedback', 'Unexpected error in deleteFeedback', error);
      throw error;
    }
  }

  // ── Caterer scoring aggregation ───────────────────────────────────
  static async getCatererScoring(
    catererId: string,
    dateFrom?: string,
    dateTo?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_feedback')
        .select('taste_rating, hygiene_rating, quantity_rating, variety_rating, overall_rating, meal_type, is_complaint')
        .eq('caterer_id', catererId);

      if (dateFrom) query = query.gte('date', dateFrom);
      if (dateTo) query = query.lte('date', dateTo);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/feedback', 'Failed to fetch caterer scoring', error);
        throw error;
      }

      const feedbacks = data ?? [];
      if (feedbacks.length === 0) {
        return {
          total_feedback: 0,
          average_scores: { taste: 0, hygiene: 0, quantity: 0, variety: 0, overall: 0 },
          complaint_count: 0,
          by_meal_type: {},
        };
      }

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

      // Group by meal type
      const byMealType: Record<string, { count: number; avg_rating: number }> = {};
      for (const f of feedbacks) {
        if (!byMealType[f.meal_type]) {
          byMealType[f.meal_type] = { count: 0, avg_rating: 0 };
        }
        byMealType[f.meal_type].count++;
      }
      // Calculate average per meal type
      for (const mealType of Object.keys(byMealType)) {
        const meals = feedbacks.filter((f) => f.meal_type === mealType);
        byMealType[mealType].avg_rating = avg(meals.map((m) => m.overall_rating));
      }

      return {
        total_feedback: feedbacks.length,
        average_scores: {
          taste: Math.round(avg(feedbacks.map((f) => f.taste_rating)) * 10) / 10,
          hygiene: Math.round(avg(feedbacks.map((f) => f.hygiene_rating)) * 10) / 10,
          quantity: Math.round(avg(feedbacks.map((f) => f.quantity_rating)) * 10) / 10,
          variety: Math.round(avg(feedbacks.map((f) => f.variety_rating)) * 10) / 10,
          overall: Math.round(avg(feedbacks.map((f) => f.overall_rating)) * 10) / 10,
        },
        complaint_count: feedbacks.filter((f) => f.is_complaint).length,
        by_meal_type: byMealType,
      };
    } catch (error) {
      logger.error('campus-living/feedback', 'Unexpected error in getCatererScoring', error);
      throw error;
    }
  }

  // ── Complaints list ───────────────────────────────────────────────
  static async getComplaints(
    institutionId: string,
    page = 1,
    pageSize = 20
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const from = (page - 1) * pageSize;

      const { data, error, count } = await supabase
        .from('mess_feedback')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId)
        .eq('is_complaint', true)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        logger.error('campus-living/feedback', 'Failed to fetch complaints', error);
        throw error;
      }
      return { data: data as MessFeedback[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/feedback', 'Unexpected error in getComplaints', error);
      throw error;
    }
  }

  // ── Daily rating trend ────────────────────────────────────────────
  static async getDailyRatingTrend(catererId: string, dateFrom: string, dateTo: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_feedback')
        .select('date, overall_rating')
        .eq('caterer_id', catererId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date');

      if (error) {
        logger.error('campus-living/feedback', 'Failed to fetch daily rating trend', error);
        throw error;
      }

      // Group by date and average
      const grouped: Record<string, number[]> = {};
      for (const f of (data ?? [])) {
        if (!grouped[f.date]) grouped[f.date] = [];
        grouped[f.date].push(f.overall_rating);
      }

      return Object.entries(grouped).map(([date, ratings]) => ({
        date,
        average_rating: Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 10) / 10,
        count: ratings.length,
      }));
    } catch (error) {
      logger.error('campus-living/feedback', 'Unexpected error in getDailyRatingTrend', error);
      throw error;
    }
  }
}
