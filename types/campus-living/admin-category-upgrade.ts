// Admin (office-side) category-upgrade option + result shapes.
// Backed by fn_cl_admin_bulk_target_catalog / fn_cl_admin_bulk_upgrade.
// Mirrors the self-service lifecycle: optimistic flip -> bill -> auto-confirm
// on payment / auto-revert on expiry.

/** One selectable bulk target (auto room category or mess category). */
export interface BulkUpgradeTarget {
  category_id: string;
  name: string;
  type: string; // 'boys' | 'girls'
  current_year_fee: number;
}

export interface BulkTargetCatalog {
  room: BulkUpgradeTarget[];
  mess: BulkUpgradeTarget[];
}

/** Per-learner, per-dimension (room/mess) outcome from the bulk RPC.
 *  - dry-run: status is 'eligible' (will apply) or 'skipped' (with reason)
 *  - commit:  status is 'upgraded' | 'pending_payment' | 'skipped' | 'error' */
export type UpgradeDimensionStatus =
  | 'eligible'
  | 'upgraded'
  | 'pending_payment'
  | 'skipped'
  | 'error';

export interface UpgradeDimensionResult {
  status: UpgradeDimensionStatus;
  eligible?: boolean;
  reason?: string | null;
  current_category_id?: string | null;
  current_category_name?: string | null;
  target_category_id?: string | null;
  target_category_name?: string | null;
  current_fee?: number | null;
  target_fee?: number | null;
  /** PAYABLE after any configured upgrade discount. */
  upgrade_fee?: number | null;
  upgrade_fee_original?: number | null;
  upgrade_discount?: number | null;
  threshold_pct?: number | null;
  paid_pct?: number | null;
  meets_threshold?: boolean | null;
  upgrade_bill_id?: string | null;
  waitlist_id?: string | null;
}

export interface BulkUpgradeResultRow {
  learner_id: string;
  name: string | null;
  roll_number: string | null;
  room: UpgradeDimensionResult | null;
  mess: UpgradeDimensionResult | null;
}

export interface BulkUpgradeInput {
  learnerIds: string[];
  roomCategoryId?: string | null;
  messCategoryId?: string | null;
}
