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

// DB enum `billing_category_kind`. Drives category grouping and lets specific
// pickers exclude kinds they don't manage (e.g. the admission fee-structure
// editor excludes 'transport' + 'hostel' — those are owned by the transport
// and campus-living modules respectively).
export type BillingCategoryKind =
  | 'application_fee'
  | 'tuition'
  | 'hostel'
  | 'transport'
  | 'exam'
  | 'library'
  | 'other'
  | 'university_fee'
  | 'establishment';

export interface BillingCategory {
  id: string;
  category_name: string;
  amount: number | null;
  frequency: BillingCategoryFrequency;
  kind: BillingCategoryKind;
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
  // Fee head — drives Razorpay account routing (payment-gateway-service matches
  // billing_categories.kind against razorpay_accounts.fee_head). Required so a new
  // category never silently defaults to 'other' and misroutes its payments.
  kind: BillingCategoryKind;
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
