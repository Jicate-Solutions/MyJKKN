/**
 * Types for the student-facing "My Marks" portal.
 *
 * Drives /learners/my-marks (Internal Marks + Result tabs). Reuses CIA
 * primitives from `types/internal-marks.ts` (CiaSettings, CiaRound, etc.)
 * and adds shapes specific to the student's view:
 *   - registration index grouped by semester (from course_mapping join)
 *   - per-student single-row report (vs the faculty roster shape)
 *
 * The student page is **view-only**: every shape here is read-side. No
 * mutations cross this surface.
 */

import type { CiaRound, CiaSettings } from './internal-marks';

// ============================================================================
// Registration Index (drives semester tabs + per-semester subject list)
// ============================================================================

/**
 * One row per (course_code, exam_session) pair that the student is registered
 * for. Joined locally from COE exam_registrations + course_mapping so the page
 * can sort/group without re-querying.
 */
export interface MyMarksRegistration {
  /** Stable id from the source registration row — usable as React key */
  registration_id: string;
  /** Student's register number (matches learners_profiles.register_number) */
  register_number: string;
  /** is_regular registrations only; status = Approved */
  course_code: string;
  course_name: string;
  /** course_offering_id from COE — needed by the marks endpoint */
  course_offering_id?: string;
  /** Sort key inside a semester group; ASC */
  course_order: number;
  /** Max internal marks for the course (from course_mapping) */
  internal_max_mark: number;
  /** Canonical semester grouping key (e.g., BPHARM-SEM-3) */
  semester_code: string;
  /** Human label for tab (e.g., "Semester III") */
  semester_label: string;
  /** Numeric position used to order semester tabs (1, 2, 3, ...) */
  semester_index: number;
  /** Program code from COE registration (drives CIA Settings filter) */
  program_code: string;
  /** Exam session this registration belongs to — needed for CIA fetch */
  examination_session_id: string;
}

/**
 * Registrations grouped by semester for the UI.
 * `semester_index` ascending — Sem I, Sem II, Sem III...
 */
export interface MyMarksSemesterGroup {
  semester_code: string;
  semester_label: string;
  semester_index: number;
  /** Registrations sorted by course_order ASC */
  registrations: MyMarksRegistration[];
}

/**
 * Full response shape from /api/learners/my-marks/registrations.
 */
export interface MyMarksRegistrationsResponse {
  /** Sorted ASC by semester_index. Only semesters with at least one Approved is_regular registration are included. */
  semesters: MyMarksSemesterGroup[];
  /** Convenience: highest semester_index present (used by UI for default tab) */
  current_semester_code: string | null;
  /** Distinct exam_session_ids found across all registrations */
  exam_session_ids: string[];
}

// ============================================================================
// Single-Student Report (one row from the CIA report, scoped to caller)
// ============================================================================

/**
 * A student's marks for a single (course, round). The faculty-facing report
 * returns an array of learners; the my-marks endpoint server-side-filters
 * to just the calling student's row, returning this single shape.
 */
export interface MyMarksReportRow {
  course_code: string;
  course_name: string;
  internal_max_mark: number;
  cia_round: number;
  cia_round_name: string;
  /** Component code → mark (or null if not entered yet) */
  marks: Record<string, number | null>;
  /** Total entered for this round */
  total: number | null;
  /** Whether ANY component on this round has been entered */
  has_entries: boolean;
}

// ============================================================================
// CIA Settings — re-export with my-marks specific filter shape
// ============================================================================

/**
 * What the CIA Setting picker on the assessment panel needs.
 * (Subset of CiaSettings; keeps wire size small.)
 */
export interface MyMarksCiaSetting
  extends Pick<
    CiaSettings,
    'id' | 'setting_name' | 'examination_session_id' | 'program_code' | 'cia_rounds' | 'is_active' | 'updated_at'
  > {
  exam_session_name?: string;
}

export type { CiaRound };

// ============================================================================
// Final (Phase 2 stub)
// ============================================================================

/**
 * Placeholder shape for the Internal-Final tab. Actual COE endpoint TBD —
 * this shape is a guess that can be refined when the spec lands.
 */
export interface MyMarksInternalFinalRow {
  course_code: string;
  course_name: string;
  internal_max_mark: number;
  /** Final consolidated CIA total (across rounds; rules per COE) */
  final_total: number | null;
  /** Optional per-round breakdown if COE returns it */
  round_totals?: Record<string, number | null>;
}

export interface MyMarksInternalFinalResponse {
  status: 'ready' | 'coming_soon';
  semester_code?: string;
  rows?: MyMarksInternalFinalRow[];
}

// ============================================================================
// Semester Result (published final marks)
// ============================================================================

/**
 * One published-result row scoped to the calling student, sourced from the
 * COE `/api/v1/results` endpoint.
 *
 * COE only returns a row once BOTH conditions hold: `result_status =
 * 'Published'` AND the session's `result_declaration_date` has arrived. So a
 * row existing here already means "officially declared".
 *
 * `course_code` / `course_name` are NOT part of the COE results row — they are
 * filled in client-side by joining `course_offering_id` to the semester's
 * registration index (which carries those labels).
 */
export interface MyMarksResultRow {
  /** Join key back to the registration index for course label resolution */
  course_offering_id: string | null;
  course_id: string | null;
  /** Filled client-side via the course_offering_id join */
  course_code?: string;
  /** Filled client-side via the course_offering_id join */
  course_name?: string;
  /** Human grade description (e.g. "Outstanding") resolved from the grade system */
  grade_description?: string | null;
  program_code: string | null;
  register_number: string;
  internal_obtained: number | null;
  internal_max: number | null;
  external_obtained: number | null;
  external_max: number | null;
  total_obtained: number | null;
  total_max: number | null;
  percentage: number | null;
  letter_grade: string | null;
  grade_points: number | null;
  credit: number | null;
  total_grade_points: number | null;
  is_pass: boolean | null;
  pass_status: string | null;
  result_status: string | null;
  result_declaration_date: string | null;
  session_status: string | null;
}

/**
 * Full response from /api/learners/my-marks/result for a single exam session.
 * `declared` is a convenience flag: true when COE returned at least one row
 * (which by COE's contract means the session result has been declared).
 */
export interface MyMarksResultResponse {
  results: MyMarksResultRow[];
  declared: boolean;
}

// ============================================================================
// Grade System (read-only grade bands — points, mark ranges, descriptions)
// ============================================================================

/**
 * One grade band from the COE `/api/v1/grade-system` endpoint. Used to
 * decorate published result rows with a grade point + human description
 * (e.g. "O" → 10 pts → "Outstanding").
 */
export interface MyMarksGradeBand {
  grade: string;
  grade_point: number | null;
  min_mark: number | null;
  max_mark: number | null;
  description: string | null;
  is_active?: boolean;
}

/**
 * Grade system payload for the calling student. `grade_system_code` is the
 * student's resolved level ("UG" / "PG"), used to scope the band set; null
 * when the level couldn't be determined.
 */
export interface MyMarksGradeSystemResponse {
  bands: MyMarksGradeBand[];
  grade_system_code: string | null;
}

// ============================================================================
// Student Result View (single aggregate endpoint — COE /api/v1/student-result-view)
// ============================================================================

/** A grade band as returned by the aggregate result-view endpoint. */
export interface ResultViewGradeBand {
  grade: string | null;
  grade_point: number | null;
  min_mark: number | null;
  max_mark: number | null;
  description: string | null;
  qualify: boolean | null;
  is_absent: boolean | null;
  exclude_cgpa: boolean | null;
  result_status: string | null;
}

/** One course row within an exam-session tab of the result view. */
export interface ResultViewCourse {
  course_code: string | null;
  course_name: string | null;
  course_order: number | null;
  credit: number | null;
  internal_obtained: number | null;
  internal_max: number | null;
  external_obtained: number | null;
  external_max: number | null;
  total_obtained: number | null;
  total_max: number | null;
  percentage: number | null;
  letter_grade: string | null;
  grade_points: number | null;
  total_grade_points: number | null;
  is_pass: boolean | null;
  pass_status: string | null;
  result_status: string | null;
  /** Always present. false → result not declared yet (mark fields are null). */
  is_published: boolean;
  /** false → arrear / re-appear paper (belongs to an earlier semester). */
  is_regular: boolean | null;
  attempt_number: number | null;
  /** The course's OWN semester (for arrears, earlier than the tab's semester). */
  semester_code: string | null;
  semester_index: number | null;
  /** false → not counted toward SGPA/credits. */
  credit_included: boolean | null;
  examination_session_id: string | null;
}

/**
 * One exam-session tab. Labelled by the semester of its `is_regular` papers, and
 * contains every paper sat in that session (regular + arrears). `summary` is the
 * regular-papers scorecard only.
 */
export interface ResultViewSession {
  examination_session_id: string | null;
  session_code: string | null;
  session_name: string | null;
  session_status: string | null;
  result_declaration_date: string | null;
  /** Tab label semester — from the session's regular papers. */
  semester_code: string | null;
  semester_label: string;
  semester_index: number;
  courses: ResultViewCourse[];
  summary: {
    sgpa: number | null;
    total_credits: number;
    passed: number;
    total: number;
  };
}

/**
 * Full payload from COE /api/v1/student-result-view (one call replaces the old
 * registrations + results + grade-system + courses + course-mapping fan-out).
 * Grouped by exam session — one tab per session the learner sat.
 */
export interface StudentResultView {
  student: {
    student_id: string | null;
    register_number: string | null;
    student_name: string | null;
    program_code: string | null;
    grade_system_code: 'UG' | 'PG' | string;
  };
  grade_system: ResultViewGradeBand[];
  sessions: ResultViewSession[];
}

// ============================================================================
// Student CIA View (single aggregate endpoint — COE /api/v1/student-cia-view)
// ============================================================================

export interface CiaViewComponent {
  code: string;
  name: string;
  max_marks: number | null;
}

export interface CiaViewRound {
  round: number;
  round_name: string;
  components: CiaViewComponent[];
}

/** A session's CIA configuration (rounds + components) — drives the grid layout. */
export interface CiaViewSetting {
  setting_id: string;
  setting_name: string | null;
  rounds: CiaViewRound[];
}

/** A learner's marks for one course in one round. */
export interface CiaViewCourseRound {
  round: number;
  round_name: string;
  /** Component code → mark (null if not entered). Keys match component codes. */
  marks: Record<string, number | null>;
  total: number | null;
  max_total: number | null;
  marks_status: string | null;
  has_entries: boolean;
}

export interface CiaViewCourse {
  course_code: string | null;
  course_name: string | null;
  course_order: number | null;
  internal_max_mark: number | null;
  /** false → arrear / re-appear paper (belongs to an earlier semester). */
  is_regular: boolean | null;
  semester_code: string | null;
  semester_index: number | null;
  /** e.g. "CIA + ESE" | "CIA" | "ESE". Used to show only CIA-applicable courses. */
  evaluation_type?: string | null;
  /** e.g. "Mark" | "Grade". Internal tab shows mark-typed courses only. */
  result_type?: string | null;
  rounds: CiaViewCourseRound[];
}

/** One exam-session tab — labelled by its regular papers' semester. */
export interface CiaViewSession {
  examination_session_id: string | null;
  session_code: string | null;
  session_name: string | null;
  session_status: string | null;
  semester_code: string | null;
  semester_label: string;
  semester_index: number;
  /** The session's CIA round/component config. */
  settings: CiaViewSetting[];
  /** Regular + arrear courses with the learner's per-round marks. */
  courses: CiaViewCourse[];
}

/**
 * Full payload from COE /api/v1/student-cia-view (one call replaces the old
 * registrations + cia-settings + cia-marks/report fan-out for the Internal tab).
 * Grouped by exam session — same model as StudentResultView. No publish gate.
 */
export interface StudentCiaView {
  student: {
    student_id: string | null;
    register_number: string | null;
    student_name: string | null;
    program_code: string | null;
    grade_system_code: 'UG' | 'PG' | string;
  };
  sessions: CiaViewSession[];
}
