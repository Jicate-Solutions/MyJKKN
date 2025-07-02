// types/attendance.ts

// Simplified student interface for attendance purposes
export interface AttendanceStudent {
  id: string;
  student_name: string;
  roll_number?: string;
  institution_id: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
  status: string;
}

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
  student_name: string;
  roll_number?: string;
  status: 'Present' | 'Absent';
  attendance_id?: string; // If attendance record exists
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
export interface AttendancePeriodOption {
  id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  timetable_slot_id: string;
  course?: {
    id: string;
    course_name: string;
    course_code: string;
  };
  sections?: {
    id: string;
    name: string;
  }[];
}
