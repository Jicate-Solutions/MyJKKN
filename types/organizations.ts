// types/organizations.ts

export interface Institution {
  id: string;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  institution_id: string;
  name: string;
  code: string;
  description: string | null;
  head_of_department: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: DepartmentStatus;
  capacity: number | null;
  year_established: number | null;
  last_review_date: string | null;
  next_review_date: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  institution?: {
    id: string;
    name: string;
    code: string;
  };
}

export type DepartmentStatus = 'active' | 'inactive' | 'archived';

export interface CreateInstitutionDto {
  name: string;
  code: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  is_active?: boolean;
}

export interface UpdateInstitutionDto extends Partial<CreateInstitutionDto> {}

export interface CreateDepartmentDto {
  institution_id: string;
  name: string;
  code: string;
  description?: string;
  head_of_department?: string;
  contact_email?: string;
  contact_phone?: string;
  status?: DepartmentStatus;
  capacity?: number;
  year_established?: number;
  last_review_date?: string;
  next_review_date?: string;
  is_active?: boolean;
}

export interface UpdateDepartmentDto extends Partial<CreateDepartmentDto> {}

export interface InstitutionWithDepartments extends Institution {
  departments: Department[];
}

export interface InstitutionFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface DepartmentFilters {
  institutionId?: string;
  search?: string;
  status?: DepartmentStatus;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface OrganizationListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface DepartmentWithInstitution extends Department {
  institution: {
    id: string;
    name: string;
    code: string;
  };
}
