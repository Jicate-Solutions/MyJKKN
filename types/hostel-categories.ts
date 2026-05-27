export type HostelCategoryType = 'boys' | 'girls' | 'mixed';

export interface HostelCategory {
  id: string;
  name: string;
  description: string | null;
  type: HostelCategoryType;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateHostelCategoryDto {
  name: string;
  description?: string | null;
  type: HostelCategoryType;
  is_active?: boolean;
  sort_order?: number;
}

export interface UpdateHostelCategoryDto {
  name?: string;
  description?: string | null;
  type?: HostelCategoryType;
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
