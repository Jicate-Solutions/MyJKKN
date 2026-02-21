import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelWarden,
  CreateHostelWardenDTO,
  UpdateHostelWardenDTO,
  WardenDesignation,
} from '@/types/campus-living';

export class HostelWardenService {
  // ── List wardens ──────────────────────────────────────────────────
  static async getWardens(
    institutionId: string,
    filters?: { block_id?: string; designation?: WardenDesignation; is_active?: boolean }
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_wardens')
        .select('*, hostel_blocks(name, code)')
        .eq('institution_id', institutionId);

      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.designation) query = query.eq('designation', filters.designation);
      if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active);

      query = query.order('designation').order('assigned_at', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/wardens', 'Failed to fetch wardens', error);
        throw error;
      }
      return data as (HostelWarden & { hostel_blocks: unknown })[];
    } catch (error) {
      logger.error('campus-living/wardens', 'Unexpected error in getWardens', error);
      throw error;
    }
  }

  // ── Single warden ─────────────────────────────────────────────────
  static async getWarden(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_wardens')
        .select('*, hostel_blocks(name, code, hostel_type)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/wardens', 'Failed to fetch warden', error);
        throw error;
      }
      return data as HostelWarden & { hostel_blocks: unknown };
    } catch (error) {
      logger.error('campus-living/wardens', 'Unexpected error in getWarden', error);
      throw error;
    }
  }

  // ── Create ────────────────────────────────────────────────────────
  static async createWarden(payload: CreateHostelWardenDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_wardens')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/wardens', 'Failed to create warden', error);
        throw error;
      }
      return data as HostelWarden;
    } catch (error) {
      logger.error('campus-living/wardens', 'Unexpected error in createWarden', error);
      throw error;
    }
  }

  // ── Update ────────────────────────────────────────────────────────
  static async updateWarden(id: string, payload: UpdateHostelWardenDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_wardens')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/wardens', 'Failed to update warden', error);
        throw error;
      }
      return data as HostelWarden;
    } catch (error) {
      logger.error('campus-living/wardens', 'Unexpected error in updateWarden', error);
      throw error;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────
  static async deleteWarden(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_wardens')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/wardens', 'Failed to delete warden', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/wardens', 'Unexpected error in deleteWarden', error);
      throw error;
    }
  }

  // ── Assign warden to block ────────────────────────────────────────
  static async assignToBlock(wardenId: string, blockId: string, floors?: number[]) {
    try {
      const supabase = createClientSupabaseClient();
      const updatePayload: Record<string, unknown> = {
        block_id: blockId,
        is_active: true,
        assigned_at: new Date().toISOString(),
        relieved_at: null,
      };
      if (floors) updatePayload.assigned_floors = floors;

      const { data, error } = await supabase
        .from('hostel_wardens')
        .update(updatePayload)
        .eq('id', wardenId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/wardens', 'Failed to assign warden to block', error);
        throw error;
      }
      return data as HostelWarden;
    } catch (error) {
      logger.error('campus-living/wardens', 'Unexpected error in assignToBlock', error);
      throw error;
    }
  }

  // ── Relieve warden from block ─────────────────────────────────────
  static async relieveFromBlock(wardenId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_wardens')
        .update({
          is_active: false,
          relieved_at: new Date().toISOString(),
        })
        .eq('id', wardenId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/wardens', 'Failed to relieve warden', error);
        throw error;
      }
      return data as HostelWarden;
    } catch (error) {
      logger.error('campus-living/wardens', 'Unexpected error in relieveFromBlock', error);
      throw error;
    }
  }

  // ── Rotate wardens between blocks ─────────────────────────────────
  static async rotate(
    rotations: { wardenId: string; newBlockId: string; floors?: number[] }[]
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const results: HostelWarden[] = [];

      for (const rotation of rotations) {
        const updatePayload: Record<string, unknown> = {
          block_id: rotation.newBlockId,
          assigned_at: new Date().toISOString(),
          relieved_at: null,
        };
        if (rotation.floors) updatePayload.assigned_floors = rotation.floors;

        const { data, error } = await supabase
          .from('hostel_wardens')
          .update(updatePayload)
          .eq('id', rotation.wardenId)
          .select()
          .single();

        if (error) {
          logger.error('campus-living/wardens', 'Failed to rotate warden', error);
          throw error;
        }
        results.push(data as HostelWarden);
      }

      return results;
    } catch (error) {
      logger.error('campus-living/wardens', 'Unexpected error in rotate', error);
      throw error;
    }
  }

  // ── Get wardens for a block ───────────────────────────────────────
  static async getWardensByBlock(blockId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_wardens')
        .select('*')
        .eq('block_id', blockId)
        .eq('is_active', true)
        .order('designation');

      if (error) {
        logger.error('campus-living/wardens', 'Failed to fetch wardens by block', error);
        throw error;
      }
      return data as HostelWarden[];
    } catch (error) {
      logger.error('campus-living/wardens', 'Unexpected error in getWardensByBlock', error);
      throw error;
    }
  }
}
