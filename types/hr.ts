/**
 * HR Module TypeScript Types
 *
 * Based on: specs/myjkkn-hr-module-spec-v4-evidence.md
 * Shadow-tenant pattern: jkknkb/MyJKKN/Architecture/shadow-tenant-pattern.md
 * Schema: supabase/setup/01_tables.sql (hr_organizations, user_hr_access, hr_cadres, hr_designations, hr_employees)
 */

import type { Database } from './supabase';

// === Shadow Tenant ===
export type HROrganization = Database['public']['Tables']['hr_organizations']['Row'];
export type HROrganizationInsert = Database['public']['Tables']['hr_organizations']['Insert'];
export type HROrganizationUpdate = Database['public']['Tables']['hr_organizations']['Update'];

export type HROrganizationSource = 'jkkn' | 'external';

// === User Access ===
export type UserHRAccess = Database['public']['Tables']['user_hr_access']['Row'];
export type HRRole = 'hr_admin' | 'hr_manager' | 'payroll_officer' | 'employee';

// === Cadres ===
export type HRCadre = Database['public']['Tables']['hr_cadres']['Row'];
export type HRCadreInsert = Database['public']['Tables']['hr_cadres']['Insert'];
export type HRCadreCode = 'TEACHING' | 'SUPPORTING_TECH' | 'NON_TECHNICAL' | string;

// === Designations ===
export type HRDesignation = Database['public']['Tables']['hr_designations']['Row'];
export type HRDesignationInsert = Database['public']['Tables']['hr_designations']['Insert'];

export type HRDesignationWithCadre = HRDesignation & {
  cadre?: HRCadre;
};

// === Employees (Polymorphic) ===
export type HREmploymentType = 'full_time' | 'guest' | 'student_ta' | 'vendor_monitored';

export type HREmployee = Database['public']['Tables']['hr_employees']['Row'];
export type HREmployeeInsert = Database['public']['Tables']['hr_employees']['Insert'];
export type HREmployeeUpdate = Database['public']['Tables']['hr_employees']['Update'];

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

// === Employment type display labels ===
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
