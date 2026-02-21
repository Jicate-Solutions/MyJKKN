import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelBed,
  CreateHostelBedDTO,
  UpdateHostelBedDTO,
  BedStatus,
} from '@/types/campus-living';

export class HostelBedService {
  // ── List beds with optional filters ───────────────────────────────
  static async getBeds(
    institutionId: string,
    filters?: { room_id?: string; status?: BedStatus },
    page = 1,
    pageSize = 100
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_beds')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.room_id) query = query.eq('room_id', filters.room_id);
      if (filters?.status) query = query.eq('status', filters.status);

      const from = (page - 1) * pageSize;
      query = query.order('bed_number').range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/beds', 'Failed to fetch beds', error);
        throw error;
      }
      return { data: data as HostelBed[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/beds', 'Unexpected error in getBeds', error);
      throw error;
    }
  }

  // ── Beds by room ──────────────────────────────────────────────────
  static async getBedsByRoom(roomId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_beds')
        .select('*')
        .eq('room_id', roomId)
        .order('bed_number');

      if (error) {
        logger.error('campus-living/beds', 'Failed to fetch beds by room', error);
        throw error;
      }
      return data as HostelBed[];
    } catch (error) {
      logger.error('campus-living/beds', 'Unexpected error in getBedsByRoom', error);
      throw error;
    }
  }

  // ── Single bed ────────────────────────────────────────────────────
  static async getBed(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_beds')
        .select('*, hostel_rooms(room_number, block_id)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/beds', 'Failed to fetch bed', error);
        throw error;
      }
      return data as HostelBed & { hostel_rooms: unknown };
    } catch (error) {
      logger.error('campus-living/beds', 'Unexpected error in getBed', error);
      throw error;
    }
  }

  // ── Create ────────────────────────────────────────────────────────
  static async createBed(payload: CreateHostelBedDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_beds')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/beds', 'Failed to create bed', error);
        throw error;
      }
      return data as HostelBed;
    } catch (error) {
      logger.error('campus-living/beds', 'Unexpected error in createBed', error);
      throw error;
    }
  }

  // ── Bulk create beds for a room ───────────────────────────────────
  static async bulkCreateBeds(beds: CreateHostelBedDTO[]) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_beds')
        .insert(beds)
        .select();

      if (error) {
        logger.error('campus-living/beds', 'Failed to bulk create beds', error);
        throw error;
      }
      return data as HostelBed[];
    } catch (error) {
      logger.error('campus-living/beds', 'Unexpected error in bulkCreateBeds', error);
      throw error;
    }
  }

  // ── Update ────────────────────────────────────────────────────────
  static async updateBed(id: string, payload: UpdateHostelBedDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_beds')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/beds', 'Failed to update bed', error);
        throw error;
      }
      return data as HostelBed;
    } catch (error) {
      logger.error('campus-living/beds', 'Unexpected error in updateBed', error);
      throw error;
    }
  }

  // ── Update bed status ─────────────────────────────────────────────
  static async updateStatus(id: string, status: BedStatus, occupantId?: string | null) {
    try {
      const supabase = createClientSupabaseClient();
      const updatePayload: Record<string, unknown> = { status };
      if (occupantId !== undefined) {
        updatePayload.current_occupant_id = occupantId;
      }

      const { data, error } = await supabase
        .from('hostel_beds')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/beds', 'Failed to update bed status', error);
        throw error;
      }
      return data as HostelBed;
    } catch (error) {
      logger.error('campus-living/beds', 'Unexpected error in updateStatus', error);
      throw error;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────
  static async deleteBed(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_beds')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/beds', 'Failed to delete bed', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/beds', 'Unexpected error in deleteBed', error);
      throw error;
    }
  }

  // ── Available beds in a room ──────────────────────────────────────
  static async getAvailableBeds(roomId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_beds')
        .select('*')
        .eq('room_id', roomId)
        .eq('status', 'available')
        .order('bed_number');

      if (error) {
        logger.error('campus-living/beds', 'Failed to fetch available beds', error);
        throw error;
      }
      return data as HostelBed[];
    } catch (error) {
      logger.error('campus-living/beds', 'Unexpected error in getAvailableBeds', error);
      throw error;
    }
  }
}
