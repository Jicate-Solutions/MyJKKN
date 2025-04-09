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
          student_name: string;
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
          student_name: string;
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
          student_name?: string;
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
      // Add other tables as they exist in your database
      // This is the minimum structure required for auth to work
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
