// types/organizations.ts

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
export type TimetableType = 'day_order' | 'week_order';

export interface Institution {
  id: string;
  name: string;
  counselling_code: string;
  institution_type: InstitutionType;
  category: InstitutionCategory;
  timetable_type: TimetableType;
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
  userId?: string; // For applying user-based institution filtering
  bypassInstitutionFilter?: boolean; // To bypass institution filtering when needed
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

// types/degrees.ts

export type DegreeType = 'ug' | 'pg';

export interface Degree {
  id: string;
  institution_id: string;
  degree_id: string;
  degree_name: string;
  degree_type: DegreeType;
  display_name?: string; // Optional alternative display name
  degree_order: number; // Sort order for displaying degrees
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
}

export interface CreateDegreeDto {
  institution_id: string;
  degree_id: string;
  degree_name: string;
  degree_type: DegreeType;
  display_name?: string;
  degree_order?: number;
  is_active?: boolean;
}

export interface UpdateDegreeDto extends Partial<CreateDegreeDto> {}

export interface DegreeFilters {
  search?: string;
  institution_id?: string;
  degree_type?: DegreeType;
  status?: 'active' | 'inactive'; // String-based status filter
  isActive?: boolean; // Legacy boolean filter
  page?: number;
  limit?: number;
  userId?: string; // For applying user-based institution filtering
  bypassInstitutionFilter?: boolean; // To bypass institution filtering when needed
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DegreeListResponse {
  data: Degree[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// types/organizations.ts
// Add these along with existing Institution and Degree types

export interface Department {
  id: string;
  institution_id: string;
  degree_id: string;
  department_code: string;
  department_name: string;
  display_name?: string; // Optional alternative display name
  department_order: number; // Sort order for displaying departments
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  degree?: {
    id: string;
    degree_id: string;
    degree_name: string;
  };
}

export interface CreateDepartmentDto {
  institution_id: string;
  degree_id: string;
  department_code: string;
  department_name: string;
  display_name?: string;
  department_order?: number;
  is_active?: boolean;
}

export interface UpdateDepartmentDto extends Partial<CreateDepartmentDto> {}

export interface DepartmentFilters {
  search?: string;
  institution_id?: string;
  degree_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  userId?: string; // For applying user-based institution filtering
  bypassInstitutionFilter?: boolean; // To bypass institution filtering when needed
}

export interface DepartmentListResponse {
  data: Department[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Add these interfaces alongside existing ones

export type ProgramType = 'UG' | 'PG' | 'Ph.D';
export type PatternType = 'Year' | 'Semester';

export interface Program {
  id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  program_name: string;
  // New fields (all optional/nullable)
  program_type?: ProgramType | null;
  display_name?: string | null;
  program_order?: number | null;
  program_duration_yrs?: number | null;
  pattern_type?: PatternType | null;
  is_part_time?: boolean | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  degree?: {
    id: string;
    degree_id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_code: string;
    department_name: string;
  };
}

export interface CreateProgramDto {
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  program_name: string;
  // New optional fields
  program_type?: ProgramType;
  display_name?: string;
  program_order?: number;
  program_duration_yrs?: number;
  pattern_type?: PatternType;
  is_part_time?: boolean;
  is_active?: boolean;
}

export interface UpdateProgramDto extends Partial<CreateProgramDto> {}

export interface ProgramFilters {
  search?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  userId?: string; // For applying user-based institution filtering
  bypassInstitutionFilter?: boolean; // To bypass institution filtering when needed
}

export interface ProgramListResponse {
  data: Program[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Competency coverage mapping for courses
 * Links a course to competencies it develops
 */
export interface CourseCompetencyCoverage {
  competency_id: string;
  target_level: 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
  weight: number; // 0-1, relative importance of this competency in the course
}

export interface Course {
  id: string;
  institution_id: string;
  course_code: string;
  course_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Learning hours breakdown (added for Workshop Transformation)
  learning_hours_target?: number;
  self_study_hours?: number;
  practical_hours?: number;
  theory_hours?: number;

  // Competency coverage (added for Workshop Transformation)
  competency_coverage?: CourseCompetencyCoverage[];

  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code?: string;
  };
}

export interface CreateCourseDto {
  institution_id: string;
  course_code: string;
  course_name: string;
  is_active?: boolean;
  // Learning hours breakdown
  learning_hours_target?: number;
  self_study_hours?: number;
  practical_hours?: number;
  theory_hours?: number;
  // Competency coverage
  competency_coverage?: CourseCompetencyCoverage[];
}

export interface UpdateCourseDto extends Partial<CreateCourseDto> {}

export interface CourseFilters {
  search?: string;
  institution_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  userId?: string; // For applying user-based institution filtering
  bypassInstitutionFilter?: boolean; // To bypass institution filtering when needed
}

export interface CourseListResponse {
  data: Course[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface Semester {
  id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_code: string;
  semester_name: string;
  semester_type: 'even' | 'odd';
  // New fields (all optional/nullable)
  semester_order?: number | null;
  initial_semester?: boolean | null;
  terminal_semester?: boolean | null;
  semester_group?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
}

export interface CreateSemesterDto {
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_code: string;
  semester_name: string;
  semester_type: 'even' | 'odd';
  // New optional fields
  semester_order?: number;
  initial_semester?: boolean;
  terminal_semester?: boolean;
  semester_group?: string;
  is_active?: boolean;
}

export interface UpdateSemesterDto extends Partial<CreateSemesterDto> {}

export interface SemesterFilters {
  search?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_type?: 'even' | 'odd';
  isActive?: boolean;
  page?: number;
  limit?: number;
  userId?: string; // For applying user-based institution filtering
  bypassInstitutionFilter?: boolean; // To bypass institution filtering when needed
}

export interface SemesterListResponse {
  data: Semester[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface Section {
  id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  section_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  semester?: {
    id: string;
    semester_name: string;
    semester_code: string;
  };
}

export interface CreateSectionDto {
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  section_name: string;
  is_active?: boolean;
}

export interface UpdateSectionDto extends Partial<CreateSectionDto> {}

export interface SectionFilters {
  search?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  userId?: string; // For applying user-based institution filtering
  bypassInstitutionFilter?: boolean; // To bypass institution filtering when needed
}

export interface SectionListResponse {
  data: Section[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Course mapping types
export interface CourseMapping {
  id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  course_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Include related data
  institution?: {
    id: string;
    name: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  semester?: {
    id: string;
    semester_name: string;
  };
  course?: {
    id: string;
    course_name: string;
    course_code: string;
  };
}

export interface CreateCourseMappingDto {
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  course_ids: string[];
  is_active?: boolean;
}

export interface UpdateCourseMappingDto
  extends Partial<Omit<CreateCourseMappingDto, 'course_ids'>> {
  course_id?: string;
}

export interface CourseMappingFilters {
  search?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  course_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  userId?: string; // For applying user-based institution and department filtering
  bypassInstitutionFilter?: boolean; // To bypass institution filtering when needed
  bypassDepartmentFilter?: boolean; // To bypass department filtering when needed
}

export interface CourseMappingListResponse {
  data: CourseMapping[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface OrganizationStats {
  institutionCount: number;
  degreeCount: number;
  departmentCount: number;
  programCount: number;
  courseCount: number;
  semesterCount: number;
  sectionCount: number;
  courseMappingCount: number;
  programsByDegree: { name: string; count: number }[];
  coursesByDepartment: { name: string; count: number }[];
  recentAdditions: Array<{
    id: string;
    name: string;
    created_at: string;
    type: string;
  }>;
}
