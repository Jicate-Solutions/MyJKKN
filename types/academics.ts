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
  semester: string | number;
  section: string;
  timetable_name: string;
  version: number;
  is_active: boolean;
  is_template: boolean;
  template_name?: string;
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
  slots?: TimetableSlot[];
}

export interface TimetableSlot {
  id: string;
  timetable_id: string;
  day_of_week: DayOfWeek;
  period_id: string;
  course_id?: string;
  staff_id?: string;
  is_break_slot: boolean;
  break_description?: string;
  created_at: string;
  updated_at: string;
  // Include related data
  period?: Period;
  course?: {
    id: string;
    course_name: string;
    course_code: string;
  };
  staff?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export interface CreateTimetableDto {
  institution_id: string;
  academic_year_id: string;
  degree_id: string;
  program_id: string;
  department_id: string;
  semester: string | number;
  section: string;
  timetable_name: string;
  is_active?: boolean;
  is_template?: boolean;
  template_name?: string;
}

export interface UpdateTimetableDto extends Partial<CreateTimetableDto> {}

export interface CreateTimetableSlotDto {
  timetable_id: string;
  day_of_week: DayOfWeek;
  period_id: string;
  course_id?: string;
  staff_id?: string;
  is_break_slot?: boolean;
  break_description?: string;
}

export interface UpdateTimetableSlotDto
  extends Partial<Omit<CreateTimetableSlotDto, 'timetable_id'>> {}

export interface TimetableFilters {
  search?: string;
  institution_id?: string;
  academic_year_id?: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester?: string | number;
  section?: string;
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
  semester: string | number | null;
  section: string | null;
}
