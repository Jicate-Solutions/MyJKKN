/**
 * HR Module TypeScript Types
 *
 * Based on: specs/myjkkn-hr-module-spec-v4-evidence.md
 * Shadow-tenant pattern: jkknkb/MyJKKN/Architecture/shadow-tenant-pattern.md
 *
 * Self-contained types (no dependency on generated `Database` types) so this module
 * can ship independently. Future regeneration of `types/supabase.ts` via
 * `supabase gen types typescript` will automatically include hr_* tables.
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

export interface HROrganizationInsert
  extends Partial<Omit<HROrganization, 'id' | 'created_at' | 'updated_at'>> {
  source: HROrganizationSource;
  name: string;
  slug: string;
}

export interface HROrganizationUpdate extends Partial<HROrganization> {}

// === User Access ===
export type HRRole = 'hr_admin' | 'hr_manager' | 'payroll_officer' | 'employee';

export interface UserHRAccess {
  user_id: string;
  hr_organization_id: string;
  role: HRRole;
  created_at: string;
}

// === Cadres ===
export type HRCadreCode = 'TEACHING' | 'SUPPORTING_TECH' | 'NON_TECHNICAL' | string;

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

export interface HRCadreInsert
  extends Partial<Omit<HRCadre, 'id' | 'created_at' | 'updated_at'>> {
  hr_organization_id: string;
  name: string;
  code: string;
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

export interface HRDesignationInsert
  extends Partial<Omit<HRDesignation, 'id' | 'created_at' | 'updated_at'>> {
  hr_organization_id: string;
  cadre_id: string;
  name: string;
  code: string;
}

export type HRDesignationWithCadre = HRDesignation & {
  cadre?: HRCadre | null;
};

// === Employees (Polymorphic) ===
export type HREmploymentType = 'full_time' | 'guest' | 'student_ta' | 'vendor_monitored';

export interface HREmployee {
  id: string;
  hr_organization_id: string;
  employment_type: HREmploymentType;
  staff_id: string | null;
  learner_profile_id: string | null;
  vendor_name: string | null;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  institution_email: string | null;
  designation_id: string | null;
  cadre_id: string | null;
  reports_to_employee_id: string | null;
  date_of_joining: string | null;
  date_of_exit: string | null;
  work_location: string | null;
  department_id: string | null;
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
  employment_type: HREmploymentType;
  employee_code: string;
  first_name: string;
}

export interface HREmployeeUpdate extends Partial<HREmployee> {}

export type HREmployeeWithRelations = HREmployee & {
  designation?: HRDesignation | null;
  cadre?: HRCadre | null;
  organization?: HROrganization | null;
};

// === Filters (for list pages) ===
export interface HREmployeeFilters {
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

// === API response shapes ===
export interface HREmployeeListResponse {
  data: HREmployeeWithRelations[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// === Display labels ===
export const EMPLOYMENT_TYPE_LABELS: Record<HREmploymentType, string> = {
  full_time: 'Full-time',
  guest: 'Guest Lecturer',
  student_ta: 'Student TA',
  vendor_monitored: 'Vendor-Monitored',
};

export const HR_ROLE_LABELS: Record<HRRole, string> = {
  hr_admin: 'HR Admin',
  hr_manager: 'HR Manager',
  payroll_officer: 'Payroll Officer',
  employee: 'Employee',
};
