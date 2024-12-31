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
