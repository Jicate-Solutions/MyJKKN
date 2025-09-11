/**
 * Types for Attendance Dashboard functionality
 */

export interface PendingAttendancePeriod {
  institution_name: string;
  department_name: string;
  semester_name: string;
  section_name: string;
  period_name: string;
  course_name: string;
  faculty_name: string;
  timetable_id: string;
  section_id: string;
  period_id: string;
  start_time: string;
  end_time: string;
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
  userInstitutionId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  departmentId?: string;
  semesterId?: string;
  sectionId?: string;
}

export interface AttendanceTrendData {
  date: string;
  percentage: number;
}
