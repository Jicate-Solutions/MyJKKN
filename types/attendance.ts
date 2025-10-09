// types/attendance.ts

// Simplified student interface for attendance purposes
export interface AttendanceStudent {
  id: string;
  student_name: string;
  roll_number?: string;
  student_photo_url?: string;
  institution_id: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
  status: string;
}

// New consolidated attendance types for JSONB structure
// Updated: 2025-10-08 - Added section_id for historical accuracy
export interface ConsolidatedAttendanceStudent {
  student_id: string;
  section_id: string; // Stores section at time of marking - preserves history
  status: 'Present' | 'Absent';
  marked_at: string;
}

export interface ConsolidatedAttendancePeriod {
  period_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  course_id: string;
  course_name: string;
  students: ConsolidatedAttendanceStudent[];
  // Faculty information - can be single or multiple
  assigned_faculty?: {
    faculty_id: string;
    faculty_name: string;
    faculty_email: string;
  } | Array<{
    faculty_id: string;
    faculty_name: string;
    faculty_email: string;
    is_primary?: boolean;
  }>;
  // Marker information
  marked_by_details?: {
    marker_id: string;
    marker_name: string;
    marker_role: string;
    marker_email: string;
    marked_at: string; // ISO timestamp when the period was marked
  };
}

export interface ConsolidatedAttendanceData {
  [timetable_slot_id: string]: ConsolidatedAttendancePeriod;
}

// Legacy individual student attendance record (kept for backward compatibility)
export interface StudentAttendance {
  id: string;
  student_id: string;
  timetable_slot_id: string;
  attendance_date: string; // YYYY-MM-DD format
  status: 'Present' | 'Absent';
  marked_by: string;
  institution_id: string;
  created_at: string;
  updated_at: string;

  // Relations
  student?: {
    id: string;
    student_name: string;
    roll_number?: string;
  };
  timetable_slot?: {
    id: string;
    day_of_week: string;
    period?: {
      id: string;
      period_name: string;
      start_time: string;
      end_time: string;
    };
    course?: {
      id: string;
      course_name: string;
      course_code: string;
    };
  };
  marked_by_user?: {
    id: string;
    email: string;
    full_name?: string;
  };
  institution?: {
    id: string;
    name: string;
  };
}

// New consolidated attendance record structure
export interface ConsolidatedStudentAttendance {
  id: string;
  timetable_id: string;
  section_id: string;
  attendance_date: string; // YYYY-MM-DD format
  attendance_data: ConsolidatedAttendanceData;
  marked_by: string;
  institution_id: string;
  created_at: string;
  updated_at: string;

  // Relations
  timetable?: {
    id: string;
    timetable_name: string;
    semester: string;
    section?: string;
  };
  section?: {
    id: string;
    section_name: string;
  };
  marked_by_profile?: {
    id: string;
    email: string;
    full_name?: string;
  };
  institution?: {
    id: string;
    name: string;
  };
}

export interface CreateStudentAttendanceDto {
  student_id: string;
  timetable_slot_id: string;
  attendance_date: string;
  status: 'Present' | 'Absent';
  marked_by: string;
  institution_id: string;
}

export interface UpdateStudentAttendanceDto {
  status: 'Present' | 'Absent';
  marked_by: string;
}

export interface BatchUpdateAttendanceDto {
  records: CreateStudentAttendanceDto[];
}

// New DTOs for consolidated attendance
export interface CreateConsolidatedAttendanceDto {
  timetable_id: string;
  section_id: string;
  attendance_date: string;
  attendance_data: ConsolidatedAttendanceData;
  marked_by: string;
  institution_id: string;
}

export interface UpdateConsolidatedAttendanceDto {
  attendance_data: ConsolidatedAttendanceData;
  marked_by: string;
}

export interface UpsertConsolidatedAttendanceDto {
  timetable_id: string;
  section_id: string;
  attendance_date: string;
  attendance_data: ConsolidatedAttendanceData;
  marked_by: string;
  institution_id: string;
  // Updated: 2025-10-09 - Added section_ids array for multi-section support
  section_ids?: string[]; // Array of all section IDs for multi-section timetables
  // Academic hierarchy fields
  academic_year_id?: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
}

export interface AttendanceFilters {
  institution_id?: string;
  academic_year_id?: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
  attendance_date?: string;
  timetable_slot_id?: string;
  status?: 'Present' | 'Absent';
  page?: number;
  limit?: number;
}

export interface AttendanceListResponse {
  data: StudentAttendance[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// For the attendance roster view
export interface AttendanceRosterStudent {
  id: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  student_photo_url?: string;
  status: 'Present' | 'Absent';
  attendance_id?: string; // If attendance record exists
  section?: {
    id: string;
    section_name: string;
  };
}

export interface AttendanceRosterData {
  students: AttendanceRosterStudent[];
  timetable_slot: {
    id: string;
    day_of_week: string;
    period: {
      id: string;
      period_name: string;
      start_time: string;
      end_time: string;
    };
    course?: {
      id: string;
      course_name: string;
      course_code: string;
    };
  };
  attendance_date: string;
}

// For the search context
export interface AttendanceSearchContext {
  institution_id: string | null;
  academic_year_id: string | null;
  degree_id: string | null;
  program_id: string | null;
  department_id: string | null;
  semester_id: string | null;
  section_id: string | null;
  attendance_date: string | null;
}

// For period selection in attendance roster
export interface StaffMember {
  id: string;
  first_name?: string;
  last_name?: string;
}

export interface AttendancePeriodOption {
  id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  timetable_slot_id: string;
  timetable_id: string; // Add timetable_id
  period_type?: string;
  course?: {
    id: string;
    course_name: string;
    course_code: string;
  };
  sections?: {
    id: string;
    name?: string; // For compatibility with semester-level timetables (may use 'name')
    section_name?: string; // For section-level timetables (actual database field)
  }[];
  section_ids?: string[]; // Add section_ids array from timetable data
  staff?: StaffMember; // Legacy single staff member
  staff_members?: StaffMember[]; // Array of assigned staff members

  // Additional display fields (optional)
  degree_name?: string;
  program_name?: string;
  department_name?: string;
  semester_name?: string;
  section_name?: string;
}
