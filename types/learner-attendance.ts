/**
 * Types for Learner Attendance Module
 * Comprehensive attendance tracking and analytics for students
 */

export interface LearnerAttendanceRecord {
  id: string;
  attendance_date: string;
  period_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  course_id: string;
  course_name: string;
  course_code?: string;
  status: 'Present' | 'Absent' | 'Late' | 'Permission';
  marked_at: string;
  faculty_name?: string;
  faculty_email?: string;
  remarks?: string;
}

export interface LearnerAttendanceDay {
  date: string;
  day_name: string;
  total_periods: number;
  attended_periods: number;
  attendance_percentage: number;
  periods: LearnerAttendanceRecord[];
  is_holiday?: boolean;
  holiday_reason?: string;
}

export interface LearnerAttendanceStats {
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  permission_days: number;
  overall_percentage: number;
  total_periods: number;
  attended_periods: number;
  missed_periods: number;
  period_percentage: number;
  monthly_breakdown: MonthlyAttendance[];
  course_wise_stats: CourseAttendanceStats[];
  recent_trend: AttendanceTrend[];
  alerts: AttendanceAlert[];
}

export interface MonthlyAttendance {
  month: string;
  year: number;
  total_days: number;
  present_days: number;
  percentage: number;
  total_periods: number;
  attended_periods: number;
}

export interface CourseAttendanceStats {
  course_id: string;
  course_name: string;
  course_code?: string;
  total_periods: number;
  attended_periods: number;
  percentage: number;
  faculty_name?: string;
  recent_classes: LearnerAttendanceRecord[];
}

export interface AttendanceTrend {
  date: string;
  percentage: number;
  status: 'improving' | 'declining' | 'stable';
}

export interface AttendanceAlert {
  id: string;
  type: 'low_attendance' | 'consecutive_absence' | 'course_critical' | 'semester_warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  course_id?: string;
  course_name?: string;
  suggested_action?: string;
  created_at: string;
}

export interface LearnerAttendanceFilters {
  semester_id?: string;
  course_id?: string;
  date_range?: {
    from: string;
    to: string;
  };
  status?: 'all' | 'present' | 'absent' | 'late' | 'permission';
  period_type?: 'all' | 'theory' | 'practical' | 'tutorial';
  view_mode: 'daily' | 'weekly' | 'monthly' | 'semester';
}

export interface LearnerSemesterData {
  semester_id: string;
  semester_name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  total_days: number;
  attendance_percentage: number;
  courses: CourseAttendanceStats[];
}

export interface AttendanceCalendarData {
  date: string;
  status: 'present' | 'absent' | 'partial' | 'holiday' | 'weekend';
  percentage?: number;
  periods?: {
    present: number;
    total: number;
  };
  courses?: string[];
}

export interface LearnerAttendanceDetails {
  student_id: string;
  student_name: string;
  roll_number?: string;
  student_photo_url?: string;
  program_name: string;
  department_name: string;
  semester_name: string;
  section_name: string;
  academic_year: string;
  current_semester: LearnerSemesterData;
  all_semesters: LearnerSemesterData[];
  attendance_stats: LearnerAttendanceStats;
  attendance_calendar: AttendanceCalendarData[];
  recent_attendance: LearnerAttendanceDay[];
}

export interface AttendanceChartData {
  type: 'line' | 'bar' | 'pie' | 'doughnut' | 'area';
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string;
      borderWidth?: number;
      fill?: boolean;
    }[];
  };
  options?: {
    responsive: boolean;
    plugins?: {
      legend?: {
        display: boolean;
        position?: 'top' | 'bottom' | 'left' | 'right';
      };
      title?: {
        display: boolean;
        text: string;
      };
    };
    scales?: {
      y?: {
        beginAtZero: boolean;
        max?: number;
      };
    };
  };
}

export interface AttendanceExportOptions {
  format: 'pdf' | 'excel' | 'csv';
  period: 'current_month' | 'current_semester' | 'academic_year' | 'custom';
  date_range?: {
    from: string;
    to: string;
  };
  include_charts: boolean;
  include_course_breakdown: boolean;
  include_daily_details: boolean;
}