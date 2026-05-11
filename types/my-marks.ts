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
