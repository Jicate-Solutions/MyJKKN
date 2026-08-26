export type HostelCategoryType = 'boys' | 'girls' | 'mixed';

/**
 * How learners are placed into a category's rooms:
 *  - 'auto'   → batch auto-allocation (alphabetical fill, warden-approved). Classic.
 *  - 'manual' → learner self-selects the room in My Hostel (warden-approved).
 */
export type AllocationMode = 'auto' | 'manual';

/**
 * Entitlement band a room category grants, matching hostel_tier_policy.tier_key.
 * Premium-only features read this, NOT the category name — renaming
 * "Premium Room" must never silently change who is entitled.
 */
export type HostelCategoryTierKey = 'standard' | 'premium' | 'premium_plus';

export const HOSTEL_CATEGORY_TIER_LABELS: Record<HostelCategoryTierKey, string> = {
  standard: 'Standard — no premium features',
  premium: 'Premium',
  premium_plus: 'Premium Plus',
};

export interface HostelCategory {
  id: string;
  name: string;
  description: string | null;
  type: HostelCategoryType;
  allocation_mode: AllocationMode;
  is_active: boolean;
  sort_order: number;
  /** Min % of current-academic-year academic bills paid for an instant upgrade
   *  into this category. null = no gate; below it the booking is waitlisted. */
  upgrade_threshold_pct: number | null;
  /** Days a below-threshold upgrade reservation is held before auto-expiry. */
  upgrade_hold_days: number;
  /** Add-on category (e.g. "Premium Room + AC"): reachable ONLY when an explicit
   *  upgrade-fee pair is configured from the resident's current category — never via
   *  the fee-difference fallback. Keeps it scoped to one source category. */
  requires_explicit_upgrade: boolean;
  /** When true, residents in this category see/can use self-service upgrades on My Hostel. Default false. */
  upgrades_enabled: boolean;
  /**
   * Opt this category into empty-bed settlement: rooms in it open a settle
   * window on arrival and can be billed for the beds nobody is sleeping in.
   * Default false — a category is never in scope by accident. Independent of
   * the `hostel.settle_bill.enabled` master switch, which gates the mechanism
   * as a whole. Edited on fee-config's Room Sharing tab.
   */
  settle_billing_enabled: boolean;
  /**
   * Entitlement band this category grants (default 'standard'). Housekeeping
   * slot booking is the current reader: tier_key → hostel_tier_policy.tier_features
   * + the housekeeping.weekly_quota_by_tier policy row decide who may book.
   * Set on the category — NOT on hostel_allocations.tier_id, which production
   * never populated.
   */
  tier_key: HostelCategoryTierKey;
  created_at: string;
  updated_at: string;
}

export interface CreateHostelCategoryDto {
  name: string;
  description?: string | null;
  type: HostelCategoryType;
  allocation_mode?: AllocationMode;
  is_active?: boolean;
  sort_order?: number;
  upgrade_threshold_pct?: number | null;
  upgrade_hold_days?: number;
  upgrades_enabled?: boolean;
  tier_key?: HostelCategoryTierKey;
}

export interface UpdateHostelCategoryDto {
  name?: string;
  description?: string | null;
  type?: HostelCategoryType;
  allocation_mode?: AllocationMode;
  is_active?: boolean;
  sort_order?: number;
  upgrade_threshold_pct?: number | null;
  upgrade_hold_days?: number;
  upgrades_enabled?: boolean;
  settle_billing_enabled?: boolean;
  tier_key?: HostelCategoryTierKey;
}

export interface HostelCategoryFilters {
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface HostelCategoryListResponse {
  data: HostelCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const HOSTEL_CATEGORY_TYPE_LABELS: Record<HostelCategoryType, string> = {
  boys: 'Boys',
  girls: 'Girls',
  mixed: 'Mixed',
};

export const ALLOCATION_MODE_LABELS: Record<AllocationMode, string> = {
  auto: 'Auto-allocate',
  manual: 'Manual / self-select',
};
