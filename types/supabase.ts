// types/supabase.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone_number: string | null;
          department: 'engineering' | 'science' | 'arts' | 'medical' | null;
          role: 'super_admin' | 'administrator' | 'faculty' | 'student';
          profile_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone_number?: string | null;
          department?: 'engineering' | 'science' | 'arts' | 'medical' | null;
          role?: 'super_admin' | 'administrator' | 'faculty' | 'student';
          profile_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone_number?: string | null;
          department?: 'engineering' | 'science' | 'arts' | 'medical' | null;
          role?: 'super_admin' | 'administrator' | 'faculty' | 'student';
          profile_completed?: boolean;
          updated_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          updated_at?: string;
        };
      };
      subcategories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          parent_id: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          parent_id: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          parent_id?: string;
          updated_at?: string;
        };
      };
      applications: {
        Row: {
          id: string;
          name: string;
          url: string;
          description: string | null;
          category_id: string | null;
          subcategory_id: string | null;
          icon_url: string | null;
          display_order: number;
          is_active: boolean;
          integration_type: string | null;
          authentication_method: string | null;
          tags: string[] | null;
          support_contact: string | null;
          status_message: string | null;
          launch_parameters: Json | null;
          visibility_conditions: Json | null;
          instructions_url: string | null;
          supported_platforms: string[] | null;
          api_endpoint: string | null;
          security_settings: Json | null;
          version: string | null;
          enable_feedback: boolean;
          application_type: string | null;
          available_languages: string[] | null;
          data_sensitivity_level: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          url: string;
          description?: string | null;
          category_id?: string | null;
          subcategory_id?: string | null;
          icon_url?: string | null;
          display_order?: number;
          is_active?: boolean;
          integration_type?: string | null;
          authentication_method?: string | null;
          tags?: string[] | null;
          support_contact?: string | null;
          status_message?: string | null;
          launch_parameters?: Json | null;
          visibility_conditions?: Json | null;
          instructions_url?: string | null;
          supported_platforms?: string[] | null;
          api_endpoint?: string | null;
          security_settings?: Json | null;
          version?: string | null;
          enable_feedback?: boolean;
          application_type?: string | null;
          available_languages?: string[] | null;
          data_sensitivity_level?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          url?: string;
          description?: string | null;
          category_id?: string | null;
          subcategory_id?: string | null;
          icon_url?: string | null;
          display_order?: number;
          is_active?: boolean;
          integration_type?: string | null;
          authentication_method?: string | null;
          tags?: string[] | null;
          support_contact?: string | null;
          status_message?: string | null;
          launch_parameters?: Json | null;
          visibility_conditions?: Json | null;
          instructions_url?: string | null;
          supported_platforms?: string[] | null;
          api_endpoint?: string | null;
          security_settings?: Json | null;
          version?: string | null;
          enable_feedback?: boolean;
          application_type?: string | null;
          available_languages?: string[] | null;
          data_sensitivity_level?: string | null;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
};

export type Tables<
  PublicTableNameOrOptions extends
    | keyof Database['public']['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName]
  : PublicTableNameOrOptions extends keyof Database['public']['Tables']
  ? Database['public']['Tables'][PublicTableNameOrOptions]
  : never;

export type DbResult<T> = T extends PromiseLike<infer U> ? U : never;

export type DbResultOk<T> = T extends PromiseLike<{ data: infer U }>
  ? U
  : never;

export type Row<TableName extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][TableName]['Row'];

export type InsertDto<TableName extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][TableName]['Insert'];

export type UpdateDto<TableName extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][TableName]['Update'];

// Utility types for better type safety
export type Profile = Row<'profiles'>;
export type Category = Row<'categories'>;
export type Subcategory = Row<'subcategories'>;
export type Application = Row<'applications'>;
