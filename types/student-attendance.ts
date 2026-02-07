/**
 * Student Attendance Types
 * Created: 2025-12-29
 * Updated: 2026-02-07 - P1.5.4 Added engagement types
 * Description: Type definitions for student self-service attendance view
 */

// Re-export engagement types from attendance module for convenience
export type { LearningBehavior } from './attendance';
export { LEARNING_BEHAVIOR_LABELS } from './attendance';

/**
 * P1.5.4 - Engagement score for a student during a period
 * Used in both attendance marking and reporting views
 */
export interface EngagementScore {
  /** Engagement rating on a 1-5 scale. Required for practical/lab, optional for lectures */
  score: number;
  /** Selected learning behaviors observed during the period */
  behaviors: string[];
  /** Optional free-text notes about the student's engagement */
  notes?: string;
}

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
  // P1.5.4 - Engagement data (present when engagement was recorded)
  engagement_score?: number;
  learning_behaviors?: string[];
  engagement_notes?: string;
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
