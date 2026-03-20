/**
 * Student Attendance Types
 * Created: 2025-12-29
 * Description: Type definitions for student self-service attendance view
 */

/**
 * Individual attendance record for a single period
 */
export interface StudentAttendanceRecord {
  date: string;
  period_name: string;
  start_time: string;
  end_time: string;
  course_name: string;
  course_code?: string;
  status: 'Present' | 'Absent';
  marked_at: string;
}

/**
 * Overall attendance statistics for a semester
 */
export interface AttendanceStatistics {
  totalClasses: number;
  presentCount: number;
  absentCount: number;
  percentage: number;
  threshold: number;
  isAboveThreshold: boolean;
}

/**
 * Course-wise attendance breakdown
 */
export interface CourseAttendance {
  course_name: string;
  course_code?: string;
  total: number;
  present: number;
  absent: number;
  percentage: number;
}

/**
 * Trend data for attendance chart (daily percentages)
 */
export interface TrendData {
  date: string;
  percentage: number;
}

/**
 * Complete export data structure for PDF/Excel generation
 */
export interface ExportData {
  student: {
    name: string;
    roll_number: string;
    section: string;
  };
  semester: {
    name: string;
    academic_year: string;
  };
  statistics: AttendanceStatistics;
  courseWise: CourseAttendance[];
  records: StudentAttendanceRecord[];
}
