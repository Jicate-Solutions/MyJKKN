import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessCaterer,
  CreateMessCatererDTO,
  UpdateMessCatererDTO,
  MessCatererBlock,
  CatererStatus,
} from '@/types/campus-living';

export class MessCatererService {
  // ── List caterers ─────────────────────────────────────────────────
  static async getCaterers(
    institutionId: string,
    filters?: { status?: CatererStatus; search?: string },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_caterers')
        .select('*, mess_caterer_blocks(*, hostel_blocks(name, code))', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,owner_name.ilike.%${filters.search}%`);
      }

      const from = (page - 1) * pageSize;
      query = query.order('name').range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/caterer', 'Failed to fetch caterers', error);
        throw error;
      }
      return { data: data as (MessCaterer & { mess_caterer_blocks: unknown[] })[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in getCaterers', error);
      throw error;
    }
  }

  // ── Single caterer ────────────────────────────────────────────────
  static async getCaterer(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_caterers')
        .select('*, mess_caterer_blocks(*, hostel_blocks(name, code))')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/caterer', 'Failed to fetch caterer', error);
        throw error;
      }
      return data as MessCaterer & { mess_caterer_blocks: unknown[] };
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in getCaterer', error);
      throw error;
    }
  }

  // ── Create caterer ────────────────────────────────────────────────
  static async createCaterer(payload: CreateMessCatererDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_caterers')
        .insert(payload as any)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/caterer', 'Failed to create caterer', error);
        throw error;
      }
      return data as MessCaterer;
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in createCaterer', error);
      throw error;
    }
  }

  // ── Update caterer ────────────────────────────────────────────────
  static async updateCaterer(id: string, payload: UpdateMessCatererDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_caterers')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/caterer', 'Failed to update caterer', error);
        throw error;
      }
      return data as MessCaterer;
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in updateCaterer', error);
      throw error;
    }
  }

  // ── Delete caterer ────────────────────────────────────────────────
  static async deleteCaterer(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('mess_caterers')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/caterer', 'Failed to delete caterer', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in deleteCaterer', error);
      throw error;
    }
  }

  // ── Contract tracking ─────────────────────────────────────────────
  static async getExpiringContracts(institutionId: string, withinDays = 30) {
    try {
      const supabase = createClientSupabaseClient();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + withinDays);

      const { data, error } = await supabase
        .from('mess_caterers')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .lte('contract_end_date', futureDate.toISOString().split('T')[0])
        .gte('contract_end_date', new Date().toISOString().split('T')[0])
        .order('contract_end_date');

      if (error) {
        logger.error('campus-living/caterer', 'Failed to fetch expiring contracts', error);
        throw error;
      }
      return data as MessCaterer[];
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in getExpiringContracts', error);
      throw error;
    }
  }

  // ── Update performance score ──────────────────────────────────────
  static async updatePerformanceScore(catererId: string, score: number) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_caterers')
        .update({ performance_score: score })
        .eq('id', catererId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/caterer', 'Failed to update performance score', error);
        throw error;
      }
      return data as MessCaterer;
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in updatePerformanceScore', error);
      throw error;
    }
  }

  // ── Assign caterer to block ───────────────────────────────────────
  static async assignToBlock(
    institutionId: string,
    catererId: string,
    blockId: string,
    startDate: string,
    endDate?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_caterer_blocks')
        .insert({
          institution_id: institutionId,
          caterer_id: catererId,
          block_id: blockId,
          start_date: startDate,
          end_date: endDate ?? null,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/caterer', 'Failed to assign caterer to block', error);
        throw error;
      }
      return data as MessCatererBlock;
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in assignToBlock', error);
      throw error;
    }
  }

  // ── Remove caterer from block ─────────────────────────────────────
  static async removeFromBlock(assignmentId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_caterer_blocks')
        .update({
          is_active: false,
          end_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', assignmentId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/caterer', 'Failed to remove caterer from block', error);
        throw error;
      }
      return data as MessCatererBlock;
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in removeFromBlock', error);
      throw error;
    }
  }

  // ── Get caterer for a block ───────────────────────────────────────
  static async getCatererForBlock(blockId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_caterer_blocks')
        .select('*, mess_caterers(*)')
        .eq('block_id', blockId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/caterer', 'Failed to fetch caterer for block', error);
        throw error;
      }
      return data as (MessCatererBlock & { mess_caterers: MessCaterer }) | null;
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in getCatererForBlock', error);
      throw error;
    }
  }

  // ── Compute aggregate performance from feedback ───────────────────
  static async computePerformanceFromFeedback(catererId: string, dateFrom?: string, dateTo?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_feedback')
        .select('taste_rating, hygiene_rating, quantity_rating, variety_rating, overall_rating')
        .eq('caterer_id', catererId);

      if (dateFrom) query = query.gte('date', dateFrom);
      if (dateTo) query = query.lte('date', dateTo);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/caterer', 'Failed to fetch feedback for performance', error);
        throw error;
      }

      if (!data || data.length === 0) return { score: 0, feedbackCount: 0 };

      const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

      return {
        score: Math.round(avg(data.map((f) => f.overall_rating)) * 20), // convert 1-5 to 0-100
        feedbackCount: data.length,
        breakdown: {
          taste: avg(data.map((f) => f.taste_rating)),
          hygiene: avg(data.map((f) => f.hygiene_rating)),
          quantity: avg(data.map((f) => f.quantity_rating)),
          variety: avg(data.map((f) => f.variety_rating)),
          overall: avg(data.map((f) => f.overall_rating)),
        },
      };
    } catch (error) {
      logger.error('campus-living/caterer', 'Unexpected error in computePerformanceFromFeedback', error);
      throw error;
    }
  }
}
