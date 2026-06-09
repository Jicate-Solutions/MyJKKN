import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  UpgradeRoomCategoryOption,
  UpgradeMessCategoryOption,
  RoomUpgradeResult,
  MessUpgradeResult,
} from '@/types/campus-living/category-upgrade';

// Mirrors SelfAllocationService's loose-RPC pattern (RPCs aren't in the generated
// Database type). Reuse SelfAllocationService.getMyRoomOptions for bed listing.
export class CategoryUpgradeService {
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

  static async getRoomCategories(): Promise<UpgradeRoomCategoryOption[]> {
    const { data, error } = await this.rpc('fn_my_upgrade_room_categories', {});
    if (error) throw new Error(error.message || 'Failed to load room upgrade options');
    return (data as UpgradeRoomCategoryOption[]) ?? [];
  }

  static async getMessCategories(): Promise<UpgradeMessCategoryOption[]> {
    const { data, error } = await this.rpc('fn_my_upgrade_mess_categories', {});
    if (error) throw new Error(error.message || 'Failed to load mess upgrade options');
    return (data as UpgradeMessCategoryOption[]) ?? [];
  }

  static async upgradeRoom(categoryId: string, roomId: string, bedId: string): Promise<RoomUpgradeResult> {
    const { data, error } = await this.rpc('fn_self_upgrade_room_category', {
      p_new_category_id: categoryId, p_room_id: roomId, p_bed_id: bedId,
    });
    if (error) throw new Error(error.message || 'Upgrade failed');
    return data as RoomUpgradeResult;
  }

  static async upgradeMess(messCategoryId: string): Promise<MessUpgradeResult> {
    const { data, error } = await this.rpc('fn_self_upgrade_mess_category', {
      p_new_mess_category_id: messCategoryId,
    });
    if (error) throw new Error(error.message || 'Upgrade failed');
    return data as MessUpgradeResult;
  }

  static async joinWaitlist(categoryId: string): Promise<string> {
    const { data, error } = await this.rpc('fn_self_join_upgrade_waitlist', {
      p_target_category_id: categoryId,
    });
    if (error) throw new Error(error.message || 'Failed to join waitlist');
    return data as string;
  }
}
