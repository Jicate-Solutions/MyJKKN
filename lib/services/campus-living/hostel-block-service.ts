// hostel-rooms-v2 PR 2 (2026-05-26): institution_id dropped from hostel_blocks.
// College access flows through hostel_block_institutions junction.
// `current_occupancy` / `total_capacity` / `total_rooms` remain on the row
// as legacy aggregate counters — Director's lock 2026-05-26 keeps them for
// block-level summary screens that don't need per-room precision; PR 3+
// can swap in live derivation if needed.
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelBlock,
  CreateHostelBlockDTO,
  UpdateHostelBlockDTO,
  BlockFilters,
} from '@/types/campus-living';

// Flatten the embedded hostel_block_amenity_tags → hostel_amenity_tags rows
// (selected as `block_amenity_links`) into a simple `amenity_tags` array and
// drop the raw embed key, so callers see block.amenity_tags = [{id,name,icon}].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBlockAmenityTags(row: any) {
  const { block_amenity_links, ...rest } = row ?? {};
  const amenity_tags = (block_amenity_links ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((l: any) => l.amenity)
    .filter(Boolean);
  return { ...rest, amenity_tags };
}

const BLOCK_AMENITY_EMBED =
  'block_amenity_links:hostel_block_amenity_tags(amenity:hostel_amenity_tags(id, name, icon))';

export class HostelBlockService {
  // ── List blocks with filters ──────────────────────────────────────
  // institutionId narrows via hostel_block_institutions junction.
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
        .select(`*, ${BLOCK_AMENITY_EMBED}`, { count: 'exact' });

      if (institutionId) {
        const { data: blockIds, error: junctionErr } = await supabase
          .from('hostel_block_institutions')
          .select('block_id')
          .eq('institution_id', institutionId);
        if (junctionErr) {
          logger.error('campus-living/blocks', 'Failed to filter blocks by institution', junctionErr);
          throw junctionErr;
        }
        // Wardens manage blocks regardless of which college "owns" them, so the
        // visible set is the UNION of (a) blocks in the user's institution and
        // (b) blocks directly granted to the user via user_block_access. This
        // mirrors role_has_hostel_block_scope() branch (a) — without it, a
        // warden whose home institution differs from the block's institution
        // sees nothing here even though RLS would allow the rows.
        const { data: { user } } = await supabase.auth.getUser();
        let grantedIds: string[] = [];
        if (user) {
          const { data: grantedBlocks } = await supabase
            .from('user_block_access')
            .select('block_id')
            .eq('user_id', user.id)
            .is('revoked_at', null);
          grantedIds = (grantedBlocks ?? []).map((r) => r.block_id);
        }
        const ids = Array.from(
          new Set([...(blockIds ?? []).map((r) => r.block_id), ...grantedIds])
        ).filter(Boolean);
        if (ids.length === 0) return { data: [] as HostelBlock[], count: 0 };
        query = query.in('id', ids);
      }
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
      const blocks = (data ?? []).map((b) => mapBlockAmenityTags(b)) as HostelBlock[];
      return { data: blocks, count: count ?? 0 };
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
        .select(`*, hostel_rooms(*), hostel_wardens(*), ${BLOCK_AMENITY_EMBED}`)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/blocks', 'Failed to fetch block', error);
        throw error;
      }
      if (!data) return null;

      // Derive the Room Status Summary for the detail-page Overview tab.
      // hostel_rooms has no status column, so occupancy comes from the
      // v_hostel_room_occupancy view (available / partially_occupied / full /
      // unknown→available). Non-student rooms (warden/office/sick_room/…) are
      // counted as "reserved". Maintenance has no source today → stays 0.
      const { data: occ, error: occErr } = await supabase
        .from('v_hostel_room_occupancy')
        .select('room_id, derived_status, active_residents')
        .eq('block_id', id);
      if (occErr) {
        logger.error('campus-living/blocks', 'Failed to fetch room occupancy for summary', occErr);
      }
      const statusByRoom = new Map<string, string>();
      const occupiedByRoom = new Map<string, number>();
      for (const row of occ ?? []) {
        if (!row.room_id) continue;
        statusByRoom.set(row.room_id, row.derived_status ?? 'available');
        occupiedByRoom.set(row.room_id, row.active_residents ?? 0);
      }

      const rooms = (data.hostel_rooms ?? []) as Array<{
        id: string;
        floor?: number | null;
        capacity?: number | null;
        room_purpose?: string | null;
      }>;
      const rooms_summary = { available: 0, partially_occupied: 0, full: 0, maintenance: 0, reserved: 0 };
      for (const room of rooms) {
        if (room.room_purpose && room.room_purpose !== 'student') {
          rooms_summary.reserved += 1;
          continue;
        }
        const st = statusByRoom.get(room.id);
        if (st === 'full') rooms_summary.full += 1;
        else if (st === 'partially_occupied') rooms_summary.partially_occupied += 1;
        else rooms_summary.available += 1;
      }

      // Derive the per-floor breakdown for the detail-page Floors & Rooms tab.
      // The page reads `block.floor_summary` (FloorSummaryRow[]); without this
      // it always fell back to [] and showed "No floor data available yet."
      // even though hostel_rooms holds the floors. Totals reconcile to the
      // header counters: every room contributes its capacity, occupancy comes
      // from v_hostel_room_occupancy.active_residents.
      const floorMap = new Map<number, { floor: number; rooms: number; capacity: number; occupied: number }>();
      for (const room of rooms) {
        const floor = Number(room.floor ?? 0);
        const group = floorMap.get(floor) ?? { floor, rooms: 0, capacity: 0, occupied: 0 };
        group.rooms += 1;
        group.capacity += Number(room.capacity ?? 0);
        group.occupied += occupiedByRoom.get(room.id) ?? 0;
        floorMap.set(floor, group);
      }
      const floorLabel = (floor: number) => {
        if (floor === 0) return 'Ground Floor';
        const suffix = floor % 10 === 1 && floor % 100 !== 11 ? 'st'
          : floor % 10 === 2 && floor % 100 !== 12 ? 'nd'
          : floor % 10 === 3 && floor % 100 !== 13 ? 'rd'
          : 'th';
        return `${floor}${suffix} Floor`;
      };
      const floor_summary = Array.from(floorMap.values())
        .sort((a, b) => a.floor - b.floor)
        .map((g) => ({ ...g, label: floorLabel(g.floor) }));

      return { ...mapBlockAmenityTags(data), rooms_summary, floor_summary } as HostelBlock & {
        hostel_rooms: unknown[];
        hostel_wardens: unknown[];
        rooms_summary: typeof rooms_summary;
        floor_summary: typeof floor_summary;
      };
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in getBlock', error);
      throw error;
    }
  }

  // ── Create ────────────────────────────────────────────────────────
  // hostel-rooms-v2 PR 2 (2026-05-26): the block insert no longer carries
  // institution_id (column dropped). College access is conferred AFTER the
  // block exists via hostel_block_institutions. Callers that want "create
  // block + grant my institution" should chain two calls (or use the new
  // /admin/hostel/rooms UI which composes them).
  //
  // Optional `primaryInstitutionId` arg — if provided, the M2M junction row
  // is auto-written with is_primary=true. Without it, the new block is
  // RLS-invisible until something grants access — which is fine for the
  // super-admin "create-then-grant" flow.
  static async createBlock(
    payload: CreateHostelBlockDTO,
    primaryInstitutionId?: string,
    amenityTagIds?: string[],
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_blocks')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(payload as any)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/blocks', 'Failed to create block', error);
        throw error;
      }

      const block = data as HostelBlock;

      if (primaryInstitutionId) {
        const { error: m2mError } = await supabase
          .from('hostel_block_institutions')
          .insert({
            block_id: block.id,
            institution_id: primaryInstitutionId,
            is_primary: true,
          });
        if (m2mError) {
          logger.error(
            'campus-living/blocks',
            'Block created but M2M junction insert failed — block will be RLS-invisible to non-super-admins until granted',
            { blockId: block.id, error: m2mError },
          );
          throw m2mError;
        }
      }

      if (amenityTagIds && amenityTagIds.length > 0) {
        await this.syncBlockAmenityTags(block.id, amenityTagIds);
      }

      return block;
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in createBlock', error);
      throw error;
    }
  }

  // ── Update ────────────────────────────────────────────────────────
  static async updateBlock(
    id: string,
    payload: UpdateHostelBlockDTO,
    amenityTagIds?: string[],
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_blocks')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/blocks', 'Failed to update block', error);
        throw error;
      }

      if (amenityTagIds !== undefined) {
        await this.syncBlockAmenityTags(id, amenityTagIds);
      }

      return data as HostelBlock;
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in updateBlock', error);
      throw error;
    }
  }

  // ── Block amenity tags (hostel_block_amenity_tags junction) ───────
  static async getBlockAmenityTagIds(blockId: string): Promise<string[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_block_amenity_tags')
      .select('tag_id')
      .eq('block_id', blockId);
    if (error) {
      logger.error('campus-living/blocks', 'Failed to fetch block amenity tags', error);
      throw error;
    }
    return (data ?? []).map((r) => r.tag_id);
  }

  // Replace the block's amenity-tag set: clear existing links then insert the
  // selected ones. Idempotent — the junction has no payload columns.
  static async syncBlockAmenityTags(blockId: string, tagIds: string[]): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error: delErr } = await supabase
      .from('hostel_block_amenity_tags')
      .delete()
      .eq('block_id', blockId);
    if (delErr) {
      logger.error('campus-living/blocks', 'Failed to clear block amenity tags', delErr);
      throw delErr;
    }
    if (tagIds.length === 0) return;
    const rows = tagIds.map((tag_id) => ({ block_id: blockId, tag_id }));
    const { error: insErr } = await supabase
      .from('hostel_block_amenity_tags')
      .insert(rows);
    if (insErr) {
      logger.error('campus-living/blocks', 'Failed to insert block amenity tags', insErr);
      throw insErr;
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
  // Still reads the legacy hostel_blocks.current_occupancy counter — those
  // columns remain on hostel_blocks (only hostel_rooms equivalents were
  // dropped). PR 3+ can swap to a sum over v_hostel_room_occupancy if the
  // counters drift.
  static async getOccupancySummary(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      let q = supabase
        .from('hostel_blocks')
        .select('id, name, code, hostel_type, total_rooms, total_capacity, current_occupancy, status')
        .eq('status', 'active')
        .order('name');

      if (institutionId) {
        const { data: blockIds } = await supabase
          .from('hostel_block_institutions')
          .select('block_id')
          .eq('institution_id', institutionId);
        const ids = (blockIds ?? []).map((r) => r.block_id);
        if (ids.length === 0) return [] as Array<HostelBlock & { available_capacity: number; occupancy_percentage: number }>;
        q = q.in('id', ids);
      }
      const { data, error } = await q;

      if (error) {
        logger.error('campus-living/blocks', 'Failed to fetch occupancy summary', error);
        throw error;
      }

      const summary = (data ?? []).map((block) => {
        const cap = block.total_capacity ?? 0;
        const occ = block.current_occupancy ?? 0;
        return {
          ...block,
          available_capacity: cap - occ,
          occupancy_percentage: cap > 0 ? Math.round((occ / cap) * 100) : 0,
        };
      });

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq('hostel_type', hostelType as any)
        .eq('status', 'active')
        .order('name');

      if (institutionId) {
        const { data: blockIds } = await supabase
          .from('hostel_block_institutions')
          .select('block_id')
          .eq('institution_id', institutionId);
        const ids = (blockIds ?? []).map((r) => r.block_id);
        if (ids.length === 0) return [] as HostelBlock[];
        q = q.in('id', ids);
      }
      const { data, error } = await q;

      if (error) {
        logger.error('campus-living/blocks', 'Failed to fetch blocks by type', error);
        throw error;
      }
      return (data ?? []) as HostelBlock[];
    } catch (error) {
      logger.error('campus-living/blocks', 'Unexpected error in getBlocksByType', error);
      throw error;
    }
  }

  // ── Block ↔ institution junction (which colleges share this block) ──
  // Single institution-access surface since 2026-06-03: a learner can be
  // allocated to any room in a block linked to their college here. Replaces
  // the retired per-room room_institution_access "Manage Access" dialog.
  static async getBlockInstitutions(blockId: string): Promise<
    { institution_id: string; is_primary: boolean; institution_name: string | null }[]
  > {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_block_institutions')
      .select('institution_id, is_primary, institution:institutions(name)')
      .eq('block_id', blockId)
      .order('is_primary', { ascending: false });
    if (error) {
      logger.error('campus-living/blocks', 'Failed to fetch block institutions', error);
      throw error;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => ({
      institution_id: r.institution_id as string,
      is_primary: Boolean(r.is_primary),
      institution_name: (r.institution?.name as string) ?? null,
    }));
  }

  // Add a college to a block. The block's FIRST college is made primary so a
  // freshly-linked block always has exactly one primary (the bed-attribution
  // and legacy "owning college" semantics rely on a primary existing).
  static async addBlockInstitution(
    blockId: string,
    institutionId: string,
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { count, error: countErr } = await supabase
      .from('hostel_block_institutions')
      .select('block_id', { count: 'exact', head: true })
      .eq('block_id', blockId);
    if (countErr) {
      logger.error('campus-living/blocks', 'Failed to count block institutions', countErr);
      throw countErr;
    }
    const isPrimary = (count ?? 0) === 0;
    const { error } = await supabase
      .from('hostel_block_institutions')
      .upsert(
        { block_id: blockId, institution_id: institutionId, is_primary: isPrimary },
        { onConflict: 'block_id,institution_id' },
      );
    if (error) {
      logger.error('campus-living/blocks', 'Failed to add block institution', error);
      throw error;
    }
  }

  static async removeBlockInstitution(
    blockId: string,
    institutionId: string,
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('hostel_block_institutions')
      .delete()
      .eq('block_id', blockId)
      .eq('institution_id', institutionId);
    if (error) {
      logger.error('campus-living/blocks', 'Failed to remove block institution', error);
      throw error;
    }
  }

  // Promote one college to primary. Two writes because the partial unique index
  // (at most one is_primary=true per block) rejects a single bulk flip.
  static async setPrimaryBlockInstitution(
    blockId: string,
    institutionId: string,
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error: clearErr } = await supabase
      .from('hostel_block_institutions')
      .update({ is_primary: false })
      .eq('block_id', blockId)
      .eq('is_primary', true);
    if (clearErr) {
      logger.error('campus-living/blocks', 'Failed to clear primary block institution', clearErr);
      throw clearErr;
    }
    const { error: setErr } = await supabase
      .from('hostel_block_institutions')
      .update({ is_primary: true })
      .eq('block_id', blockId)
      .eq('institution_id', institutionId);
    if (setErr) {
      logger.error('campus-living/blocks', 'Failed to set primary block institution', setErr);
      throw setErr;
    }
  }
}
