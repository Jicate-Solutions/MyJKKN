/**
 * Office-side room-category upgrade actions.
 *
 * Mirrors the three RPCs in migration 20260909210000_admin_upgrade_actions.sql:
 *   fn_cl_admin_upgrade_context        (read)
 *   fn_cl_admin_upgrade_category_only  (upgrade without moving a bed)
 *   fn_cl_admin_generate_upgrade_bill  (bill an already-upgraded learner)
 *
 * ID SPACE: every one of these takes a `learners_profiles.id`, NOT a
 * `profiles.id`. The two are disjoint in this database — an allocation row's
 * `learner_id` is a profiles.id and will silently match nothing here.
 */

/** Live upgrade-bill position, same vocabulary as the Allocation Audit. */
export type AdminUpgradeBillState =
  | 'paid'
  | 'partial'
  | 'unpaid'
  /** Bills exist but every one was cancelled. */
  | 'cancelled_only'
  | 'none';

/**
 * What the allocation page's upgrade card shows.
 *
 * Three different categories, deliberately kept apart:
 *  - `entitled_*` — what the learner's fee band allows
 *  - `assigned_*` — `learners_profiles.hostel_category_id`, what they are billed as
 *  - `occupied_*` — the category of the room they physically sleep in
 *
 * `assigned` above `occupied` is NORMAL, not drift: Deluxe Plus owns no rooms
 * and sells from Deluxe stock. Never render that as an error.
 */
export interface AdminUpgradeContext {
  ok: boolean;
  reason?: string;
  learner_profile_id?: string;
  entitled_category_id: string | null;
  entitled_category: string | null;
  assigned_category_id: string | null;
  assigned_category: string | null;
  occupied_category_id: string | null;
  occupied_category: string | null;
  above_band: boolean;
  /** What `fn_cl_admin_generate_upgrade_bill` would charge for entitled → assigned. */
  billable_amount: number;
  billable_gross: number;
  upgrade_bill_state: AdminUpgradeBillState;
  upgrade_bill_count: number;
  upgrade_bill_total: number;
  upgrade_bill_balance: number;
  cancelled_bill_count: number;
}

/** Why a bill was not raised. Each maps to a specific message from the RPC. */
export type AdminUpgradeBillReason =
  | 'preview'
  | 'billed'
  /** Assigned category equals the entitlement — nothing owed. */
  | 'in_band'
  /** Learner sits BELOW entitlement; they may be owed a room, not a charge. */
  | 'below_band'
  /** The pair prices at zero (e.g. a fully discounted upgrade). */
  | 'nothing_to_bill'
  /** A live upgrade bill already exists; billing again would ADD to it. */
  | 'already_billed'
  /** No fee band resolves, so the entitled category is unknown. */
  | 'no_band';

export interface AdminUpgradeBillResult {
  ok: boolean;
  dry_run?: boolean;
  reason: AdminUpgradeBillReason;
  message: string;
  from_category_id?: string | null;
  from_category?: string | null;
  current_category_id?: string | null;
  current_category?: string | null;
  net_amount?: number;
  gross_amount?: number;
  discount?: number;
  existing_bill_count?: number;
  existing_bill_total?: number;
  existing_bill_balance?: number;
  /** 'fee_band' | 'explicit', optionally suffixed '+fee_difference'. */
  from_source?: string;
  bill?: Record<string, unknown>;
}

/** Result of a category-only upgrade (no bed move). */
export interface AdminCategoryOnlyResult {
  success: boolean;
  /** 'upgraded' when the upgrade was free; 'pending_payment' when billed. */
  state?: string;
  old_category_id?: string | null;
  new_category_id?: string | null;
  upgrade_fee?: number;
  upgrade_fee_original?: number;
  upgrade_bill_id?: string | null;
  waitlist_id?: string | null;
}
