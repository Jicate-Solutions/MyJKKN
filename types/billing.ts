// types/billing.ts
//
// 2026-04-28: Collapsed 3-tier (parent/sub/item) institution-scoped billing categories
// into a single global flat BillingCategory. Categories are now common across all
// institutions and no longer carry institution_id.

export type BillingCategoryFrequency =
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'one-time';

export interface BillingCategory {
  id: string;
  category_name: string;
  amount: number | null;
  frequency: BillingCategoryFrequency;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateBillingCategoryDto {
  category_name: string;
  amount?: number | null;
  frequency: BillingCategoryFrequency;
  description?: string | null;
  is_active?: boolean;
}

export interface UpdateBillingCategoryDto
  extends Partial<CreateBillingCategoryDto> {}

export interface BillingCategoryFilters {
  search?: string;
  frequency?: BillingCategoryFrequency;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface BillingCategoryListResponse {
  data: BillingCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
