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
  timetable_type: 'section' | 'semester';
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
  // Updated: 2025-10-09 - Added available_sections for semester-level timetables
  available_sections?: Array<{
    id: string;
    section_name: string;
  }>;
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
  timetable_type: 'section' | 'semester';
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
  timetable_type?: 'section' | 'semester'; // Filter by timetable type
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
  timetable_type: 'section' | 'semester';
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

// =====================================================
// SECTION SUBDIVISION TYPES (Practical Classes Feature)
// Updated: 2025-10-11
// =====================================================

/**
 * Type of subdivision - determines how students are split
 */
export type SubdivisionType = 'practical' | 'lab' | 'tutorial' | 'workshop';

/**
 * Mode of student assignment to groups
 */
export type SubdivisionMode = 'manual' | 'auto';

/**
 * Sub-slot interface for both Combined Classes and Section Subdivision
 *
 * Combined Classes: Splits TIME (different courses in same period)
 * Section Subdivision: Splits STUDENTS (same course, different groups)
 */
export interface SubSlot {
  sub_slot_order: number;

  // Common fields (for both combined and subdivided)
  course_id: string;
  staff_ids: string[];
  section_ids: string[];
  is_break_slot: boolean;
  break_description?: string;

  // NEW: Section Subdivision fields
  group_name?: string;           // e.g., "Group A - Lab 1"
  student_ids?: string[];         // Array of specific student UUIDs assigned to this group
  lab_room?: string;              // Optional room/location for this group
  max_capacity?: number;          // Optional maximum capacity for this group

  // Populated relations (from database)
  staff_members?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    staff_id: string;
  }>;
  sections?: Array<{
    id: string;
    section_name: string;
  }>;
  course?: {
    id: string;
    course_name: string;
    course_code: string;
  };
}

/**
 * Enhanced TimetableSlot interface with subdivision support
 */
export interface TimetableSlot {
  slot_id: string;
  course_id: string;
  slot_date: string | DayOfWeek;  // Day of week for regular, date for batch
  staff_ids: string[];
  section_ids: string[];
  is_break_slot: boolean;
  break_description?: string;

  // Combined classes fields
  is_combined: boolean;
  sub_slots: SubSlot[];

  // NEW: Section subdivision fields
  is_subdivided?: boolean;                // Indicates this slot uses section subdivision
  subdivision_type?: SubdivisionType;     // Type of subdivision (practical/lab/etc)
  subdivision_mode?: SubdivisionMode;     // How students were assigned (manual/auto)

  // Metadata
  created_at: string;
  updated_at: string;
  primary_staff_id?: string;

  // Populated relations
  course?: {
    id: string;
    course_name: string;
    course_code: string;
  };
  staff_members?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    staff_id: string;
  }>;
  sections?: Array<{
    id: string;
    section_name: string;
  }>;

  // For grid display
  period_id?: string;
  day_of_week?: DayOfWeek;
}

/**
 * Subdivision group configuration (for UI state management)
 */
export interface SubdivisionGroup {
  group_order: number;
  group_name: string;
  course_id: string;
  staff_ids: string[];
  student_ids: string[];
  lab_room?: string;
  max_capacity?: number;
}

/**
 * Subdivision configuration props (for components)
 */
export interface SubdivisionConfig {
  section_id: string;
  course_id: string;
  group_count: number;
  groups: SubdivisionGroup[];
  subdivision_type: SubdivisionType;
  subdivision_mode: SubdivisionMode;
}

/**
 * Validation result for subdivision
 */
export interface SubdivisionValidationResult {
  isValid: boolean;
  duplicates: string[];         // Students assigned to multiple groups
  missing: string[];            // Students not assigned to any group
  message: string;
  warnings?: string[];          // Non-critical issues (e.g., uneven distribution)
}

// =====================================================
// DUAL-MODE PERIOD SYSTEM (Pharmacy Timetable Feature)
// Updated: 2025-10-25
// =====================================================

/**
 * Period mode type - determines whether period has fixed or runtime assignment
 */
export type PeriodMode = 'standard' | 'practical';

/**
 * Batch definition - defines an available batch for practical periods
 * Note: Batches are NOT pre-assigned to labs (they rotate)
 */
export interface BatchDefinition {
  batch_id: string;
  batch_name: string;              // e.g., "Batch A", "Group 1"
  assignment_type: 'section' | 'manual';  // How students are assigned to batch
  section_ids?: string[];          // Sections that form this batch (if assignment_type = 'section')
  estimated_count: number;         // Estimated number of students
}

/**
 * Course option - defines an available course for practical periods
 */
export interface CourseOption {
  course_id: string;
  course_name: string;
  course_code?: string;
}

/**
 * Practical configuration - defines AVAILABLE options for runtime selection
 * Faculty selects batch/course combination when marking attendance
 */
export interface PracticalConfig {
  batches: BatchDefinition[];          // Available batches
  available_courses: CourseOption[];   // Available courses for selection
  rotation_type: 'manual' | 'automatic';  // How rotation is managed
  staff_mapping?: Record<string, string[]>;  // Optional: map course to staff IDs
}

/**
 * Standard period configuration (FIXED assignment in timetable)
 * Used for theory classes, tutorials - same students/staff every time
 */
export interface StandardPeriodConfig {
  period_mode: 'standard';
  course_id: string;
  staff_ids: string[];
  section_ids: string[];
  room?: string;
}

/**
 * Practical period configuration (RUNTIME selection in attendance)
 * Used for rotating practical labs - different batch/lab combinations each time
 */
export interface PracticalPeriodConfig {
  period_mode: 'practical';
  practical_config: PracticalConfig;
}

/**
 * Period configuration type - union of standard and practical modes
 */
export type PeriodConfig = StandardPeriodConfig | PracticalPeriodConfig;

/**
 * Runtime batch/course selection (made during attendance marking)
 * Stored in attendance_data to track which combinations were used
 */
export interface PracticalAttendanceSelection {
  batch_id: string;
  batch_name: string;
  course_id: string;
  section_ids: string[];  // Sections from the selected batch
}

/**
 * Attendance data structure for practical periods
 * Extends standard attendance with runtime selections
 */
export interface PracticalAttendanceData {
  period_mode: 'practical';
  batch_selected: {
    batch_id: string;
    batch_name: string;
  };
  course_selected: string;    // Course ID selected at runtime
  students: Array<{
    id: string;
    status: 'Present' | 'Absent';
    marked_at?: string;
  }>;
  marked_by: string;
  marked_at: string;
}

/**
 * Standard attendance data structure
 */
export interface StandardAttendanceData {
  period_mode: 'standard';
  course_id: string;
  students: Array<{
    id: string;
    status: 'Present' | 'Absent';
    marked_at?: string;
  }>;
}

/**
 * Conflict check result for practical periods
 * Prevents same batch from being marked twice for same period/date
 */
export interface PracticalConflictCheck {
  hasConflict: boolean;
  message?: string;
  existingRecord?: {
    time: string;
    course: string;
  };
}
