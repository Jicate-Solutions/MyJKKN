// hostel_floors CRUD. Floors are per-block records; rooms keep their integer
// `floor` and are held to real floors by the composite FK
// hostel_rooms_block_floor_fkey, so a floor cannot be deleted while a room (or a
// room eligibility rule) still sits on it. floor_number is immutable (a DB
// trigger refuses a change) — the update here only ever sends name / is_active.
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { HostelFloor } from '@/types/campus-living';

const FLOOR_COLUMNS = 'id, block_id, floor_number, name, is_active, created_at, updated_at';

type PgLikeError = { code?: string; message?: string } | null | undefined;

// Supabase errors are plain objects, not Error instances. Turn the codes this
// table can raise into a sentence the admin can act on.
function floorError(error: PgLikeError, fallback: string, floorNumber?: number): Error {
  switch (error?.code) {
    case '23505':
      return new Error(
        floorNumber !== undefined
          ? `Floor ${floorNumber} already exists in this block.`
          : 'That floor already exists in this block.',
      );
    case '23503':
      return new Error(
        'This floor still has rooms (or a room eligibility rule on it). Move or delete them first.',
      );
    case '42501':
      return new Error("You don't have permission to change floors for this block.");
    default:
      return new Error(error?.message?.trim() || fallback);
  }
}

// RLS does not error on an UPDATE/DELETE it filters out — it just touches 0 rows.
// Treat that as a permission failure instead of reporting a silent success.
const noRowsError = () =>
  new Error("That floor wasn't changed — it no longer exists or you don't have permission.");

export interface CreateFloorInput {
  block_id: string;
  floor_number: number;
  name?: string | null;
}

export interface UpdateFloorInput {
  name?: string | null;
  is_active?: boolean;
}

const cleanName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
};

export class HostelFloorService {
  static async listFloors(blockId: string): Promise<HostelFloor[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_floors')
      .select(FLOOR_COLUMNS)
      .eq('block_id', blockId)
      .order('floor_number', { ascending: true });
    if (error) {
      logger.error('campus-living/floors', 'Failed to list floors', error);
      throw floorError(error, 'Failed to load floors');
    }
    return (data ?? []) as HostelFloor[];
  }

  static async createFloor(input: CreateFloorInput): Promise<HostelFloor> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_floors')
      .insert({
        block_id: input.block_id,
        floor_number: input.floor_number,
        name: cleanName(input.name),
      })
      .select(FLOOR_COLUMNS)
      .single();
    if (error) {
      logger.error('campus-living/floors', 'Failed to create floor', error);
      throw floorError(error, 'Failed to add floor', input.floor_number);
    }
    return data as HostelFloor;
  }

  static async updateFloor(id: string, input: UpdateFloorInput): Promise<HostelFloor> {
    const patch: { name?: string | null; is_active?: boolean } = {};
    if (input.name !== undefined) patch.name = cleanName(input.name);
    if (input.is_active !== undefined) patch.is_active = input.is_active;

    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_floors')
      .update(patch)
      .eq('id', id)
      .select(FLOOR_COLUMNS);
    if (error) {
      logger.error('campus-living/floors', 'Failed to update floor', error);
      throw floorError(error, 'Failed to update floor');
    }
    if (!data || data.length === 0) throw noRowsError();
    return data[0] as HostelFloor;
  }

  static async deleteFloor(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_floors')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) {
      logger.error('campus-living/floors', 'Failed to delete floor', error);
      throw floorError(error, 'Failed to delete floor');
    }
    if (!data || data.length === 0) throw noRowsError();
  }
}
