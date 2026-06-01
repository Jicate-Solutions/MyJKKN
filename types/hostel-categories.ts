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
}

export interface UpdateHostelCategoryDto {
  name?: string;
  description?: string | null;
  type?: HostelCategoryType;
  allocation_mode?: AllocationMode;
  is_active?: boolean;
  sort_order?: number;
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
