// types/exam-audit.ts
// Exam IA Audit — shared types. Mirrors app/api/internal-marks/exam-audit
// (overview) + fn_my_running_attendance (learner transparency score).
// Spec origin: Director 2026-07-13 — "is the internal assessment as per JKKN
// data or some other data"; Registrar audits departments in person.

/** How a program's CIA entries read against continuous-entry expectations. */
export type ExamAuditVerdict =
  | 'faculty_continuous' // faculty-stamped, spread over the term — as intended
  | 'partial'            // some continuous signal, not clean
  | 'operator_bulk'      // operator accounts and/or one-day dump — "some other data"
  | 'missing';           // registered for the exam but NO CIA rows at all

export interface ExamAuditProgramRow {
  program_code: string;
  program_name: string | null;
  /** Students the university expects (exam_registrations). */
  registered_students: number;
  registered_courses: number;
  /** CIA provenance (raw cia_marks for this session). */
  cia_rows: number;
  cia_students: number;
  distinct_enterers: number;
  faculty_entered_pct: number;
  entry_days: number;
  /** % of all CIA rows entered on the single busiest day (100 = one-day dump). */
  top_day_share_pct: number;
  rounds_used: number[];
  verified_pct: number;
  approved_pct: number;
  /** % of CIA rows whose attendance component was actually filled. */
  attendance_component_filled_pct: number;
  verdict: ExamAuditVerdict;
  /** Eligibility risk among registered students, from JKKN day-one attendance. */
  att_below_75: number;
  att_below_65: number;
  att_no_record: number;
}

export interface ExamAuditSessionRef {
  id?: string;
  session_code: string | null;
  session_name: string | null;
  session_status?: string | null;
  exam_start_date?: string | null;
  exam_end_date?: string | null;
  auto_detected?: boolean;
}

export interface ExamAuditOverviewResponse {
  institutions: Array<{ id: string; name: string | null }>;
  institution: { id: string; name: string | null };
  sessions: Array<{
    session_code: string | null;
    session_name: string | null;
    session_status: string | null;
    exam_start_date: string | null;
    exam_end_date: string | null;
  }>;
  session: ExamAuditSessionRef;
  /** The semester window the JKKN attendance was computed over. */
  window: { from: string; to: string };
  thresholds: { eligibility: number; condonation: number };
  programs: ExamAuditProgramRow[];
  totals: {
    programs: number;
    registered_students: number;
    cia_rows: number;
    missing_programs: number;
    operator_bulk_programs: number;
  };
}

/** One course in the learner's own running transparency score
 *  (fn_my_running_attendance — starts at 100, comes down with absences). */
export interface MyRunningAttendanceRow {
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  present: number;
  total: number;
  pct: number | null;
  first_session: string | null;
  last_session: string | null;
}
