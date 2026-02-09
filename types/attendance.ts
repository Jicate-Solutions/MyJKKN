// types/attendance.ts

// Authorization types for attendance marking
export type AttendanceAuthorizationType =
  | 'super_admin'
  | 'admin'
  | 'hod_department'
  | 'assigned_faculty'
  | 'permission_based';

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

// Predefined learning behaviors for attendance engagement tracking
// Updated: 2026-02-07 - P1.5.4 Attendance Learning Engagement
export type LearningBehavior =
  | 'active_participation'
  | 'asking_questions'
  | 'peer_collaboration'
  | 'problem_solving'
  | 'critical_thinking'
  | 'hands_on_practice'
  | 'presentation'
  | 'independent_work'
  | 'mentoring_peers'
  | 'creative_application';

export const LEARNING_BEHAVIOR_LABELS: Record<LearningBehavior, string> = {
  active_participation: 'Active Participation',
  asking_questions: 'Asking Questions',
  peer_collaboration: 'Peer Collaboration',
  problem_solving: 'Problem Solving',
  critical_thinking: 'Critical Thinking',
  hands_on_practice: 'Hands-on Practice',
  presentation: 'Presentation',
  independent_work: 'Independent Work',
  mentoring_peers: 'Mentoring Peers',
  creative_application: 'Creative Application',
};

// New consolidated attendance types for JSONB structure
// Updated: 2026-02-07 - P1.5.4 Added engagement_score, learning_behaviors, notes
export interface ConsolidatedAttendanceStudent {
  student_id: string;
  section_id: string; // Stores section at time of marking - preserves history
  status: 'Present' | 'Absent' | 'OnDuty'; // Updated: 2026-01-28 - Added OnDuty for leave/onduty integration
  marked_at: string;
  // P1.5.4 - Learning Engagement fields
  engagement_score?: number; // 1-5 scale. Required for practical/lab, optional for lectures
  learning_behaviors?: LearningBehavior[]; // Selected from predefined list
  engagement_notes?: string; // Free-text notes on student engagement
}

export interface ConsolidatedAttendancePeriod {
  period_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  course_id: string;
  course_name: string;
  students: ConsolidatedAttendanceStudent[];
  // P1.5.4 - Period-level engagement metadata
  engagement_required?: boolean; // true for practical/lab periods
  average_engagement_score?: number; // Auto-computed average of student scores
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
    authorization_type?: AttendanceAuthorizationType; // How the marker was authorized
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
  status: 'Present' | 'Absent' | 'OnDuty'; // Updated: 2026-01-28 - Added OnDuty for leave/onduty integration
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
  status: 'Present' | 'Absent' | 'OnDuty'; // Updated: 2026-01-28 - Added OnDuty for leave/onduty integration
  marked_by: string;
  institution_id: string;
}

export interface UpdateStudentAttendanceDto {
  status: 'Present' | 'Absent' | 'OnDuty'; // Updated: 2026-01-28 - Added OnDuty for leave/onduty integration
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
  status?: 'Present' | 'Absent' | 'OnDuty'; // Updated: 2026-01-28 - Added OnDuty for leave/onduty integration
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
  status: 'Present' | 'Absent' | 'OnDuty'; // Updated: 2026-01-28 - Added OnDuty for leave/onduty integration
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

  // Updated: 2025-12-17 - Added for leave-attendance integration
  institution_id?: string;
  department_id?: string;
  semester_id?: string;
}

// =====================================================
// ATTENDANCE CONSOLIDATION REPORT TYPES
// =====================================================
// Created: 2026-01-23
// Purpose: Types for institution-wide attendance consolidation reports

export type ReportStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ReportFormat = 'pdf' | 'excel' | 'csv';
export type GroupByType = 'program' | 'semester' | 'section' | 'student';

// Report Parameters
export interface ConsolidationReportParams {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  programs?: string[]; // Program IDs to include
  semesters?: string[]; // Semester IDs to include
  sections?: string[]; // Section IDs to include
  students?: string[]; // Student IDs to include (for specific student reports)
  groupBy: GroupByType; // How to group the data
  includeAbsentDetails?: boolean; // Include detailed absent records
  includePeriodBreakdown?: boolean; // Include period-wise breakdown
  [key: string]: any; // Allow arbitrary keys for JSON compatibility
}

// Student Attendance Summary
export interface StudentAttendanceSummary {
  studentId: string;
  studentName: string;
  rollNumber?: string;
  // Section info
  sectionId?: string;
  sectionName?: string;
  // Hierarchy info for detailed reports
  degreeName?: string;
  degreeCode?: string;
  departmentName?: string;
  departmentCode?: string;
  programName?: string;
  programCode?: string;
  semesterName?: string;
  semesterNumber?: number;
  // Attendance stats
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  attendancePercentage: number;
  absentDates?: string[]; // List of dates when absent (if includeAbsentDetails = true)
  periodBreakdown?: {
    // Period-wise attendance (if includePeriodBreakdown = true)
    periodId: string;
    periodName: string;
    present: number;
    absent: number;
    percentage: number;
  }[];
}

// Group Summary
export interface GroupAttendanceSummary {
  groupName: string; // Program name, Semester name, Section name, etc.
  groupId: string;
  groupType: GroupByType;
  totalStudents: number;
  totalWorkingDays: number;
  averageAttendance: number;
  totalPresent: number;
  totalAbsent: number;
  students: StudentAttendanceSummary[]; // Student-level details
}

// Overall Report Summary
export interface ReportSummary {
  totalStudents: number;
  totalWorkingDays: number;
  averageAttendance: number;
  totalPresent: number;
  totalAbsent: number;
  dateRange: {
    from: string;
    to: string;
  };
}

// Complete Report Data
export interface ConsolidationReportData {
  summary: ReportSummary;
  groups: GroupAttendanceSummary[];
}

// Main Consolidation Report Model
export interface AttendanceConsolidationReport {
  id: string;
  reportName: string;
  reportDescription?: string;
  institutionId: string;
  generatedBy: string;
  reportParams: ConsolidationReportParams;
  reportData?: ConsolidationReportData;
  status: ReportStatus;
  format: ReportFormat;
  fileUrl?: string;
  fileSize?: number;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;

  // Relations (populated on demand)
  institution?: {
    id: string;
    name: string;
  };
  generatedByProfile?: {
    id: string;
    email: string;
    fullName?: string;
  };
}

// DTOs for creating reports
export interface CreateConsolidationReportDto {
  reportName: string;
  reportDescription?: string;
  institutionId: string;
  reportParams: ConsolidationReportParams;
  format?: ReportFormat; // Defaults to 'pdf'
}

// DTOs for updating reports
export interface UpdateConsolidationReportDto {
  reportName?: string;
  reportDescription?: string;
  status?: ReportStatus;
  reportData?: ConsolidationReportData;
  fileUrl?: string;
  fileSize?: number;
  errorMessage?: string;
  completedAt?: string;
}

// Filters for listing reports
export interface ConsolidationReportFilters {
  institutionId?: string;
  generatedBy?: string;
  status?: ReportStatus;
  dateFrom?: string; // Filter by created_at
  dateTo?: string;
  page?: number;
  limit?: number;
}

// List Response
export interface ConsolidationReportListResponse {
  data: AttendanceConsolidationReport[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =====================================================
// ONDUTY STATUS SUPPORT
// =====================================================
// Created: 2026-01-28
// Purpose: Helper types and utilities for OnDuty attendance status

/**
 * Attendance status type with OnDuty support
 */
export type AttendanceStatus = 'Present' | 'Absent' | 'OnDuty';

/**
 * Attendance statistics with OnDuty breakdown
 */
export interface AttendanceStatistics {
  total_periods: number;
  present: number;
  absent: number;
  onduty: number;
  total_present_including_onduty: number; // Present + OnDuty (counts as present)
  attendance_percentage: number; // (Present + OnDuty) / Total * 100
}

/**
 * Helper function to calculate attendance statistics
 * OnDuty is counted as Present for percentage calculations
 */
export function calculateAttendanceStatistics(
  attendance: ConsolidatedAttendanceStudent[]
): AttendanceStatistics {
  const stats = {
    total_periods: attendance.length,
    present: attendance.filter((a) => a.status === 'Present').length,
    absent: attendance.filter((a) => a.status === 'Absent').length,
    onduty: attendance.filter((a) => a.status === 'OnDuty').length,
    total_present_including_onduty: 0,
    attendance_percentage: 0,
  };

  stats.total_present_including_onduty = stats.present + stats.onduty;

  if (stats.total_periods > 0) {
    stats.attendance_percentage =
      stats.total_periods > 0 ? (stats.total_present_including_onduty / stats.total_periods) * 100 : 0;
  }

  return stats;
}

/**
 * Helper to determine if a status counts as present
 */
export function countsAsPresent(status: AttendanceStatus): boolean {
  return status === 'Present' || status === 'OnDuty';
}
