import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelInspection,
  CreateHostelInspectionDTO,
  InspectionType,
} from '@/types/campus-living';

export class InspectionService {
  // ── List inspections with filters ─────────────────────────────────
  static async getInspections(
    institutionId: string,
    filters?: {
      block_id?: string;
      inspection_type?: InspectionType;
      follow_up_required?: boolean;
      date_from?: string;
      date_to?: string;
    },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_inspections')
        .select('*, hostel_blocks(name, code)', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.inspection_type) query = query.eq('inspection_type', filters.inspection_type);
      if (filters?.follow_up_required !== undefined) query = query.eq('follow_up_required', filters.follow_up_required);
      if (filters?.date_from) query = query.gte('inspection_date', filters.date_from);
      if (filters?.date_to) query = query.lte('inspection_date', filters.date_to);

      const from = (page - 1) * pageSize;
      query = query.order('inspection_date', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/inspections', 'Failed to fetch inspections', error);
        throw error;
      }
      return { data: data as (HostelInspection & { hostel_blocks: unknown })[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in getInspections', error);
      throw error;
    }
  }

  // ── Single inspection ─────────────────────────────────────────────
  static async getInspection(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_inspections')
        .select('*, hostel_blocks(name, code)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/inspections', 'Failed to fetch inspection', error);
        throw error;
      }
      return data as HostelInspection & { hostel_blocks: unknown };
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in getInspection', error);
      throw error;
    }
  }

  // ── Create inspection ─────────────────────────────────────────────
  static async createInspection(payload: CreateHostelInspectionDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_inspections')
        .insert({
          ...payload,
          follow_up_completed: false,
        } as any)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/inspections', 'Failed to create inspection', error);
        throw error;
      }
      return data as HostelInspection;
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in createInspection', error);
      throw error;
    }
  }

  // ── Update inspection ─────────────────────────────────────────────
  static async updateInspection(id: string, payload: Partial<HostelInspection>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_inspections')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/inspections', 'Failed to update inspection', error);
        throw error;
      }
      return data as HostelInspection;
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in updateInspection', error);
      throw error;
    }
  }

  // ── Delete inspection ─────────────────────────────────────────────
  static async deleteInspection(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_inspections')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/inspections', 'Failed to delete inspection', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in deleteInspection', error);
      throw error;
    }
  }

  // ── Update score ──────────────────────────────────────────────────
  static async updateScore(id: string, score: number) {
    try {
      return await this.updateInspection(id, { score });
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in updateScore', error);
      throw error;
    }
  }

  // ── Mark follow-up completed ──────────────────────────────────────
  static async markFollowUpCompleted(id: string) {
    try {
      return await this.updateInspection(id, { follow_up_completed: true });
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in markFollowUpCompleted', error);
      throw error;
    }
  }

  // ── Pending follow-ups ────────────────────────────────────────────
  static async getPendingFollowUps(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_inspections')
        .select('*, hostel_blocks(name, code)')
        .eq('institution_id', institutionId)
        .eq('follow_up_required', true)
        .eq('follow_up_completed', false)
        .order('follow_up_deadline');

      if (error) {
        logger.error('campus-living/inspections', 'Failed to fetch pending follow-ups', error);
        throw error;
      }
      return data as (HostelInspection & { hostel_blocks: unknown })[];
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in getPendingFollowUps', error);
      throw error;
    }
  }

  // ── Overdue follow-ups ────────────────────────────────────────────
  static async getOverdueFollowUps(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('hostel_inspections')
        .select('*, hostel_blocks(name, code)')
        .eq('institution_id', institutionId)
        .eq('follow_up_required', true)
        .eq('follow_up_completed', false)
        .lt('follow_up_deadline', today)
        .order('follow_up_deadline');

      if (error) {
        logger.error('campus-living/inspections', 'Failed to fetch overdue follow-ups', error);
        throw error;
      }
      return data as (HostelInspection & { hostel_blocks: unknown })[];
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in getOverdueFollowUps', error);
      throw error;
    }
  }

  // ── Inspection history for a block ────────────────────────────────
  static async getBlockHistory(blockId: string, limit = 10) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_inspections')
        .select('*')
        .eq('block_id', blockId)
        .order('inspection_date', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('campus-living/inspections', 'Failed to fetch block history', error);
        throw error;
      }
      return data as HostelInspection[];
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in getBlockHistory', error);
      throw error;
    }
  }

  // ── Average scores by block ───────────────────────────────────────
  static async getAverageScoresByBlock(institutionId: string, dateFrom?: string, dateTo?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_inspections')
        .select('block_id, score, hostel_blocks(name, code)')
        .eq('institution_id', institutionId)
        .not('score', 'is', null);

      if (dateFrom) query = query.gte('inspection_date', dateFrom);
      if (dateTo) query = query.lte('inspection_date', dateTo);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/inspections', 'Failed to fetch average scores', error);
        throw error;
      }

      // Group by block and calculate averages
      const blockScores: Record<string, { block_id: string; name: string; scores: number[] }> = {};
      for (const item of (data ?? []) as any[]) {
        const bid = item.block_id;
        if (!blockScores[bid]) {
          blockScores[bid] = {
            block_id: bid,
            name: item.hostel_blocks?.name ?? bid,
            scores: [],
          };
        }
        if (item.score !== null) blockScores[bid].scores.push(item.score);
      }

      return Object.values(blockScores).map((b) => ({
        block_id: b.block_id,
        block_name: b.name,
        average_score: b.scores.length > 0 ? Math.round((b.scores.reduce((s, v) => s + v, 0) / b.scores.length) * 10) / 10 : 0,
        inspection_count: b.scores.length,
      }));
    } catch (error) {
      logger.error('campus-living/inspections', 'Unexpected error in getAverageScoresByBlock', error);
      throw error;
    }
  }
}
