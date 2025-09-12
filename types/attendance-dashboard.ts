/**
 * Types for Attendance Dashboard functionality
 */

export interface PendingAttendancePeriod {
  // Date and period info
  attendance_date: string;
  period_name: string;
  period_id: string;
  start_time: string;
  end_time: string;

  // Course info
  course_name: string;
  course_code?: string;

  // Institution hierarchy
  institution_id: string;
  institution_name: string;
  degree_id: string;
  degree_name: string;
  department_id: string;
  department_name: string;
  program_id: string;
  program_name: string;
  semester_id: string;
  semester_name: string;
  section_id: string;
  section_name: string;

  // Academic year
  academic_year_id: string;
  academic_year_name: string;

  // Staff details
  assigned_staff: {
    staff_id: string;
    staff_name: string;
    staff_email?: string;
    is_primary?: boolean;
  }[];
  primary_staff_name: string;

  // Timetable reference
  timetable_id: string;
  timetable_name?: string;
}

export interface PendingAttendanceResponse {
  data: PendingAttendancePeriod[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AttendanceStats {
  institution_id: string;
  institution_name: string;
  total_students: number;
  total_present: number;
  total_absent: number;
  attendance_percentage: number;
  departments: {
    department_id: string;
    department_name: string;
    total_students: number;
    total_present: number;
    total_absent: number;
    attendance_percentage: number;
    semesters: {
      semester_id: string;
      semester_name: string;
      total_students: number;
      total_present: number;
      total_absent: number;
      attendance_percentage: number;
      sections: {
        section_id: string;
        section_name: string;
        total_students: number;
        present: number;
        absent: number;
        percentage: number;
      }[];
    }[];
  }[];
}

export interface DashboardFilters {
  // User context
  userInstitutionId?: string;

  // Pagination
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';

  // Search
  search?: string;

  // Date filtering
  startDate?: string;
  endDate?: string;

  // Hierarchical filtering
  institutionId?: string;
  academicYearId?: string;
  degreeId?: string;
  departmentId?: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;

  // Staff filtering
  staffId?: string;
}

export interface AttendanceTrendData {
  date: string;
  percentage: number;
}
