// types/staff.ts

export interface EmploymentCategory {
  id: string;
  category_name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface CreateEmploymentCategoryDto {
  category_name: string;
  description?: string;
  is_active?: boolean;
}

export interface UpdateEmploymentCategoryDto
  extends Partial<CreateEmploymentCategoryDto> {}

export interface CategoryFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CategoryListResponse {
  data: EmploymentCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// staff List

export type Gender = 'male' | 'female' | 'bigender';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widow';
export type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'A1+'
  | 'A1B';

// ============================================
// FACILITATOR ROLE TYPES (Workshop Transformation)
// ============================================

/**
 * Staff role type for outcome-focused education
 */
export type StaffRoleType = 'teacher' | 'facilitator' | 'trainer' | 'industry_mentor' | 'hybrid';

/**
 * Facilitator certification entry
 */
export interface FacilitatorCertification {
  certification_name: string;
  issuing_body: string;
  issue_date: string;
  expiry_date?: string;
  certificate_url?: string;
}

/**
 * Outcome metrics for staff performance tracking
 */
export interface StaffOutcomeMetrics {
  learners_mentored?: number;
  average_competency_improvement?: number;
  courses_with_competency_mapping?: number;
  industry_projects_facilitated?: number;
  placement_success_rate?: number;
  student_satisfaction_score?: number;
  last_computed?: string;
}

export interface Staff {
  id: string;
  first_name: string;
  last_name: string;
  gender: Gender;
  date_of_birth: string;
  marital_status: MaritalStatus;
  blood_group?: BloodGroup;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  institution_email: string;

  // Foreign keys
  category_id: string;
  institution_id: string;
  department_id: string;

  // Related data
  category?: EmploymentCategory;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  department?: {
    id: string;
    department_name: string;
  };

  // Facilitator & Outcome Fields (Workshop Transformation)
  role_type?: StaffRoleType;
  facilitator_certification?: FacilitatorCertification[];
  outcome_metrics?: StaffOutcomeMetrics;

  // Audit fields
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface CreateStaffDto {
  first_name: string;
  last_name: string;
  gender: Gender;
  date_of_birth: string;
  marital_status: MaritalStatus;
  blood_group?: BloodGroup;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  category_id: string;
  institution_id: string;
  institution_email: string;
  department_id: string;
  is_active?: boolean;
}

export interface UpdateStaffDto extends Partial<CreateStaffDto> {}

export interface StaffFilters {
  search?: string;
  category_id?: string;
  institution_id?: string;
  institution_email?: string;
  department_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface StaffListResponse {
  data: Staff[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Staff Dashboard Analytics Types

export interface StaffDashboardFilters {
  dateRange?: {
    from: Date | undefined;
    to: Date | undefined;
  };
  institutionId?: string;
  departmentId?: string;
  categoryId?: string;
  status?: string[];
}

export interface StaffOverviewStats {
  totalStaff: number;
  activeStaff: number;
  inactiveStaff: number;
  newHires: number; // Staff hired in the current month
  profileCompletionRate: number;
  averageTenure: number; // Average years of service
  staffWithProfiles: number;
  staffWithoutProfiles: number;
}

export interface StaffRegistrationTrend {
  date: string;
  count: number;
  cumulative: number;
}

export interface StaffInstitutionStats {
  id: string;
  name: string;
  staffCount: number;
  percentage: number;
  activeCount: number;
  inactiveCount: number;
}

export interface StaffDepartmentStats {
  id: string;
  name: string;
  institutionId: string;
  institutionName: string;
  staffCount: number;
  percentage: number;
  activeCount: number;
  inactiveCount: number;
}

export interface StaffCategoryStats {
  id: string;
  name: string;
  staffCount: number;
  percentage: number;
  activeCount: number;
  inactiveCount: number;
  averageTenure: number;
}

export interface StaffGeographicStats {
  stateDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  districtDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
}

export interface StaffDemographicStats {
  genderDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  maritalStatusDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  ageGroups: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
}

export interface StaffTenureAnalytics {
  tenureDistribution: Array<{
    range: string; // e.g., "0-1 years", "1-5 years", etc.
    count: number;
    percentage: number;
  }>;
  averageTenureByCategory: Array<{
    categoryName: string;
    averageTenure: number;
  }>;
  averageTenureByDepartment: Array<{
    departmentName: string;
    institutionName: string;
    averageTenure: number;
  }>;
  newHiresTrend: Array<{
    month: string;
    count: number;
  }>;
}

export interface StaffProfileAnalytics {
  profileCompletionBreakdown: Array<{
    field: string;
    completedCount: number;
    totalCount: number;
    percentage: number;
  }>;
  profileCompletionByCategory: Array<{
    categoryName: string;
    completedCount: number;
    totalCount: number;
    percentage: number;
  }>;
  missingFields: Array<{
    field: string;
    missingCount: number;
    percentage: number;
  }>;
}

export interface StaffDashboardStats {
  overview: StaffOverviewStats;
  registrationTrends: StaffRegistrationTrend[];
  institutionStats: StaffInstitutionStats[];
  departmentStats: StaffDepartmentStats[];
  categoryStats: StaffCategoryStats[];
  geographicStats: StaffGeographicStats;
  demographicStats: StaffDemographicStats;
  tenureAnalytics: StaffTenureAnalytics;
  profileAnalytics: StaffProfileAnalytics;
}
