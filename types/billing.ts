// types/billing.ts
// Updated: 2026-04-15 - Consolidated 3-tier (parent/sub/item) hierarchy into flat BillingCategory.

export type BillingFrequency = 'monthly' | 'quarterly' | 'yearly' | 'one-time';

export interface BillingCategory {
  id: string;
  institution_id: string;
  category_name: string;
  amount?: number | null;
  frequency: BillingFrequency;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
}

export interface CreateBillingCategoryDto {
  institution_id: string;
  category_name: string;
  amount?: number | null;
  frequency: BillingFrequency;
  description?: string | null;
  is_active?: boolean;
}

export interface UpdateBillingCategoryDto
  extends Partial<CreateBillingCategoryDto> {}

export interface BillingCategoryFilters {
  search?: string;
  institution_id?: string;
  frequency?: BillingFrequency;
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
