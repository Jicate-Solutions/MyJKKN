// User role types
export type UserRole = string;

// Legacy role constants for backward compatibility
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMINISTRATOR: 'administrator',
  FACULTY: 'faculty',
  STUDENT: 'student',
  STAFF: 'staff',
  GUEST: 'guest',
  DRIVER: 'driver',
  PARENT: 'parent',
  HOD: 'hod',
  PRINCIPAL: 'principal',
  // Solutions Hub roles (added 2026-02-03)
  BUILDER: 'builder',
  COHORT_MEMBER: 'cohort_member',
  PRODUCTION_LEARNER: 'production_learner',
  JICATE_STAFF: 'jicate_staff',
  CLIENT: 'client'
} as const;

// Solutions Hub role mapping from original Solutions Hub project
export const SOLUTIONS_HUB_ROLE_MAPPING = {
  // MyJKKN role -> Solutions Hub equivalent
  super_admin: 'md_caio',        // MD/CAIO master access
  hod: 'department_head',        // Department head scope
  staff: 'department_staff',     // Department staff scope
  builder: 'builder',            // Software talent
  cohort_member: 'cohort_member', // Training talent
  production_learner: 'production_learner', // Content talent
  jicate_staff: 'jicate_staff',  // JICATE facilitator
  client: 'client'               // External client
} as const;

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type StudentStatus =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'exited'
  | 'graduated';

// Institution interface for profile relations
export interface Institution {
  id: string;
  name: string;
  category: string | null;
  institution_type: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

// Department interface for profile relations
export interface Department {
  id: string;
  department_name: string;
  department_code: string;
}

// Base Profile interface
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone_number: string | null;
  role: UserRole;
  bio: string | null;
  gender: Gender | null;
  designation: string | null;
  avatar_url: string | null;
  profile_completed: boolean;
  is_active: boolean;
  is_super_admin?: boolean;
  is_pre_registered?: boolean;
  institution_id: string | null;
  department_id: string | null;
  learner_id: string | null;
  institutions?: Institution | null;
  departments?: Department | null;
  created_at: string;
  updated_at: string;
  last_login: string | null;

  // Student-related fields (populated if user is a student)
  student_id?: string | null;
  student_status?: StudentStatus | null;
  student_profile_complete?: boolean | null;

  // Multi-role support fields
  user_roles?: UserRoleAssignment[];
  primary_role?: UserRoleAssignment;
  merged_permissions?: Record<string, boolean>;
}

// Profile update interface
export interface ProfileUpdate {
  full_name?: string | null;
  phone_number?: string | null;
  bio?: string | null;
  gender?: Gender | null;
  designation?: string | null;
  avatar_url?: string | null;
  profile_completed?: boolean;
  is_active?: boolean;
}

// Custom role interface
export interface CustomRole {
  id: string;
  role_key: string;
  role_name: string;
  description: string | null;
  is_system_role: boolean;
  permissions: Record<string, boolean>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// User role assignment interface (for multi-role support)
export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  is_primary: boolean;
  assigned_at: string;
  assigned_by?: string | null;
  // Joined role data (from get_user_roles_with_details function)
  role_key?: string;
  role_name?: string;
  role_description?: string | null;
  permissions?: Record<string, boolean>;
}

// Custom role creation interface
export interface CustomRoleCreate {
  role_key: string;
  role_name: string;
  description?: string | null;
  permissions?: Record<string, boolean>;
  is_system_role?: boolean;
}

// Custom role update interface
export interface CustomRoleUpdate {
  role_name?: string;
  description?: string | null;
  permissions?: Record<string, boolean>;
}

// User role assignment for database operations
export interface UserRoleAssignmentInsert {
  user_id: string;
  role_id: string;
  is_primary?: boolean;
  assigned_by?: string | null;
}

export interface UserRoleAssignmentUpdate {
  is_primary?: boolean;
}

// Database definition for Supabase
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at' | 'last_login'>;
        Update: ProfileUpdate;
      };
      custom_roles: {
        Row: CustomRole;
        Insert: Omit<CustomRole, 'id' | 'created_at' | 'updated_at'>;
        Update: CustomRoleUpdate;
      };
      user_roles: {
        Row: UserRoleAssignment;
        Insert: UserRoleAssignmentInsert;
        Update: UserRoleAssignmentUpdate;
      };
    };
  };
}
