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

// Period Management Types
export interface Period {
  id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePeriodDto {
  period_name: string;
  start_time: string; // Format: HH:MM:SS
  end_time: string; // Format: HH:MM:SS
  is_break?: boolean;
}

export interface UpdatePeriodDto extends Partial<CreatePeriodDto> {}

export interface PeriodFilters {
  search?: string;
  isBreak?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface PeriodListResponse {
  data: Period[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
