import { Profile, ProfileUpdate, CustomRole, CustomRoleUpdate } from './auth';

export type { Profile, ProfileUpdate, CustomRole, CustomRoleUpdate };

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
      admissions: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          first_name: string;
          last_name: string;
          course_name: string;
          status: 'pending' | 'approved' | 'rejected' | 'on_hold';
          application_date: string;
          notes: string | null;
          email: string;
          phone: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
          first_name: string;
          last_name: string;
          course_name: string;
          status?: 'pending' | 'approved' | 'rejected' | 'on_hold';
          application_date: string;
          notes?: string | null;
          email: string;
          phone: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          first_name?: string;
          last_name?: string;
          course_name?: string;
          status?: 'pending' | 'approved' | 'rejected' | 'on_hold';
          application_date?: string;
          notes?: string | null;
          email?: string;
          phone?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'admissions_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          created_at: string;
          updated_at: string;
          role: 'admin' | 'student' | 'instructor';
        };
        Insert: {
          id?: string;
          email: string;
          full_name: string;
          created_at?: string;
          updated_at?: string;
          role?: 'admin' | 'student' | 'instructor';
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          created_at?: string;
          updated_at?: string;
          role?: 'admin' | 'student' | 'instructor';
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          name: string;
          key_value: string;
          created_by: string;
          expires_at: string | null;
          last_used_at: string | null;
          is_active: boolean;
          permissions: { read: boolean; write: boolean };
          metadata?: { role?: string; description?: string; [key: string]: unknown };
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      applications: {
        Row: {
          id: string;
          name: string;
          url: string;
          description: string | null;
          category_id: string;
          subcategory_id: string | null;
          roles_access: string[];
          display_order: number;
          is_active: boolean;
          integration_type: string;
          auth_method: string;
          tags: string[];
          support_contact: Record<string, unknown> | null;
          supported_platforms: string;
          api_endpoints: Record<string, unknown>[];
          application_type: string;
          data_sensitivity: string;
          icon_path: string | null;
          screenshots: string[] | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          category?: { id: string; name: string; description: string | null };
          subcategory?: { id: string; name: string } | null;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      subcategories: {
        Row: {
          id: string;
          name: string;
          category_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      institutions: {
        Row: {
          id: string;
          name: string;
          code: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          logo_url: string | null;
          counselling_code: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          departments?: Array<{ id: string; name: string; code: string | null }>;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      departments: {
        Row: {
          id: string;
          name: string;
          code: string | null;
          institution_id: string;
          hod_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      programs: {
        Row: {
          id: string;
          name: string;
          code: string | null;
          department_id: string;
          degree_id: string | null;
          duration_years: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      semesters: {
        Row: {
          id: string;
          name: string;
          semester_number: number;
          program_id: string;
          academic_year: string | null;
          start_date: string | null;
          end_date: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      sections: {
        Row: {
          id: string;
          name: string;
          semester_id: string;
          capacity: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      courses: {
        Row: {
          id: string;
          course_name: string;
          course_code: string | null;
          credits: number | null;
          semester_id: string | null;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      degrees: {
        Row: {
          id: string;
          degree_name: string;
          degree_code: string | null;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      students: {
        Row: {
          id: string;
          user_id: string | null;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          roll_number: string | null;
          section_id: string | null;
          institution_id: string | null;
          admission_year: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      staff: {
        Row: {
          id: string;
          user_id: string | null;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          employee_id: string | null;
          department_id: string | null;
          institution_id: string | null;
          designation: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Views: {
      [key: string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Functions: {
      [key: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: {
      [key: string]: string[];
    };
  };
}
