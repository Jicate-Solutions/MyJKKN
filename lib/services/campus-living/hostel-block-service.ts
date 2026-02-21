import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelBlock,
  CreateHostelBlockDTO,
  UpdateHostelBlockDTO,
  BlockFilters,
} from '@/types/campus-living';

export class HostelBlockService {
  // ── List blocks with filters ──────────────────────────────────────
  static async getBlocks(
    institutionId: string,
    filters?: BlockFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_blocks')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.hostel_type) query = query.eq('hostel_type', filters.hostel_type);
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`);
      }

      const from = (page - 1) * pageSize;
      query = query.order('name').range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/blocks', 'Failed to fetch blocks', error);
        throw error;
      }
      return { data: data as HostelBlock[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in getBlocks', error);
      throw error;
    }
  }

  // ── Single block with relations ───────────────────────────────────
  static async getBlock(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_blocks')
        .select('*, hostel_rooms(*), hostel_wardens(*)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/blocks', 'Failed to fetch block', error);
        throw error;
      }
      return data as HostelBlock & { hostel_rooms: unknown[]; hostel_wardens: unknown[] };
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in getBlock', error);
      throw error;
    }
  }

  // ── Create ────────────────────────────────────────────────────────
  static async createBlock(payload: CreateHostelBlockDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_blocks')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/blocks', 'Failed to create block', error);
        throw error;
      }
      return data as HostelBlock;
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in createBlock', error);
      throw error;
    }
  }

  // ── Update ────────────────────────────────────────────────────────
  static async updateBlock(id: string, payload: UpdateHostelBlockDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_blocks')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/blocks', 'Failed to update block', error);
        throw error;
      }
      return data as HostelBlock;
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in updateBlock', error);
      throw error;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────
  static async deleteBlock(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_blocks')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/blocks', 'Failed to delete block', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in deleteBlock', error);
      throw error;
    }
  }

  // ── Occupancy summary for all blocks ──────────────────────────────
  static async getOccupancySummary(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_blocks')
        .select('id, name, code, hostel_type, total_rooms, total_capacity, current_occupancy, status')
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .order('name');

      if (error) {
        logger.error('campus-living/blocks', 'Failed to fetch occupancy summary', error);
        throw error;
      }

      const summary = (data ?? []).map((block) => ({
        ...block,
        available_capacity: block.total_capacity - block.current_occupancy,
        occupancy_percentage:
          block.total_capacity > 0
            ? Math.round((block.current_occupancy / block.total_capacity) * 100)
            : 0,
      }));

      return summary;
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in getOccupancySummary', error);
      throw error;
    }
  }

  // ── Blocks by hostel type ─────────────────────────────────────────
  static async getBlocksByType(institutionId: string, hostelType: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_blocks')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('hostel_type', hostelType)
        .eq('status', 'active')
        .order('name');

      if (error) {
        logger.error('campus-living/blocks', 'Failed to fetch blocks by type', error);
        throw error;
      }
      return data as HostelBlock[];
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in getBlocksByType', error);
      throw error;
    }
  }
}
