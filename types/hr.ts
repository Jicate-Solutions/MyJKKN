/**
 * HR Module TypeScript Types (Sprint 1 redesigned schema)
 *
 * Architecture:
 * - JKKN full-time employees live in `staff` (canonical) + `hr_staff_details` (HR extension)
 * - Non-staff employment types (guest, student_ta, vendor_monitored) live in `hr_employees`
 * - Single list view is a UNION of both
 *
 * Shadow-tenant pattern: jkknkb/MyJKKN/Architecture/shadow-tenant-pattern.md
 */

// === Shadow Tenant ===
export type HROrganizationSource = 'jkkn' | 'external';

export interface HROrganization {
  id: string;
  institution_id: string | null;
  source: HROrganizationSource;
  name: string;
  slug: string;
  billing_plan: string;
  subscription_status: string;
  created_at: string;
  updated_at: string;
}

// === User Access ===
export type HRRole = 'hr_admin' | 'hr_manager' | 'payroll_officer' | 'employee';

export interface UserHRAccess {
  user_id: string;
  hr_organization_id: string;
  role: HRRole;
  created_at: string;
}

// === Cadres ===
export type HRCadreCode = 'TEACHING' | 'SUPPORTING_TECH' | 'NON_TECHNICAL' | 'ADMINISTRATIVE' | string;

export interface HRCadre {
  id: string;
  hr_organization_id: string;
  name: string;
  code: HRCadreCode;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// === Designations ===
export interface HRDesignation {
  id: string;
  hr_organization_id: string;
  cadre_id: string;
  name: string;
  code: string;
  reports_to_designation_id: string | null;
  is_management: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// === Employment Types (5 total, 1 via staff + 4 via hr_employees) ===
export type HREmploymentType =
  | 'full_time'           // JKKN staff — lives in staff + hr_staff_details
  | 'guest'               // External guest lecturer
  | 'student_ta'          // Paid student teaching/research assistant (has learners_profiles link)
  | 'vendor_monitored'    // Vendor-employed, read-only directory
  | 'unpaid_volunteer';   // Senior learner ambassadors — ID card + biometric + leave; no payroll

// === hr_staff_details — HR extension of staff for JKKN full-time ===
export interface HRStaffDetails {
  staff_id: string;
  hr_organization_id: string;
  designation_id: string | null;
  cadre_id: string | null;
  reports_to_staff_id: string | null;
  hr_employee_code: string | null;
  hr_deactivated_at: string | null;
  hr_deactivation_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface HRStaffDetailsInsert
  extends Partial<Omit<HRStaffDetails, 'created_at' | 'updated_at'>> {
  staff_id: string;
  hr_organization_id: string;
}

export type HRStaffDetailsUpdate = Partial<HRStaffDetails>;

// === hr_employees — non-staff types only (guest, student_ta, vendor_monitored) ===
export type HRNonStaffEmploymentType = Exclude<HREmploymentType, 'full_time'>;

export interface HREmployee {
  id: string;
  hr_organization_id: string;
  employment_type: HRNonStaffEmploymentType;
  learner_profile_id: string | null;
  vendor_name: string | null;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  designation_id: string | null;
  cadre_id: string | null;
  reports_to_employee_id: string | null;
  date_of_exit: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  deactivation_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface HREmployeeInsert
  extends Partial<Omit<HREmployee, 'id' | 'created_at' | 'updated_at'>> {
  hr_organization_id: string;
  employment_type: HRNonStaffEmploymentType;
  employee_code: string;
  first_name: string;
}

export type HREmployeeUpdate = Partial<HREmployee>;

// === Unified view: "HR Person" — represents either a staff-backed row or a hr_employees row ===
export interface HRPersonView {
  source: 'staff' | 'hr_employees';
  // Stable id used for routing; for staff source it's staff.id, for hr_employees it's hr_employees.id
  id: string;
  hr_organization_id: string;
  organization_name: string | null;
  employment_type: HREmploymentType;
  employee_code: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  designation_name: string | null;
  cadre_name: string | null;
  department_id: string | null;
  date_of_joining: string | null;
  is_active: boolean;
  // Source-specific raw rows for detail page joins
  staff_id?: string;
  hr_employee_id?: string;
}

// === Filters ===
export interface HRPersonFilters {
  hr_organization_id?: string;
  employment_type?: HREmploymentType;
  cadre_id?: string;
  designation_id?: string;
  department_id?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

// === API response ===
export interface HRPersonListResponse {
  data: HRPersonView[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// === Display labels ===
export const EMPLOYMENT_TYPE_LABELS: Record<HREmploymentType, string> = {
  full_time: 'Full-time (Staff)',
  guest: 'Guest Lecturer',
  student_ta: 'Student TA',
  vendor_monitored: 'Vendor-Monitored',
  unpaid_volunteer: 'Volunteer (Senior Learner)',
};

// === Additional Roles (multi-role: Professor who's also HOD + IQAC Coordinator) ===
export type HRAdditionalRoleCategory = 'leadership' | 'coordination' | 'exam' | 'committee' | string;

export interface HRAdditionalRole {
  id: string;
  hr_organization_id: string;
  staff_id: string | null;
  hr_employee_id: string | null;
  role_type: string;                       // Extensible text (HOD, IQAC Coordinator, etc.)
  role_category: HRAdditionalRoleCategory | null;
  department_id: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  notes: string | null;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRAdditionalRoleType {
  id: string;
  hr_organization_id: string;
  role_type: string;
  role_category: HRAdditionalRoleCategory | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export const HR_ROLE_LABELS: Record<HRRole, string> = {
  hr_admin: 'HR Admin',
  hr_manager: 'HR Manager',
  payroll_officer: 'Payroll Officer',
  employee: 'Employee',
};
