// types/staff.ts

export interface EmploymentCategory {
  id: string;
  category_name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface CreateEmploymentCategoryDto {
  category_name: string;
  description?: string;
  is_active?: boolean;
}

export interface UpdateEmploymentCategoryDto
  extends Partial<CreateEmploymentCategoryDto> {}

export interface CategoryFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CategoryListResponse {
  data: EmploymentCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// staff List

export type Gender = 'male' | 'female' | 'bigender';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widow';
export type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-';

export interface Staff {
  id: string;
  first_name: string;
  last_name: string;
  gender: Gender;
  date_of_birth: string;
  marital_status: MaritalStatus;
  blood_group?: BloodGroup;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;

  // Foreign keys
  category_id: string;
  institution_id: string;
  department_id: string;

  // Related data
  category?: EmploymentCategory;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  department?: {
    id: string;
    department_name: string;
  };

  // Audit fields
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface CreateStaffDto {
  first_name: string;
  last_name: string;
  gender: Gender;
  date_of_birth: string;
  marital_status: MaritalStatus;
  blood_group?: BloodGroup;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  category_id: string;
  institution_id: string;
  department_id: string;
  is_active?: boolean;
}

export interface UpdateStaffDto extends Partial<CreateStaffDto> {}

export interface StaffFilters {
  search?: string;
  category_id?: string;
  institution_id?: string;
  department_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface StaffListResponse {
  data: Staff[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
