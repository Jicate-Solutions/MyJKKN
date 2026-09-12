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
import type {
  AdminUpgradeContext,
  AdminUpgradeBillResult,
  AdminCategoryOnlyResult,
} from '@/types/campus-living/upgrade-admin';

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

  // ── Office-side actions added 2026-09-09 (migration 20260909210000) ──────
  // All three take a learners_profiles.id / allocation id — never a profiles.id.

  /**
   * Entitled / assigned / occupied category + upgrade-bill position for one
   * allocation. Gated on campus_living.upgrades.manage rather than the audit
   * RPC, which needs campus_living.allocations.audit — a key no role holds.
   */
  static async getUpgradeContext(allocationId: string): Promise<AdminUpgradeContext> {
    const { data, error } = await this.rpc('fn_cl_admin_upgrade_context', {
      p_allocation_id: allocationId,
    });
    if (error) throw new Error(error.message || 'Failed to load upgrade context');
    return data as AdminUpgradeContext;
  }

  /**
   * Upgrade the category and bill for it WITHOUT moving the learner to another
   * bed — for a resident already living in the room when the target category
   * has no free bed. `fn_cl_admin_upgrade_room` cannot do this: it validates
   * the bed against _cl_room_options and refuses.
   */
  static async upgradeCategoryOnly(
    learnerId: string,
    categoryId: string,
  ): Promise<AdminCategoryOnlyResult> {
    const { data, error } = await this.rpc('fn_cl_admin_upgrade_category_only', {
      p_learner_id: learnerId,
      p_category_id: categoryId,
    });
    if (error) throw new Error(error.message || 'Category upgrade failed');
    return data as AdminCategoryOnlyResult;
  }

  /**
   * Raise the upgrade bill for a learner who ALREADY holds a category above
   * their fee band.
   *
   * `dryRun` defaults to TRUE and callers must opt out deliberately: the
   * underlying _cl_apply_upgrade_fee_bill ACCUMULATES onto an existing live
   * bill instead of refusing, so a stray second call doubles the charge rather
   * than erroring. The RPC also refuses outright when a live bill exists unless
   * `allowAdditional` is set.
   */
  static async generateUpgradeBill(
    learnerId: string,
    opts?: {
      fromCategoryId?: string | null;
      dryRun?: boolean;
      allowAdditional?: boolean;
    },
  ): Promise<AdminUpgradeBillResult> {
    const { data, error } = await this.rpc('fn_cl_admin_generate_upgrade_bill', {
      p_learner_id: learnerId,
      p_from_category_id: opts?.fromCategoryId ?? null,
      p_dry_run: opts?.dryRun ?? true,
      p_allow_additional: opts?.allowAdditional ?? false,
    });
    if (error) throw new Error(error.message || 'Could not generate the upgrade bill');
    return data as AdminUpgradeBillResult;
  }
}
