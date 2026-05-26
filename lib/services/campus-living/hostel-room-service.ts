// hostel-rooms-v2 PR 2 (2026-05-26): institution_id + status + current_occupancy
// dropped from hostel_rooms. Occupancy now derives from v_hostel_room_occupancy.
// College access flows through room_institution_access (RLS handles scope).
//
// hostel-rooms-v2 PR 3 (2026-05-26): added enriched read methods
// (getRoomsByBlockWithOccupancy / getRoomWithOccupancy) that join the view's
// derived occupancy alongside hostel_rooms — restores the status badges +
// occupancy displays that PR 2 left as placeholders.
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelRoom,
  CreateHostelRoomDTO,
  UpdateHostelRoomDTO,
  RoomFilters,
} from '@/types/campus-living';

// ─── Occupancy shape (mirrors v_hostel_room_occupancy) ─────────────────────
export type RoomDerivedStatus = 'available' | 'partially_occupied' | 'full' | 'unknown';

export interface RoomOccupancySnapshot {
  active_residents: number;
  beds_available: number;
  derived_status: RoomDerivedStatus;
}

export type HostelRoomWithOccupancy = HostelRoom & RoomOccupancySnapshot;
export type HostelRoomWithBedsAndOccupancy = HostelRoomWithOccupancy & {
  hostel_beds: unknown[];
};

const EMPTY_OCCUPANCY: RoomOccupancySnapshot = {
  active_residents: 0,
  beds_available: 0,
  derived_status: 'unknown',
};

/**
 * Look up live occupancy for a set of room IDs via v_hostel_room_occupancy.
 * Returns a Map keyed by room_id for cheap O(1) lookup at zip-merge time.
 * Empty input short-circuits to an empty map.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOccupancyMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  roomIds: string[],
): Promise<Map<string, RoomOccupancySnapshot>> {
  const map = new Map<string, RoomOccupancySnapshot>();
  if (roomIds.length === 0) return map;
  const { data, error } = await supabase
    .from('v_hostel_room_occupancy')
    .select('room_id, active_residents, beds_available, derived_status')
    .in('room_id', roomIds);
  if (error) {
    logger.warn('campus-living/rooms', 'fetchOccupancyMap soft-failed; defaulting to unknown', error);
    return map;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    map.set(row.room_id, {
      active_residents: Number(row.active_residents ?? 0),
      beds_available: Number(row.beds_available ?? 0),
      derived_status: (row.derived_status as RoomDerivedStatus) ?? 'unknown',
    });
  }
  return map;
}

export class HostelRoomService {
  // ── List rooms with filters ───────────────────────────────────────
  // institutionId parameter retained as a chip-filter convenience (still
  // used by the legacy admin UI) — when provided, narrows via the junction
  // table. RLS already scopes; this is a UI filter, not a security gate.
  static async getRooms(
    institutionId: string | undefined,
    filters?: RoomFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_rooms')
        .select('*, hostel_beds(*)', { count: 'exact' });

      if (institutionId) {
        // Narrow to rooms granted to this institution via the new junction.
        const { data: roomIds, error: junctionErr } = await supabase
          .from('room_institution_access')
          .select('room_id')
          .eq('institution_id', institutionId)
          .eq('is_active', true);

        if (junctionErr) {
          logger.error('campus-living/rooms', 'Failed to filter rooms by institution', junctionErr);
          throw junctionErr;
        }
        const ids = (roomIds ?? []).map((r) => r.room_id);
        if (ids.length === 0) {
          return { data: [] as (HostelRoom & { hostel_beds: unknown[] })[], count: 0 };
        }
        query = query.in('id', ids);
      }
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.room_type) query = query.eq('room_type', filters.room_type);
      if (filters?.ac_status) query = query.eq('ac_status', filters.ac_status);
      if (filters?.floor !== undefined) query = query.eq('floor', filters.floor);

      const from = (page - 1) * pageSize;
      query = query.order('room_number').range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch rooms', error);
        throw error;
      }
      return { data: (data ?? []) as (HostelRoom & { hostel_beds: unknown[] })[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getRooms', error);
      throw error;
    }
  }

  // ── Rooms by block (legacy, no occupancy) ─────────────────────────
  // Kept for backward compatibility with any pre-PR-3 callers; prefer
  // getRoomsByBlockWithOccupancy for new UI work.
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
      return (data ?? []) as (HostelRoom & { hostel_beds: unknown[] })[];
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getRoomsByBlock', error);
      throw error;
    }
  }

  // ── Rooms by block + live occupancy (PR 3) ────────────────────────
  // Restores the per-row status badge + occupancy display that PR 2 left
  // as placeholders. Pulls rooms + beds, then zip-merges with one read of
  // v_hostel_room_occupancy. Falls back to derived_status='unknown' if the
  // view query soft-fails (we never want the page to crash on the badge).
  static async getRoomsByBlockWithOccupancy(blockId: string): Promise<HostelRoomWithBedsAndOccupancy[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('*, hostel_beds(*)')
        .eq('block_id', blockId)
        .order('floor')
        .order('room_number');

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch rooms by block (with occupancy)', error);
        throw error;
      }
      const rooms = (data ?? []) as (HostelRoom & { hostel_beds: unknown[] })[];
      const ids = rooms.map((r) => r.id);
      const occMap = await fetchOccupancyMap(supabase, ids);
      return rooms.map((r) => ({
        ...r,
        ...(occMap.get(r.id) ?? EMPTY_OCCUPANCY),
      }));
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getRoomsByBlockWithOccupancy', error);
      throw error;
    }
  }

  // ── All rooms with block + live occupancy (PR 4a) ─────────────────
  // Powers /admin/hostel/rooms — Director-facing room catalog. Pulls every
  // hostel_rooms row + a join into hostel_blocks for the block name, then
  // zip-merges with v_hostel_room_occupancy for active_residents +
  // beds_available + derived_status. No pagination (146 rows today; safe
  // client-side). RLS handles institution scoping at the view level — for
  // super_admin this surfaces the full catalog.
  static async getAllRoomsWithOccupancy(): Promise<
    (HostelRoomWithOccupancy & { hostel_blocks: { id: string; name: string; code: string | null } | null })[]
  > {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('*, hostel_blocks(id, name, code)')
        .order('room_number');

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch all rooms (with occupancy)', error);
        throw error;
      }
      const rooms = (data ?? []) as (HostelRoom & {
        hostel_blocks: { id: string; name: string; code: string | null } | null;
      })[];
      const ids = rooms.map((r) => r.id);
      const occMap = await fetchOccupancyMap(supabase, ids);
      return rooms.map((r) => ({
        ...r,
        ...(occMap.get(r.id) ?? EMPTY_OCCUPANCY),
      }));
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getAllRoomsWithOccupancy', error);
      throw error;
    }
  }

  // ── Single room with beds (legacy, no occupancy) ───────────────────
  static async getRoom(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('*, hostel_beds(*), hostel_blocks(name, code)')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch room', error);
        throw error;
      }
      return data as (HostelRoom & { hostel_beds: unknown[]; hostel_blocks: unknown }) | null;
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getRoom', error);
      throw error;
    }
  }

  // ── Single room with beds + live occupancy (PR 3) ──────────────────
  // Used by /campus-living/blocks/[id]/rooms/[roomId] detail page to restore
  // the status badge + "X/Y occupied" header that PR 2 placeholdered.
  static async getRoomWithOccupancy(
    id: string,
  ): Promise<(HostelRoomWithOccupancy & { hostel_beds: unknown[]; hostel_blocks: unknown }) | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('*, hostel_beds(*), hostel_blocks(name, code)')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch room (with occupancy)', error);
        throw error;
      }
      if (!data) return null;

      const room = data as HostelRoom & { hostel_beds: unknown[]; hostel_blocks: unknown };
      const occMap = await fetchOccupancyMap(supabase, [room.id]);
      return {
        ...room,
        ...(occMap.get(room.id) ?? EMPTY_OCCUPANCY),
      };
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getRoomWithOccupancy', error);
      throw error;
    }
  }

  // ── Create ────────────────────────────────────────────────────────
  static async createRoom(payload: CreateHostelRoomDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(payload as any)
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(payload as any)
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

  // ── Check room availability (via v_hostel_room_occupancy) ─────────
  // Previously read .status and .current_occupancy; both columns are gone.
  // The view returns live derivation from active hostel_allocations rows.
  static async checkAvailability(roomId: string) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('v_hostel_room_occupancy')
        .select('room_id, room_number, capacity, active_residents, beds_available, derived_status')
        .eq('room_id', roomId)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/rooms', 'Failed to check availability', error);
        throw error;
      }
      if (!data) {
        throw new Error(`Room ${roomId} not found.`);
      }

      return {
        id: data.room_id as string,
        room_number: data.room_number as string,
        capacity: data.capacity as number,
        current_occupancy: data.active_residents as number,
        available_beds: data.beds_available as number,
        derived_status: data.derived_status as string,
        is_available:
          data.derived_status === 'available' ||
          data.derived_status === 'partially_occupied',
      };
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in checkAvailability', error);
      throw error;
    }
  }

  // ── Available rooms in a block (via the view) ─────────────────────
  // Previously filtered hostel_rooms.status IN (available, partially_occupied).
  // Now we fetch via the view + join back to hostel_rooms to keep the shape.
  static async getAvailableRooms(blockId: string) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: availableIds, error: viewErr } = await (supabase as any)
        .from('v_hostel_room_occupancy')
        .select('room_id, derived_status')
        .eq('block_id', blockId)
        .in('derived_status', ['available', 'partially_occupied']);

      if (viewErr) {
        logger.error('campus-living/rooms', 'Failed to fetch available room ids', viewErr);
        throw viewErr;
      }

      const ids = ((availableIds ?? []) as { room_id: string }[]).map((r) => r.room_id);
      if (ids.length === 0) return [] as (HostelRoom & { hostel_beds: unknown[] })[];

      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('*, hostel_beds(*)')
        .in('id', ids)
        .order('floor')
        .order('room_number');

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch available rooms', error);
        throw error;
      }
      return (data ?? []) as (HostelRoom & { hostel_beds: unknown[] })[];
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in getAvailableRooms', error);
      throw error;
    }
  }

  // ── DEPRECATED methods removed in PR 2 ────────────────────────────
  // updateStatus() — was: UPDATE hostel_rooms SET status = ... — column gone.
  // No callers in the codebase (verified via grep). If something needs
  // "mark unavailable" semantics later, model as a beds-level operation or
  // a maintenance flag on the room.
}
