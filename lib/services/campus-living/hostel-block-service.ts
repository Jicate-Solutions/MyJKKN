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
    institutionId: string | undefined,
    filters?: BlockFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_blocks')
        .select('*', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
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
        .maybeSingle();

      if (error) {
        logger.error('campus-living/blocks', 'Failed to fetch block', error);
        throw error;
      }
      return data as (HostelBlock & { hostel_rooms: unknown[]; hostel_wardens: unknown[] }) | null;
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in getBlock', error);
      throw error;
    }
  }

  // ── Create ────────────────────────────────────────────────────────
  // The block is also written to `hostel_block_institutions` as the
  // primary owner. The M2M is consulted by `role_has_hostel_block_scope()`
  // which 4 RLS policies on hostel_blocks (and rooms/beds via cascade)
  // depend on — without the junction row, non-super-admin readers cannot
  // see the block. See migration 20260421000004_hostel_blocks_multi_college.
  //
  // The two writes are NOT in a single transaction (PostgREST limitation).
  // If the M2M insert fails after the block insert succeeds, the block
  // exists but is RLS-invisible. Recovery: re-running this method is safe
  // (the block insert would fail on whatever uniqueness constraint hit it,
  // OR the M2M insert would no-op due to PRIMARY KEY conflict). For now
  // we surface the M2M failure as an error — the orphan block can be
  // backfilled by the platform_policies migration pattern if needed.
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

      const block = data as HostelBlock;

      // Mirror to M2M with is_primary=true. Skipped only if institution_id
      // is null (rare — a shared block created before any college claims
      // primary ownership; UI doesn't currently allow this path).
      if (block.institution_id) {
        const { error: m2mError } = await supabase
          .from('hostel_block_institutions')
          .insert({
            block_id: block.id,
            institution_id: block.institution_id,
            is_primary: true,
          });
        if (m2mError) {
          logger.error(
            'campus-living/blocks',
            'Block created but M2M junction insert failed — block will be RLS-invisible to non-super-admins until backfilled',
            { blockId: block.id, error: m2mError },
          );
          throw m2mError;
        }
      }

      return block;
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
  static async getOccupancySummary(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      let q = supabase
        .from('hostel_blocks')
        .select('id, name, code, hostel_type, total_rooms, total_capacity, current_occupancy, status')
        .eq('status', 'active')
        .order('name');
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;

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
  static async getBlocksByType(institutionId: string | undefined, hostelType: string) {
    try {
      const supabase = createClientSupabaseClient();
      let q = supabase
        .from('hostel_blocks')
        .select('*')
        .eq('hostel_type', hostelType as any)
        .eq('status', 'active')
        .order('name');
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;

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
