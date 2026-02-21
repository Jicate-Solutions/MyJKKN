import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelRoom,
  CreateHostelRoomDTO,
  UpdateHostelRoomDTO,
  RoomFilters,
} from '@/types/campus-living';

export class HostelRoomService {
  // ── List rooms with filters ───────────────────────────────────────
  static async getRooms(
    institutionId: string,
    filters?: RoomFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_rooms')
        .select('*, hostel_beds(*)', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.room_type) query = query.eq('room_type', filters.room_type);
      if (filters?.ac_status) query = query.eq('ac_status', filters.ac_status);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.floor !== undefined) query = query.eq('floor', filters.floor);

      const from = (page - 1) * pageSize;
      query = query.order('room_number').range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch rooms', error);
        throw error;
      }
      return { data: data as (HostelRoom & { hostel_beds: unknown[] })[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getRooms', error);
      throw error;
    }
  }

  // ── Rooms by block ────────────────────────────────────────────────
  static async getRoomsByBlock(blockId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('*, hostel_beds(*)')
        .eq('block_id', blockId)
        .order('floor')
        .order('room_number');

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch rooms by block', error);
        throw error;
      }
      return data as (HostelRoom & { hostel_beds: unknown[] })[];
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getRoomsByBlock', error);
      throw error;
    }
  }

  // ── Single room with beds ─────────────────────────────────────────
  static async getRoom(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('*, hostel_beds(*), hostel_blocks(name, code)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch room', error);
        throw error;
      }
      return data as HostelRoom & { hostel_beds: unknown[]; hostel_blocks: unknown };
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getRoom', error);
      throw error;
    }
  }

  // ── Create ────────────────────────────────────────────────────────
  static async createRoom(payload: CreateHostelRoomDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/rooms', 'Failed to create room', error);
        throw error;
      }
      return data as HostelRoom;
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in createRoom', error);
      throw error;
    }
  }

  // ── Update ────────────────────────────────────────────────────────
  static async updateRoom(id: string, payload: UpdateHostelRoomDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/rooms', 'Failed to update room', error);
        throw error;
      }
      return data as HostelRoom;
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in updateRoom', error);
      throw error;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────
  static async deleteRoom(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_rooms')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/rooms', 'Failed to delete room', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in deleteRoom', error);
      throw error;
    }
  }

  // ── Check room availability ───────────────────────────────────────
  static async checkAvailability(roomId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('id, room_number, capacity, current_occupancy, status')
        .eq('id', roomId)
        .single();

      if (error) {
        logger.error('campus-living/rooms', 'Failed to check availability', error);
        throw error;
      }

      return {
        ...data,
        is_available: data.status === 'available' || data.status === 'partially_occupied',
        available_beds: data.capacity - data.current_occupancy,
      };
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in checkAvailability', error);
      throw error;
    }
  }

  // ── Update room status ────────────────────────────────────────────
  static async updateStatus(id: string, status: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/rooms', 'Failed to update room status', error);
        throw error;
      }
      return data as HostelRoom;
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in updateStatus', error);
      throw error;
    }
  }

  // ── Available rooms in a block ────────────────────────────────────
  static async getAvailableRooms(blockId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('*, hostel_beds(*)')
        .eq('block_id', blockId)
        .in('status', ['available', 'partially_occupied'])
        .order('floor')
        .order('room_number');

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch available rooms', error);
        throw error;
      }
      return data as (HostelRoom & { hostel_beds: unknown[] })[];
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getAvailableRooms', error);
      throw error;
    }
  }
}
