// Types for the Internal Marks (CIA - Continuous Internal Assessment) module
// Bridges MyJKKN ↔ COE API for exam sessions, CIA settings, marks entry, and reporting
//
// Reconstructed from usage across:
//   - lib/services/internal-marks/*
//   - hooks/internal-marks/*
//   - app/api/internal-marks/*
//   - app/(routes)/academic/internal-marks/*
//   - lib/utils/internal-marks/internal-marks-pdf.ts

// ============================================================================
// Exam Sessions & CIA Settings
// ============================================================================

/**
 * An exam session from the COE system.
 * Examples: "Odd Semester 2025-26", "Even Semester 2025-26"
 */
export interface ExamSession {
  id: string;
  session_name: string;
  academic_year?: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  institutions_id?: string;
}

/**
 * A single CIA component inside a round (e.g., Test 1, Assignment 1, Quiz).
 * The `code` is used as a key in marks records (e.g., "test_1", "assign_1").
 */
export interface CiaComponent {
  code: string;
  name: string;
  max_marks: number;
  component_type?: string;
  weightage?: number;
}

/**
 * A CIA round (e.g., CIA 1, CIA 2, CIA 3) with its entry window and components.
 * Multiple rounds form a CIA setting.
 *
 * Date fields (priority order on read):
 *   entry_from / entry_to                 — canonical COE field names (per /api/v1/cia-settings)
 *   entry_open_from / entry_close_on      — older field names, kept as fallback
 *   start_date / end_date                 — legacy assessment-window fields
 *   attendance_period_from / attendance_period_to — date range used to compute
 *     total periods and per-student attended count for this round (NEW 2026-04-30)
 */
export interface CiaRound {
  round: number;
  round_name: string;
  entry_from?: string | null;
  entry_to?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  entry_open_from?: string | null;
  entry_close_on?: string | null;
  attendance_period_from?: string | null;
  attendance_period_to?: string | null;
  components: CiaComponent[];
}

/**
 * A CIA setting — a template defining rounds + components for an assessment.
 * One exam session can have multiple settings (e.g., "Theory Assessment",
 * "Practical Assessment").
 */
export interface CiaSettings {
  id: string;
  setting_name: string;
  examination_session_id: string;
  program_code?: string | null;
  use_course_max?: boolean;
  cia_rounds: CiaRound[];
  institutions_id?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Entry Window Status
// ============================================================================

export type EntryWindowStatus = 'open' | 'upcoming' | 'expired' | 'no-dates';

/**
 * Returns today's calendar date in IST as a "YYYY-MM-DD" string.
 * Locked to Asia/Kolkata regardless of browser/server timezone — matches
 * COE spec §6.2. 'en-CA' formatter outputs ISO-like format directly.
 */
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Resolves the canonical entry_from / entry_to dates for a round, with
 * fallbacks for older field names. Date strings are returned unchanged
 * (expected format: "YYYY-MM-DD" so lexical compare = chronological compare).
 */
export function resolveRoundDates(round: CiaRound): {
  entryFrom: string | null;
  entryTo: string | null;
} {
  const entryFrom =
    round.entry_from ?? round.entry_open_from ?? round.start_date ?? null;
  const entryTo =
    round.entry_to ?? round.entry_close_on ?? round.end_date ?? null;
  return { entryFrom, entryTo };
}

/**
 * Determines mark-entry-window status in IST using **inclusive deadline**
 * semantics: `entry_to` is the LAST day faculty can enter marks.
 *
 * Deviates from COE integration spec §6.1 (which mandates strict/exclusive
 * cutoff `today >= entry_to → expired`) by deliberate institutional choice —
 * faculty wanted "deadline May 2" to mean "May 2 is the last open day,"
 * matching everyday human reading.
 *
 * The proxy at /api/internal-marks/marks applies the same rule. NOTE: COE's
 * /api/v1/cia-marks/sync still uses the strict rule, so a save attempt on
 * the deadline day will pass MyJKKN gates but COE may reject — coordinate
 * with the COE team to flip their operator too.
 *
 *   today < entry_from  → 'upcoming'
 *   today > entry_to    → 'expired'   (inclusive; deadline day still open)
 *   no entry_from set   → 'no-dates'  (treated as open by callers)
 *   otherwise           → 'open'
 */
export function getEntryWindowStatus(round: CiaRound): EntryWindowStatus {
  const { entryFrom, entryTo } = resolveRoundDates(round);
  if (!entryFrom) return 'no-dates';

  const today = istToday();
  if (today < entryFrom) return 'upcoming';
  if (entryTo && today > entryTo) return 'expired';
  return 'open';
}

// ============================================================================
// Mark Field Mapping
// ============================================================================

/**
 * Maps the 13 RESERVED CIA component codes to COE's dedicated column names
 * on `cia_marks`. Anything outside this set is treated as a custom component
 * and stored in `cia_marks.extra_marks` / `extra_marks_max` JSONB.
 *
 * Source of truth: COE integration spec (May 2026) §2 — Standard component codes.
 * The mark-entry submit path partitions components against this map; codes
 * present here go to flat fields, codes absent here go to JSONB.
 */
export const COMPONENT_MARK_FIELDS: Record<
  string,
  { markField: string; maxField: string }
> = {
  // Tests
  test_1: { markField: 'test_1_mark', maxField: 'test_1_max' },
  test_2: { markField: 'test_2_mark', maxField: 'test_2_max' },
  test_3: { markField: 'test_3_mark', maxField: 'test_3_max' },
  // Other reserved codes — schema column convention is `<code>_marks`
  assignment: { markField: 'assignment_marks', maxField: 'assignment_max' },
  quiz: { markField: 'quiz_marks', maxField: 'quiz_max' },
  mid_term: { markField: 'mid_term_marks', maxField: 'mid_term_max' },
  presentation: { markField: 'presentation_marks', maxField: 'presentation_max' },
  attendance: { markField: 'attendance_marks', maxField: 'attendance_max' },
  lab: { markField: 'lab_marks', maxField: 'lab_max' },
  project: { markField: 'project_marks', maxField: 'project_max' },
  seminar: { markField: 'seminar_marks', maxField: 'seminar_max' },
  viva: { markField: 'viva_marks', maxField: 'viva_max' },
  other: { markField: 'other_marks', maxField: 'other_max' },
};

/**
 * The 13 reserved codes from COE spec §2. Anything not in this set must
 * be sent under `extra_marks` / `extra_marks_max` JSONB.
 */
export const STANDARD_COMPONENT_CODES = new Set(Object.keys(COMPONENT_MARK_FIELDS));

// ============================================================================
// Exam Registrations & Course Mapping
// ============================================================================

/**
 * An exam registration from the COE system — ties a student to a course
 * in a specific exam session. Drives the student list on the mark entry page.
 */
export interface ExamRegistration {
  id: string;
  student_id: string;
  stu_register_no: string;
  student_name: string;
  roll_number?: string;
  course_code: string;
  course_name?: string;
  course_offering_id: string;
  program_code: string;
  program_name?: string;
  semester_code?: string;
  registration_status: 'Approved' | 'Pending' | 'Rejected' | string;
  is_regular: boolean;
  examination_session_id?: string;
  institutions_id?: string;
  created_at?: string;
}

/**
 * A course-mapping record from COE — defines which courses are offered
 * in which semester of a program.
 */
export interface CourseMapping {
  id: string;
  program_code: string;
  semester_code: string;
  course_code: string;
  course_name?: string;
  course_order?: number;
  internal_max_mark?: number;
  is_active: boolean;
  institutions_id?: string;
}

// ============================================================================
// Learners for Mark Entry
// ============================================================================

/**
 * A learner row on the mark entry grid.
 * Derived from ExamRegistration via CiaMarksService.getLearnersFromRegistrations.
 */
export interface LearnerForMarkEntry {
  id: string;
  register_number: string;
  name: string;
  roll_number?: string;
  exam_registration_id?: string;
  course_offering_id?: string;
}

// ============================================================================
// Marks Sync (write path)
// ============================================================================

/**
 * A single mark record to sync to COE.
 * Standard component fields (test_1_mark, assignment_marks, etc.) are added
 * dynamically based on COMPONENT_MARK_FIELDS. Custom (end-user-defined)
 * components go under `extra_marks` / `extra_marks_max` JSONB per COE
 * integration spec §4.
 */
export interface CiaMarkSyncRecord {
  institutions_id: string;
  examination_session_id: string;
  course_offering_id: string;
  student_id: string;
  exam_registration_id: string;
  submission_date: string;
  cia_round: number;
  marks_status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | string;
  total_internal_marks: number;
  max_internal_marks: number;
  /** Custom component scores, keyed by component code (e.g., {"ai_tools_int_mode": 16}) */
  extra_marks?: Record<string, number>;
  /** Custom component max marks, mirrors extra_marks keys */
  extra_marks_max?: Record<string, number>;
  // Component-specific fields (dynamic keys like test_1_mark, assignment_marks, etc.)
  [key: string]: string | number | null | undefined | Record<string, number>;
  // Audit fields (set by the API route from authenticated user)
  created_by?: string;
  updated_by?: string;
  submitted_by?: string;
}

/**
 * Batch request to sync marks to COE.
 */
export interface CiaMarksSyncRequest {
  records: CiaMarkSyncRecord[];
}

/**
 * Response from the sync endpoint.
 */
export interface CiaMarksSyncResponse {
  success: boolean;
  inserted?: number;
  updated?: number;
  total?: number;
  message?: string;
  failed?: number;
  results?: unknown[];
}

// ============================================================================
// CIA Report (read path)
// ============================================================================

/**
 * A single learner row in a CIA report — their component marks + total.
 * The `marks` map is keyed by component code (e.g., marks["test_1"] = 18).
 */
export interface CiaReportLearner {
  register_number: string;
  student_name: string;
  roll_number?: string;
  student_id?: string;
  marks: Record<string, number | null>;
  total?: number;
  in_words?: string;
}

/**
 * Course metadata returned with a CIA report.
 */
export interface CiaReportCourse {
  course_code: string;
  course_name: string;
  internal_max_mark: number;
  program_code?: string;
  semester_code?: string;
}

/**
 * Summary counts for a CIA report.
 */
export interface CiaReportSummary {
  total_learners: number;
  marks_entered: number;
  pending: number;
}

/**
 * Full CIA report response for one course + round.
 */
export interface CiaReportResponse {
  course: CiaReportCourse;
  learners: CiaReportLearner[];
  summary: CiaReportSummary;
  round?: {
    round: number;
    round_name: string;
  };
  exam_session?: {
    id: string;
    session_name: string;
  };
}

// ============================================================================
// Attendance Summary (per-student period totals for a CIA round)
// ============================================================================

/**
 * Per-student attendance summary for a single course over an attendance period.
 * Computed by fn_compute_course_attendance() against student_attendance + institution_leaves.
 *
 * total_periods    — conducted classes for this student's section in the date range,
 *                    minus any approved institution_leaves overlapping those dates
 * periods_attended — count of Present + OnDuty statuses for this student
 * attendance_pct   — periods_attended / total_periods × 100, rounded to 2 decimals
 */
export interface AttendanceSummaryRow {
  student_id: string;
  register_number?: string;
  total_periods: number;
  periods_attended: number;
  attendance_pct: number;
}

/**
 * Response from the attendance-summary API.
 */
export interface AttendanceSummaryResponse {
  course_code: string;
  course_id: string;
  attendance_period_from: string;
  attendance_period_to: string;
  rows: AttendanceSummaryRow[];
}

// ============================================================================
// Consolidated Report (multi-course / multi-semester PDF)
// ============================================================================

/**
 * A single student row in the consolidated report — marks keyed by course_code.
 */
export interface ConsolidatedStudent {
  register_number: string;
  student_name: string;
  roll_number?: string;
  marks: Record<string, number | null>;
}

/**
 * A single course column in the consolidated report.
 */
export interface ConsolidatedCourse {
  course_code: string;
  course_name: string;
  internal_max_mark: number;
}

/**
 * A semester section in the consolidated report (one page per semester).
 */
export interface ConsolidatedSemester {
  semester_label: string;
  semester_code?: string;
  courses: ConsolidatedCourse[];
  students: ConsolidatedStudent[];
}

/**
 * Full data for the consolidated (multi-semester, multi-course) PDF report.
 * Per COE spec §7.1, header lines are per-institution.
 */
export interface ConsolidatedReportData {
  institution_name?: string;
  institution_address?: string;
  institution_accreditation?: string;
  program_code: string;
  program_name: string;
  exam_session: string;
  assessment_name: string;
  cia_round_name: string;
  logoImage?: string;
  rightLogoImage?: string;
  semesters: ConsolidatedSemester[];
}
