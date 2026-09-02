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
  course_id: string;       // slot.course_id — retained for metadata aggregation
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
    overdueCount: number;     // periods where attendance_date < today
    todayCount: number;       // periods where attendance_date === today
    sectionsCount: number;    // unique sections with pending periods
    subjectsCount: number;    // unique courses with pending periods
    staffCount: number;       // unique staff with pending periods
  };
}

/**
 * Attendance dashboard statistics.
 *
 * `total_students` counts every learner whose lifecycle_status is active,
 * reserved or admitted — it is NOT gated on fee payment (Director decision
 * 2026-08-11).
 *
 * `total_marked` is the number of those learners who actually have a status
 * recorded for the date, and it is the denominator of every percentage on this
 * screen. `total_unmarked` is the rest, and it MUST be rendered wherever a
 * percentage is: a college that marked 1 learner of 93 would otherwise read as
 * "100% attendance" instead of "1 of 1 marked, 92 not yet marked".
 */
export interface AttendanceStats {
  institution_id: string;
  institution_name: string;
  total_students: number;
  total_present: number;
  total_absent: number;
  total_marked: number;
  total_unmarked: number;
  attendance_percentage: number;
  /**
   * True when this college holds learners in the current scope but none once
   * the view's narrowing (e.g. "first-year learners only") is applied. The
   * college is still listed, as an explicit zero with a reason, rather than
   * silently dropped.
   */
  is_empty_view: boolean;
  departments: {
    department_id: string;
    department_name: string;
    total_students: number;
    total_present: number;
    total_absent: number;
    total_marked: number;
    total_unmarked: number;
    attendance_percentage: number;
    semesters: {
      semester_id: string;
      semester_name: string;
      total_students: number;
      total_present: number;
      total_absent: number;
      total_marked: number;
      total_unmarked: number;
      attendance_percentage: number;
      sections: {
        section_id: string;
        section_name: string;
        total_students: number;
        present: number;
        absent: number;
        marked: number;
        unmarked: number;
        percentage: number;
        /**
         * True for learners who have no section yet. They are grouped under
         * their college as "Not yet placed" and cannot be marked until a
         * section exists — the label says so rather than reading as an
         * unexplained "Unknown Section".
         */
        is_unplaced: boolean;
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

  /**
   * Which DATES get scanned. A timetable is included on a given date whenever
   * that date falls inside its own start_date/end_date — overlap, not
   * containment. A semester timetable running to October counts for an August
   * window; it does not have to end inside it.
   */
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
  timetableId?: string;    // server-side timetable filter for pending page
}

export interface AttendanceTrendData {
  date: string;
  percentage: number;
}

/**
 * Current-intake attendance readiness.
 *
 * 'blocked'     — the section holds current-intake learners but has NO timetable,
 *                 so attendance cannot be marked at all. This is the case the
 *                 Pending Attendance surface structurally cannot show: pending
 *                 rows are derived from scheduled periods, and a section with no
 *                 timetable produces no periods, so it reads as healthy.
 * 'not_started' — a timetable exists but nothing has been marked in the window.
 * 'ok'          — marked within the window.
 */
export type IntakeReadinessStatus = 'blocked' | 'not_started' | 'ok';

/** One section holding current-intake learners, as returned by
 *  fn_attendance_fresher_readiness. Field names mirror the RPC columns. */
export interface IntakeReadinessRow {
  institution_id: string;
  institution_name: string;
  department_id: string | null;
  department_name: string;
  semester_id: string | null;
  semester_name: string;
  section_id: string;
  section_name: string;
  learner_count: number;
  timetable_count: number;
  active_timetable_count: number;
  last_marked_date: string | null;
  readiness_status: IntakeReadinessStatus;
}

/** Per-institution rollup of IntakeReadinessRow, computed in the client. */
export interface IntakeReadinessInstitutionSummary {
  institution_id: string;
  institution_name: string;
  sections: number;
  ok: number;
  notStarted: number;
  blocked: number;
  learners: number;
  learnersBlocked: number;
}
