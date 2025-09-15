export interface AttendanceReportFilters {
  institution_id?: string;
  academic_year_id?: string;
  department_id?: string;
  program_id?: string;
  degree_id?: string;
  semester_id?: string;
  section_id?: string;
  faculty_id?: string;
  course_id?: string;
  date_range?: {
    from: string;
    to: string;
  };
  attendance_status?: 'all' | 'completed' | 'pending';
  attendance_threshold?: number;
  search?: string;
}

export interface AttendanceReport {
  id: string;
  attendance_date: string;
  institution_id: string;
  institution_name?: string;
  department_id?: string;
  department_name?: string;
  program_id?: string;
  program_name?: string;
  degree_id?: string;
  degree_name?: string;
  semester_id?: string;
  semester_name?: string;
  section_id: string;
  section_name?: string;
  timetable_id: string;
  periods_count: number;
  total_students: number;
  average_attendance: number;
  faculty_details: FacultyDetail[];
  courses: CourseDetail[];
  created_at: string;
  updated_at: string;
}

export interface FacultyDetail {
  faculty_id: string;
  faculty_name: string;
  faculty_email: string;
  is_primary?: boolean;
}

export interface CourseDetail {
  course_id: string;
  course_name: string;
  course_code?: string;
}

export interface PeriodDetail {
  period_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  course_id?: string;
  course_name?: string;
  assigned_faculty?: FacultyDetail | FacultyDetail[];
  marked_by_details?: {
    marker_id: string;
    marker_name: string;
    marker_role: string;
    marker_email: string;
    marked_at: string; // ISO timestamp when the period was marked
  };
  students: StudentAttendance[];
  total_students: number;
  present_count: number;
  absent_count: number;
  attendance_percentage: number;
}

export interface StudentAttendance {
  student_id: string;
  student_name?: string;
  roll_no?: string;
  email?: string;
  status: 'Present' | 'Absent' | 'Late' | 'Permission';
  marked_at: string;
  remarks?: string;
}

export interface AttendanceStatistics {
  totalClasses: number;
  averageAttendance: number;
  totalStudents: number;
  totalFaculty: number;
  presentToday: number;
  absentToday: number;
  todayClasses: number;
  todayAttendanceRate: number;
  weeklyComparison: number;
  todayPeriods: number;
  todayTotalCapacity: number;
  attendanceTrend: TrendData[];
  departmentComparison: DepartmentData[];
  lowAttendanceAlerts: AlertData[];
}

export interface DetailedAttendanceReport {
  id: string;
  attendance_date: string;
  institution_id: string;
  institution_name: string;
  department_id: string;
  department_name: string;
  program_id: string;
  program_name: string;
  degree_id: string;
  degree_name: string;
  semester_id: string;
  semester_name: string;
  section_id: string;
  section_name: string;
  academic_year_id: string;
  academic_year_name: string;
  timetable_id: string;
  timetable_name?: string;
  marked_by_id: string;
  marked_by_name: string;
  marked_by_email: string;
  period_details: {
    period_id: string;
    period_number: number;
    period_name?: string;
    start_time: string;
    end_time: string;
    course_code: string;
    course_name: string;
    faculty: {
      faculty_id: string;
      faculty_name: string;
      faculty_email?: string;
      is_primary?: boolean;
    }[];
    marked_by_details?: {
      marker_id: string;
      marker_name: string;
      marker_role: string;
      marker_email: string;
      marked_at: string; // ISO timestamp when the period was marked
    };
    students: {
      student_id: string;
      student_name: string;
      roll_number?: string;
      avatar_url?: string;
      is_present: boolean;
    }[];
    present_count: number;
    absent_count: number;
    total_count: number;
    attendance_percentage: number;
  }[];
  consolidated_students: {
    student_id: string;
    student_name: string;
    roll_number?: string;
    avatar_url?: string;
    is_present: boolean;
    periods_attended: string[];
    attendance_percentage: number;
  }[];
  total_students: number;
  total_present: number;
  total_absent: number;
  average_attendance: number;
  created_at: string;
  updated_at: string;
}

export interface TrendData {
  date: string;
  percentage: number;
  present: number;
  total: number;
}

export interface DepartmentData {
  department_id: string;
  department_name: string;
  average_attendance: number;
  total_classes: number;
}

export interface AlertData {
  date: string;
  percentage: number;
  section?: string;
  course?: string;
  message?: string;
}

export interface ExportOptions {
  format: 'xlsx' | 'pdf' | 'csv';
  template: 'summary' | 'detailed' | 'analytics';
  includeCharts?: boolean;
  includeStatistics?: boolean;
  dateRange?: {
    from: string;
    to: string;
  };
}
