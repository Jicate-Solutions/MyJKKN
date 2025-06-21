// User role types
export type UserRole = string;

// Legacy role constants for backward compatibility
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMINISTRATOR: 'administrator',
  FACULTY: 'faculty',
  STUDENT: 'student',
  STAFF: 'staff',
  GUEST: 'guest'
} as const;

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

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
  institution_id: string | null;
  institutions?: Institution | null;
  created_at: string;
  updated_at: string;
  last_login: string | null;
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
    };
  };
}
