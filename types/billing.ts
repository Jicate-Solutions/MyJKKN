// types/billing.ts

export interface BillingParentCategory {
  id: string;
  institution_id: string;
  parent_category_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
}

export interface CreateBillingParentCategoryDto {
  institution_id: string;
  parent_category_name: string;
  is_active?: boolean;
}

export interface UpdateBillingParentCategoryDto
  extends Partial<CreateBillingParentCategoryDto> {}

export interface BillingParentCategoryFilters {
  search?: string;
  institution_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface BillingParentCategoryListResponse {
  data: BillingParentCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Billing Sub Category Types
export interface BillingSubCategory {
  id: string;
  institution_id: string;
  parent_category_id: string;
  sub_category_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  parent_category?: {
    id: string;
    parent_category_name: string;
  };
}

export interface CreateBillingSubCategoryDto {
  institution_id: string;
  parent_category_id: string;
  sub_category_name: string;
  is_active?: boolean;
}

export interface UpdateBillingSubCategoryDto
  extends Partial<CreateBillingSubCategoryDto> {}

export interface BillingSubCategoryFilters {
  search?: string;
  institution_id?: string;
  parent_category_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface BillingSubCategoryListResponse {
  data: BillingSubCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Billing Item Category Types
export interface BillingItemCategory {
  id: string;
  institution_id: string;
  parent_category_id: string;
  sub_category_id: string;
  item_category_name: string;
  amount?: number | null;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'one-time';
  effective_from?: string | null;
  effective_to?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  parent_category?: {
    id: string;
    parent_category_name: string;
  };
  sub_category?: {
    id: string;
    sub_category_name: string;
  };
}

export interface CreateBillingItemCategoryDto {
  institution_id: string;
  parent_category_id: string;
  sub_category_id: string;
  item_category_name: string;
  amount?: number | null;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'one-time';
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
}

export interface UpdateBillingItemCategoryDto
  extends Partial<CreateBillingItemCategoryDto> {}

export interface BillingItemCategoryFilters {
  search?: string;
  institution_id?: string;
  parent_category_id?: string;
  sub_category_id?: string;
  frequency?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface BillingItemCategoryListResponse {
  data: BillingItemCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
