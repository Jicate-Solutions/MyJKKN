export type MessCategoryType = 'boys' | 'girls' | 'mixed';

export interface MessCategory {
  id: string;
  name: string;
  /** Stable menu-linkage slug, frozen at creation (matches mess_menus.tier_key). */
  menu_tier_key?: string | null;
  description: string | null;
  type: MessCategoryType;
  is_active: boolean;
  sort_order: number;
  /** When true, residents in this mess category see/can use mess upgrades on My Hostel. Default false. */
  upgrades_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMessCategoryDto {
  name: string;
  description?: string | null;
  type: MessCategoryType;
  is_active?: boolean;
  sort_order?: number;
  upgrades_enabled?: boolean;
}

export interface UpdateMessCategoryDto {
  name?: string;
  description?: string | null;
  type?: MessCategoryType;
  is_active?: boolean;
  sort_order?: number;
  upgrades_enabled?: boolean;
}

export interface MessCategoryFilters {
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface MessCategoryListResponse {
  data: MessCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const MESS_CATEGORY_TYPE_LABELS: Record<MessCategoryType, string> = {
  boys: 'Boys',
  girls: 'Girls',
  mixed: 'Mixed',
};
