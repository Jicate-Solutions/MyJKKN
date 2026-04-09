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
 */
export interface CiaRound {
  round: number;
  round_name: string;
  start_date?: string | null;
  end_date?: string | null;
  entry_open_from?: string | null;
  entry_close_on?: string | null;
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

export type EntryWindowStatus = 'open' | 'upcoming' | 'closed';

/**
 * Determines whether the mark entry window is open, upcoming, or closed
 * based on the round's entry_open_from / entry_close_on dates.
 * When dates are missing, defaults to 'open' (no time restriction).
 */
export function getEntryWindowStatus(round: CiaRound): EntryWindowStatus {
  const openFrom = round.entry_open_from || round.start_date;
  const closeOn = round.entry_close_on || round.end_date;

  if (!openFrom && !closeOn) return 'open';

  const now = Date.now();
  const openTs = openFrom ? new Date(openFrom).getTime() : -Infinity;
  const closeTs = closeOn ? new Date(closeOn).getTime() : Infinity;

  if (isNaN(openTs) && isNaN(closeTs)) return 'open';
  if (!isNaN(openTs) && now < openTs) return 'upcoming';
  if (!isNaN(closeTs) && now > closeTs) return 'closed';
  return 'open';
}

// ============================================================================
// Mark Field Mapping
// ============================================================================

/**
 * Maps a CIA component code to the COE marks table field names.
 * COE stores marks in a flat schema: test_1_marks / test_1_max,
 * assign_1_marks / assign_1_max, etc. This map is used when building
 * the sync records from component-keyed rows.
 */
export const COMPONENT_MARK_FIELDS: Record<
  string,
  { markField: string; maxField: string }
> = {
  test_1: { markField: 'test_1_marks', maxField: 'test_1_max' },
  test_2: { markField: 'test_2_marks', maxField: 'test_2_max' },
  test_3: { markField: 'test_3_marks', maxField: 'test_3_max' },
  assign_1: { markField: 'assign_1_marks', maxField: 'assign_1_max' },
  assign_2: { markField: 'assign_2_marks', maxField: 'assign_2_max' },
  assignment_1: { markField: 'assign_1_marks', maxField: 'assign_1_max' },
  assignment_2: { markField: 'assign_2_marks', maxField: 'assign_2_max' },
  quiz_1: { markField: 'quiz_1_marks', maxField: 'quiz_1_max' },
  quiz_2: { markField: 'quiz_2_marks', maxField: 'quiz_2_max' },
  seminar: { markField: 'seminar_marks', maxField: 'seminar_max' },
  attendance: { markField: 'attendance_marks', maxField: 'attendance_max' },
  practical: { markField: 'practical_marks', maxField: 'practical_max' },
  record: { markField: 'record_marks', maxField: 'record_max' },
  observation: { markField: 'observation_marks', maxField: 'observation_max' },
  viva: { markField: 'viva_marks', maxField: 'viva_max' },
  model_exam: { markField: 'model_exam_marks', maxField: 'model_exam_max' },
};

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
 * Component-specific mark fields (test_1_marks, etc.) are added dynamically
 * based on the COMPONENT_MARK_FIELDS map.
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
  // Component-specific fields (dynamic keys like test_1_marks, test_1_max, etc.)
  [key: string]: string | number | null | undefined;
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
 */
export interface ConsolidatedReportData {
  institution_name?: string;
  program_code: string;
  program_name: string;
  exam_session: string;
  assessment_name: string;
  cia_round_name: string;
  logoImage?: string;
  rightLogoImage?: string;
  semesters: ConsolidatedSemester[];
}
