// types/organizations.ts

// types/organizations.ts - Update the Institution interfaces

export interface DepartmentContact {
  contact_name?: string; // Make fields optional
  designation?: string;
  email?: string;
  mobile?: string;
}

export interface InstitutionDepartments {
  transportation?: DepartmentContact;
  administration?: DepartmentContact;
  accounts?: DepartmentContact;
  admission?: DepartmentContact;
  placement?: DepartmentContact;
  antiRagging?: DepartmentContact;
}

export type InstitutionType = 'self' | 'autonomous' | 'aided';
export type InstitutionCategory = 'ug' | 'pg' | 'ug_pg';

export interface Institution {
  id: string;
  name: string;
  counselling_code: string;
  institution_type: InstitutionType;
  category: InstitutionCategory;
  accredited_by: string;
  address_line1: string;
  address_line2?: string;
  address_line3?: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  email: string;
  phone: string;
  website?: string;
  logo_url?: string;
  departments?: InstitutionDepartments; // Make departments optional
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateInstitutionDto
  extends Omit<Institution, 'id' | 'created_at' | 'updated_at'> {
  departments?: InstitutionDepartments; // Make departments optional
}

export interface UpdateInstitutionDto extends Partial<CreateInstitutionDto> {}

export interface InstitutionFilters {
  search?: string;
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
