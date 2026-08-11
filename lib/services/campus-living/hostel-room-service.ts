// hostel-rooms-v2 PR 2 (2026-05-26): institution_id + status + current_occupancy
// dropped from hostel_rooms. Occupancy now derives from v_hostel_room_occupancy.
// College access flows through the block→institution junction
// (hostel_block_institutions); the per-room room_institution_access junction
// was retired 2026-06-03. RLS handles scope.
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
  hostel_categories: { name: string } | null;
};

// ─── Delete outcome (mirrors fn_delete_hostel_room's jsonb return) ─────────
// A blocked delete is a business outcome, not a Postgres error, so it arrives
// as data with a message the operator can act on.
export interface RoomDeleteResult {
  ok: boolean;
  reason?:
    | 'not_found'
    | 'active_residents'
    | 'has_deposits'
    | 'has_vacate_requests'
    | 'open_maintenance';
  count?: number;
  message?: string;
  room_number?: string;
  purged_allocations?: number;
  purged_maintenance?: number;
  purged_cleaning?: number;
}

const EMPTY_OCCUPANCY: RoomOccupancySnapshot = {
  active_residents: 0,
  beds_available: 0,
  derived_status: 'unknown',
};

// Guard against non-UUID ids reaching a uuid-typed .eq() filter (Postgres
// 22P02). Routing edge cases like /rooms/new used to pass "new" here.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string): boolean => UUID_RE.test(v);

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

// Flatten embedded hostel_room_amenity_tags (present=true) → catalog rows
// (selected as `room_amenity_links`) into a simple amenity_tags array and drop
// the raw embed key, so callers see room.amenity_tags = [{id,name,icon}].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRoomAmenityTags(row: any) {
  const { room_amenity_links, ...rest } = row ?? {};
  const amenity_tags = (room_amenity_links ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((l: any) => l.present !== false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((l: any) => l.amenity)
    .filter(Boolean);
  return { ...rest, amenity_tags };
}

const ROOM_AMENITY_EMBED =
  'room_amenity_links:hostel_room_amenity_tags(present, amenity:hostel_amenity_tags(id, name, icon))';

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
        // Narrow to rooms in blocks that serve this institution via the
        // block→institution junction (hostel_block_institutions). Single
        // institution gate since 2026-06-03; room_institution_access retired.
        const { data: blockRows, error: junctionErr } = await supabase
          .from('hostel_block_institutions')
          .select('block_id')
          .eq('institution_id', institutionId);

        if (junctionErr) {
          logger.error('campus-living/rooms', 'Failed to filter rooms by institution', junctionErr);
          throw junctionErr;
        }
        const blockIds = (blockRows ?? []).map((b) => b.block_id);
        if (blockIds.length === 0) {
          return { data: [] as (HostelRoom & { hostel_beds: unknown[] })[], count: 0 };
        }
        query = query.in('block_id', blockIds);
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
        .select('*, hostel_beds(*), hostel_categories(name)')
        .eq('block_id', blockId)
        .order('floor')
        .order('room_number');

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch rooms by block (with occupancy)', error);
        throw error;
      }
      const rooms = (data ?? []) as (HostelRoom & {
        hostel_beds: unknown[];
        hostel_categories: { name: string } | null;
      })[];
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
      // Non-UUID id (e.g. the "/rooms/new" routing edge case) → no row.
      if (!isUuid(id)) return null;
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_rooms')
        .select(`*, hostel_beds(*), hostel_blocks(name, code), ${ROOM_AMENITY_EMBED}`)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/rooms', 'Failed to fetch room (with occupancy)', error);
        throw error;
      }
      if (!data) return null;

      const room = mapRoomAmenityTags(data) as HostelRoom & { hostel_beds: unknown[]; hostel_blocks: unknown };
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

  // ── Room amenity tags (hostel_room_amenity_tags junction) ─────────
  static async getRoomAmenityTagIds(roomId: string): Promise<string[]> {
    if (!isUuid(roomId)) return [];
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_room_amenity_tags')
      .select('tag_id')
      .eq('room_id', roomId)
      .eq('present', true);
    if (error) {
      logger.error('campus-living/rooms', 'Failed to fetch room amenity tags', error);
      throw error;
    }
    return (data ?? []).map((r) => r.tag_id);
  }

  // Replace the room's amenity-tag set with present=true rows: clear existing
  // links then insert the selected ones. The present=false "suppress block
  // default" override is not exposed here — the catalog picker manages only
  // direct room amenities.
  static async syncRoomAmenityTags(roomId: string, tagIds: string[]): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error: delErr } = await supabase
      .from('hostel_room_amenity_tags')
      .delete()
      .eq('room_id', roomId);
    if (delErr) {
      logger.error('campus-living/rooms', 'Failed to clear room amenity tags', delErr);
      throw delErr;
    }
    if (tagIds.length === 0) return;
    const rows = tagIds.map((tag_id) => ({ room_id: roomId, tag_id, present: true }));
    const { error: insErr } = await supabase
      .from('hostel_room_amenity_tags')
      .insert(rows);
    if (insErr) {
      logger.error('campus-living/rooms', 'Failed to insert room amenity tags', insErr);
      throw insErr;
    }
  }

  // ── Create ────────────────────────────────────────────────────────
  static async createRoom(payload: CreateHostelRoomDTO, amenityTagIds?: string[]) {
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
      const room = data as HostelRoom;
      if (amenityTagIds && amenityTagIds.length > 0) {
        await this.syncRoomAmenityTags(room.id, amenityTagIds);
      }
      return room;
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in createRoom', error);
      throw error;
    }
  }

  // ── Update ────────────────────────────────────────────────────────
  static async updateRoom(id: string, payload: UpdateHostelRoomDTO, amenityTagIds?: string[]) {
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

      if (amenityTagIds !== undefined) {
        await this.syncRoomAmenityTags(id, amenityTagIds);
      }

      return data as HostelRoom;
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in updateRoom', error);
      throw error;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────
  // Goes through fn_delete_hostel_room, NOT a bare DELETE. hostel_allocations
  // .room_id is NO ACTION, so deleting the row directly raises 23503 whenever
  // the room has ANY allocation — including stays that ended months ago. The
  // RPC removes the room's own history with it and blocks only on records that
  // outlive a room (current residents, deposits, vacate requests, open
  // maintenance), returning that outcome as data so callers can state the real
  // reason instead of guessing one from a constraint name.
  static async deleteRoom(id: string) {
    let result: RoomDeleteResult | null = null;
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_delete_hostel_room', {
        p_room_id: id,
      });

      if (error) {
        logger.error('campus-living/rooms', 'Failed to delete room', error);
        throw error;
      }
      result = data as RoomDeleteResult | null;
    } catch (error) {
      logger.error('campus-living/rooms', 'Unexpected error in deleteRoom', error);
      throw error;
    }

    // A blocked delete is an expected answer, not a fault, so it sits outside
    // the catch above — routing it through there logged every refusal twice,
    // once as "Failed" and once as "Unexpected error".
    if (!result?.ok) {
      logger.warn('campus-living/rooms', 'Room delete blocked', result);
      throw new Error(result?.message ?? 'This room could not be deleted.');
    }

    return result;
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
