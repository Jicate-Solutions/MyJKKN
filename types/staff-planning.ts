export interface StaffPlan {
  id: string;
  institution_id: string;
  degree_id: string;
  program_id: string;
  department_id: string;
  semester_id: string;
  section: string;
  academic_year_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  courses?: StaffPlanCourse[];
  // Include related data
  institution?: {
    id: string;
    name: string;
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
  semester?: {
    id: string;
    semester_name: string;
  };
  academic_year?: {
    id: string;
    academic_year_name: string;
  };
}

export interface StaffPlanCourse {
  id: string;
  staff_plan_id: string;
  course_id: string;
  staff_id: string;
  hours_allocated: number;
  is_coordinator: boolean;
  is_combined: boolean;
  staff_type: string;
  created_at: string;
  updated_at: string;
  course?: {
    id: string;
    course_name: string;
    course_code: string;
  };
  staff?: {
    id: string;
    first_name: string;
    last_name: string;
    staff_id: string;
  };
}

export interface CreateStaffPlanDto {
  institution_id: string;
  degree_id: string;
  program_id: string;
  department_id: string;
  semester_id: string;
  section: string;
  academic_year_id: string;
  start_date: string;
  end_date: string;
  courses: {
    course_id: string;
    staff_id: string;
    hours_allocated: number;
    is_coordinator: boolean;
    is_combined: boolean;
    staff_type: string;
  }[];
}

export interface StaffPlanFilters {
  search?: string;
  institution_id?: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
  academic_year_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface StaffPlanListResponse {
  data: StaffPlan[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
