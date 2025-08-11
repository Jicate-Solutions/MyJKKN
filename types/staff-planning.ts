// First, let's create a base interface for staff plan course data
export interface StaffPlanCourseDto {
  course_id: string;
  staff_id: string;
  staff_type: string;
}

// Interface for staff assignments used in forms (with assignment_id for React keys)
export interface StaffAssignment {
  staff_id: string;
  staff_type: string;
  assignment_id?: string; // Optional for backwards compatibility
}

// Interface for course assignments in forms
export interface CourseAssignment {
  course_id: string;
  staff_assignments: StaffAssignment[];
}

// Create base staff plan data interface
export interface StaffPlanBaseData {
  institution_id: string;
  degree_id: string;
  program_id: string;
  department_id: string;
  semester_id: string;
  academic_year_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

// Full staff plan interface with all properties
export interface StaffPlan extends StaffPlanBaseData {
  id: string;
  created_at: string;
  updated_at: string;
  courses?: StaffPlanCourse[];
  // Count fields for display
  course_count?: number;
  total_staff?: number;
  duplicate_count?: number; // For consolidation display
  // Related data
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

// Staff plan course with full data
export interface StaffPlanCourse extends StaffPlanCourseDto {
  id: string;
  staff_plan_id: string;
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

// DTOs for creating and updating
export interface CreateStaffPlanDto extends StaffPlanBaseData {
  courses: StaffPlanCourseDto[]; // Make courses required and use the DTO interface
}

export interface UpdateStaffPlanDto extends CreateStaffPlanDto {}

// Filters and response interfaces remain the same
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
  disableConsolidation?: boolean; // Option to show individual plans instead of consolidated ones
  enableConsolidation?: boolean; // Option to enable consolidation in the original method
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
