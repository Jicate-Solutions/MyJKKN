// types/academics.ts

export interface AcademicYear {
  id: string;
  institution_id: string;
  academic_year_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
}

export interface CreateAcademicYearDto {
  institution_id: string;
  academic_year_name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
}

export interface UpdateAcademicYearDto extends Partial<CreateAcademicYearDto> {}

export interface AcademicYearFilters {
  search?: string;
  institution_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface AcademicYearListResponse {
  data: AcademicYear[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
