// types/api-database.ts
// Comprehensive Database type for API management routes

export interface ApiKeyPermissions {
  read: boolean;
  write: boolean;
}

export interface ApiKeyMetadata {
  role?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ApiKey {
  id: string;
  name: string;
  key_value: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  permissions: ApiKeyPermissions;
  metadata?: ApiKeyMetadata;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  name: string;
  url: string;
  description: string | null;
  category_id: string;
  subcategory_id?: string | null;
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
  uses_parent_auth?: boolean;
  app_id?: string | null;
  api_key_hash?: string | null;
  allowed_redirect_uris?: string[] | null;
  allowed_scopes?: string[] | null;
  rate_limit_requests?: number;
  rate_limit_window_minutes?: number;
  last_auth_activity?: string | null;
  auth_enabled_at?: string | null;
  auth_enabled_by?: string | null;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subcategory {
  id: string;
  name: string;
  category_id: string;
  created_at: string;
  updated_at: string;
}

export interface Institution {
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
}

export interface Department {
  id: string;
  name: string;
  code: string | null;
  institution_id: string;
  hod_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  name: string;
  code: string | null;
  department_id: string;
  degree_id: string | null;
  duration_years: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Semester {
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
}

export interface Section {
  id: string;
  name: string;
  semester_id: string;
  capacity: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  course_name: string;
  course_code: string | null;
  credits: number | null;
  semester_id: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Degree {
  id: string;
  degree_name: string;
  degree_code: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Student {
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
}

export interface Staff {
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
}

// Database type for Supabase client
export interface ApiDatabase {
  public: {
    Tables: {
      api_keys: {
        Row: ApiKey;
        Insert: Partial<ApiKey>;
        Update: Partial<ApiKey>;
      };
      applications: {
        Row: Application;
        Insert: Partial<Application>;
        Update: Partial<Application>;
      };
      categories: {
        Row: Category;
        Insert: Partial<Category>;
        Update: Partial<Category>;
      };
      subcategories: {
        Row: Subcategory;
        Insert: Partial<Subcategory>;
        Update: Partial<Subcategory>;
      };
      institutions: {
        Row: Institution;
        Insert: Partial<Institution>;
        Update: Partial<Institution>;
      };
      departments: {
        Row: Department;
        Insert: Partial<Department>;
        Update: Partial<Department>;
      };
      programs: {
        Row: Program;
        Insert: Partial<Program>;
        Update: Partial<Program>;
      };
      semesters: {
        Row: Semester;
        Insert: Partial<Semester>;
        Update: Partial<Semester>;
      };
      sections: {
        Row: Section;
        Insert: Partial<Section>;
        Update: Partial<Section>;
      };
      courses: {
        Row: Course;
        Insert: Partial<Course>;
        Update: Partial<Course>;
      };
      degrees: {
        Row: Degree;
        Insert: Partial<Degree>;
        Update: Partial<Degree>;
      };
      students: {
        Row: Student;
        Insert: Partial<Student>;
        Update: Partial<Student>;
      };
      staff: {
        Row: Staff;
        Insert: Partial<Staff>;
        Update: Partial<Staff>;
      };
    };
  };
}
