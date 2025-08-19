export interface FacultySlot {
  id: string;
  slot_date?: string; // For batch mode timetables
  day_of_week?: string; // For regular mode timetables
  period_id: string;
  period_name: string;
  start_time: string;
  end_time: string;

  // Course information
  course?: {
    id: string;
    course_code: string;
    course_name: string;
  };

  // Section information
  sections?: Array<{
    id: string;
    section_name: string;
  }>;

  // Timetable context information
  timetable: {
    id: string;
    timetable_name: string;
    timetable_format: 'regular' | 'batch';
    institution_name: string;
    department_name: string;
    program_name?: string;
    semester?: string;
  };

  // Break slot information
  is_break_slot: boolean;
  break_description?: string;

  // Combined class information
  is_combined?: boolean;
  sub_slots?: Array<{
    sub_slot_order: number;
    course?: {
      id: string;
      course_code: string;
      course_name: string;
    };
    sections?: Array<{
      id: string;
      section_name: string;
    }>;
    is_break_slot: boolean;
    break_description?: string;
  }>;

  // Staff members assigned to this slot
  staff_members?: Array<{ id: string; first_name: string; last_name: string }>;
}

export interface FacultyAvailability {
  staff_id: string;
  staff_name: string;
  department_name: string;
  is_available: boolean;
  conflicting_slots?: Array<{
    timetable_name: string;
    course_code: string;
    section_names: string[];
  }>;
}

export interface FacultyCalendarFilters {
  date_range: { from: Date; to: Date };
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  academic_year_id?: string;
  semester_id?: string;
  section_name?: string;
  staff_ids?: string[];
  include_break_slots: boolean;
  timetable_format?: 'all' | 'regular' | 'batch';
}

export interface InstitutionHierarchyFilters {
  institution_id: string;
  department_id?: string;
  program_id?: string;
  academic_year_id?: string;
  semester?: string | number;
}

export interface FacultyCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: FacultySlot;
  color?: string;
  textColor?: string;
  allDay?: boolean;
}

export interface FacultyWorkloadStats {
  staff_id: string;
  staff_name: string;
  total_periods: number;
  total_hours: number;
  courses_count: number;
  sections_count: number;
  break_periods: number;
  utilization_percentage: number;
}

export interface ConflictInfo {
  type: 'time_overlap' | 'double_booking' | 'unavailable_staff';
  message: string;
  conflicting_slots: FacultySlot[];
  suggested_alternatives?: Array<{
    staff_id: string;
    staff_name: string;
    available_periods: string[];
  }>;
}

// Calendar view types
export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

// Calendar component props
export interface FacultyCalendarProps {
  viewMode: 'faculty' | 'admin';
  staffId?: string; // For faculty view
  filters?: FacultyCalendarFilters; // For admin view
  onSlotClick?: (slot: FacultySlot) => void;
  onDateClick?: (date: Date) => void;
  height?: number;
  defaultView?: CalendarView;
}

// API Response types
export interface FacultyCalendarApiResponse {
  slots: FacultySlot[];
  total_count: number;
  page_info?: {
    current_page: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

export interface FacultyAvailabilityApiResponse {
  date: string;
  period_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  available_faculty: FacultyAvailability[];
  unavailable_faculty: FacultyAvailability[];
}
