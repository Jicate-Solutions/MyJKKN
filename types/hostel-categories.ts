export type HostelCategoryType = 'boys' | 'girls' | 'mixed';

/**
 * How learners are placed into a category's rooms:
 *  - 'auto'   → batch auto-allocation (alphabetical fill, warden-approved). Classic.
 *  - 'manual' → learner self-selects the room in My Hostel (warden-approved).
 */
export type AllocationMode = 'auto' | 'manual';

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
