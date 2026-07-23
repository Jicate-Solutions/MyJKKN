import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BulkTargetCatalog,
  BulkUpgradeInput,
  BulkUpgradeResultRow,
} from '@/types/campus-living/admin-category-upgrade';
import type {
  UpgradeRoomCategoryOption,
  UpgradeRoomOption,
  RoomUpgradeResult,
} from '@/types/campus-living/category-upgrade';

// Office-side category upgrades. RPCs aren't in the generated Database type, so
// we use the same loose-rpc cast as CategoryUpgradeService. Permission +
// institution-access checks live inside the SECURITY DEFINER RPCs.
export class AdminCategoryUpgradeService {
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

  /** Selectable bulk targets (auto room categories + mess categories). */
  static async getTargetCatalog(): Promise<BulkTargetCatalog> {
    const { data, error } = await this.rpc('fn_cl_admin_bulk_target_catalog', {});
    if (error) throw new Error(error.message || 'Failed to load upgrade targets');
    const obj = (data as BulkTargetCatalog) ?? { room: [], mess: [] };
    return { room: obj.room ?? [], mess: obj.mess ?? [] };
  }

  /** Preview (dry-run) — per-learner eligibility, no writes. */
  static async preview(input: BulkUpgradeInput): Promise<BulkUpgradeResultRow[]> {
    return this.run(input, true);
  }

  /** Commit — eligible learners are upgraded; partial success is normal. */
  static async commit(input: BulkUpgradeInput): Promise<BulkUpgradeResultRow[]> {
    return this.run(input, false);
  }

  private static async run(
    input: BulkUpgradeInput,
    dryRun: boolean,
  ): Promise<BulkUpgradeResultRow[]> {
    const { data, error } = await this.rpc('fn_cl_admin_bulk_upgrade', {
      p_learner_ids: input.learnerIds,
      p_room_category_id: input.roomCategoryId ?? null,
      p_mess_category_id: input.messCategoryId ?? null,
      p_dry_run: dryRun,
    });
    if (error) throw new Error(error.message || 'Upgrade failed');
    return (data as BulkUpgradeResultRow[]) ?? [];
  }

  // ── Single-learner ROOM upgrade (manual categories — room picking) ──────
  // Phase 2: covers Premium-type targets the bulk path can't (per-learner bed).

  /** Eligible MANUAL room categories for one learner (dialog's category list). */
  static async getRoomUpgradeOptions(learnerId: string): Promise<UpgradeRoomCategoryOption[]> {
    const { data, error } = await this.rpc('fn_cl_admin_room_upgrade_options', {
      p_learner_id: learnerId,
    });
    if (error) throw new Error(error.message || 'Failed to load room upgrade options');
    return (data as UpgradeRoomCategoryOption[]) ?? [];
  }

  /** Available rooms (with capacity) of a target category for one learner. */
  static async getRoomOptions(learnerId: string, categoryId: string): Promise<UpgradeRoomOption[]> {
    const { data, error } = await this.rpc('fn_cl_admin_room_options', {
      p_learner_id: learnerId,
      p_category_id: categoryId,
    });
    if (error) throw new Error(error.message || 'Failed to load available rooms');
    return (data as UpgradeRoomOption[]) ?? [];
  }

  /** Execute the room-level upgrade for one learner (auto-picks lowest bed if null). */
  static async upgradeRoom(
    learnerId: string,
    categoryId: string,
    roomId: string,
    bedId?: string | null,
  ): Promise<RoomUpgradeResult> {
    const { data, error } = await this.rpc('fn_cl_admin_upgrade_room', {
      p_learner_id: learnerId,
      p_category_id: categoryId,
      p_room_id: roomId,
      p_bed_id: bedId ?? null,
    });
    if (error) throw new Error(error.message || 'Upgrade failed');
    return data as RoomUpgradeResult;
  }
}
