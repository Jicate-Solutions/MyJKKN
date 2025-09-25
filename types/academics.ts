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
  institution_id: string;
  created_at: string;
  updated_at: string;
  // Relations
  institution?: {
    id: string;
    name: string;
  };
}

export interface CreatePeriodDto {
  period_name: string;
  start_time: string; // Format: HH:MM:SS
  end_time: string; // Format: HH:MM:SS
  is_break?: boolean;
  institution_id: string;
}

export interface UpdatePeriodDto extends Partial<CreatePeriodDto> {}

export interface PeriodFilters {
  search?: string;
  institution_id?: string;
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

// Timetable Management Types
export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export interface Timetable {
  id: string;
  institution_id: string;
  academic_year_id: string;
  degree_id: string;
  program_id: string;
  department_id: string;
  semester_id: string;
  section_id?: string;
  timetable_name: string;
  version: number;
  is_active: boolean;
  is_template: boolean;
  template_name?: string;
  template_description?: string;
  template_category?: string;
  template_tags?: string[];
  usage_count?: number;
  created_from_template_id?: string;
  start_date?: string;
  end_date?: string;
  selected_days?: DayOfWeek[];
  selected_dates?: string[] | any; // JSONB column for selected dates in batch format
  created_by: string;
  created_at: string;
  updated_at: string;
  // Include related data
  institution?: {
    id: string;
    name: string;
  };
  academic_year?: {
    id: string;
    academic_year_name: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  semesters?: {
    id: string;
    semester_name: string;
  };
  sections?: {
    id: string;
    section_name: string;
  };
  slots?: any[];
  timetable_format: 'regular' | 'batch';
  timetable_data?: any;
  periods?: any;
}

export interface CreateTimetableDto {
  institution_id: string;
  academic_year_id: string;
  degree_id: string;
  program_id: string;
  department_id: string;
  semester_id: string;
  section_id?: string;
  timetable_name: string;
  is_active?: boolean;
  is_template?: boolean;
  template_name?: string;
  template_description?: string;
  template_category?: string;
  template_tags?: string[];
  created_from_template_id?: string;
  start_date?: string;
  end_date?: string;
  selected_dates?: string[] | any; // JSONB column for selected dates in batch format
  timetable_format?: 'regular' | 'batch'; // New field for timetable format
  timetable_data?: any;
  periods?: any;
}

export interface UpdateTimetableDto extends Partial<CreateTimetableDto> {}

export interface TimetableFilters {
  search?: string;
  institution_id?: string;
  academic_year_id?: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester?: string; // UUID of semester (semester_id)
  section?: string; // Section name (section_name)
  is_active?: boolean;
  is_template?: boolean;
  page?: number;
  limit?: number;
}

export interface TimetableListResponse {
  data: Timetable[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Context type for timetable creation
export interface TimetableContextType {
  institution_id: string | null;
  academic_year_id: string | null;
  degree_id: string | null;
  program_id: string | null;
  department_id: string | null;
  semester_id: string | null;
  section_id?: string | null; // Made optional
}

// Template-specific types
export interface TimetableTemplate extends Timetable {
  is_template: true;
  template_name: string;
  template_description?: string;
  template_category?: string;
  template_tags?: string[];
  usage_count?: number;
}

export interface CreateTemplateDto {
  timetable_name: string;
  template_name: string;
  template_description?: string;
  template_category?: string;
  template_tags?: string[];
  institution_id: string;
  academic_year_id?: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
  timetable_format?: 'regular' | 'batch';
  periods?: any;
  timetable_data?: any;
  selected_days?: DayOfWeek[];
}

export interface UpdateTemplateDto extends Partial<CreateTemplateDto> {}

export interface TemplateFilters {
  search?: string;
  institution_id?: string;
  academic_year_id?: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  template_category?: string;
  template_tags?: string[];
  page?: number;
  limit?: number;
}

export interface TemplateListResponse {
  data: TimetableTemplate[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateFromTemplateDto {
  template_id: string;
  timetable_name: string;
  institution_id: string;
  academic_year_id: string;
  degree_id: string;
  program_id: string;
  department_id: string;
  semester_id: string;
  section_id?: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}
