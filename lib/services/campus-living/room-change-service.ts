import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { UpgradeRoomOption } from '@/types/campus-living/category-upgrade';
import type { RoomChangeStatus, RoomChangeResult } from '@/types/campus-living/room-change';

// One-time same-category room change. Mirrors CategoryUpgradeService's loose-RPC
// pattern (these RPCs aren't in the generated Database type). The room rows share
// UpgradeRoomOption's shape because fn_my_room_change_options delegates to
// fn_my_upgrade_room_options.
export class RoomChangeService {
  private static get supabase() {
    return createClientSupabaseClient();
  }
  private static rpc(fn: string, args: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.supabase as any).rpc(fn, args) as Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  }

  static async getStatus(): Promise<RoomChangeStatus> {
    const { data, error } = await this.rpc('fn_my_room_change_status', {});
    if (error) throw new Error(error.message || 'Failed to load room change status');
    return data as RoomChangeStatus;
  }

  /** Available rooms in the resident's OWN category, current room excluded. */
  static async getOptions(): Promise<UpgradeRoomOption[]> {
    const { data, error } = await this.rpc('fn_my_room_change_options', {});
    if (error) throw new Error(error.message || 'Failed to load available rooms');
    return (data as UpgradeRoomOption[]) ?? [];
  }

  /** Spends the allowance. The RPC picks the lowest free bed when bedId is omitted. */
  static async changeRoom(roomId: string, bedId?: string | null): Promise<RoomChangeResult> {
    const { data, error } = await this.rpc('fn_self_change_room', {
      p_room_id: roomId,
      p_bed_id: bedId ?? null,
    });
    if (error) throw new Error(error.message || 'Room change failed');
    return data as RoomChangeResult;
  }
}
