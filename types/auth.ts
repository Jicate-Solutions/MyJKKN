// User role types
export type UserRole = 'super_admin' | 'administrator' | 'faculty' | 'student';

// Department types
export type Department = 'engineering' | 'science' | 'arts' | 'medical';

// Base Profile interface
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  department: Department | null;
  role: UserRole;
  phone_number: string | null;
  student_id: string | null;
  faculty_id: string | null;
  bio: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

// Profile update interface
export interface ProfileUpdate {
  full_name?: string | null;
  department?: Department | null;
  phone_number?: string | null;
  student_id?: string | null;
  faculty_id?: string | null;
  bio?: string | null;
  profile_completed?: boolean;
}

// Complete profile data interface
export interface CompleteProfileData extends ProfileUpdate {
  role?: UserRole;
}

// Database definition
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: ProfileUpdate;
      };
    };
  };
}
