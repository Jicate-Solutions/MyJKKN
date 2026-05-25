/**
 * HR Benefits Management — C4 types.
 *
 * Benefits catalog and enrollment tracking.
 * Tables: hr_benefits_catalog, hr_benefits_enrollments (new, created by migration).
 */

// =====================================================================================
// Benefit categories
// =====================================================================================

export type BenefitCategory =
  | 'health'
  | 'insurance'
  | 'retirement'
  | 'education'
  | 'transport'
  | 'meal'
  | 'other';

export const BENEFIT_CATEGORIES: { value: BenefitCategory; label: string }[] = [
  { value: 'health', label: 'Health' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'education', label: 'Education' },
  { value: 'transport', label: 'Transport' },
  { value: 'meal', label: 'Meal' },
  { value: 'other', label: 'Other' },
];

// =====================================================================================
// Enrollment status
// =====================================================================================

export type EnrollmentStatus = 'active' | 'cancelled' | 'expired';

// =====================================================================================
// Benefit (catalog row)
// =====================================================================================

export interface HRBenefit {
  id: string;
  institution_id: string;
  name: string;
  category: BenefitCategory;
  description: string | null;
  cost_to_company: number;
  is_active: boolean;
  eligible_roles: string[];
  created_at: string;
  updated_at: string;
}

export interface HRBenefitWithCount extends HRBenefit {
  enrolled_count: number;
}

export interface CreateBenefitRequest {
  institution_id: string;
  name: string;
  category: BenefitCategory;
  description?: string;
  cost_to_company?: number;
  eligible_roles?: string[];
}

export interface UpdateBenefitRequest {
  name?: string;
  category?: BenefitCategory;
  description?: string;
  cost_to_company?: number;
  is_active?: boolean;
  eligible_roles?: string[];
}

// =====================================================================================
// Enrollment
// =====================================================================================

export interface HRBenefitEnrollment {
  id: string;
  benefit_id: string;
  staff_id: string;
  enrolled_at: string;
  status: EnrollmentStatus;
  cancelled_at: string | null;
  // Joined fields
  staff_name?: string;
  staff_email?: string;
}

export interface EnrollStaffRequest {
  benefit_id: string;
  staff_id: string;
}

// =====================================================================================
// Dashboard / summary
// =====================================================================================

export interface BenefitsEnrollmentStats {
  total_benefits: number;
  active_benefits: number;
  total_active_enrollments: number;
  total_monthly_cost: number;
  by_category: { category: BenefitCategory; count: number; cost: number }[];
}

// =====================================================================================
// Filters
// =====================================================================================

export interface BenefitsFilters {
  institution_id?: string;
  category?: BenefitCategory;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export interface BenefitsListResponse {
  data: HRBenefitWithCount[];
  total: number;
  page: number;
  limit: number;
}
