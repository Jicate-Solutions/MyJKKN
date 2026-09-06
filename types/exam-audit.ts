// types/exam-audit.ts
// Exam IA Audit — shared types. Mirrors app/api/internal-marks/exam-audit
// (overview) + fn_my_running_attendance (learner transparency score).
// Spec origin: Director 2026-07-13 — "is the internal assessment as per JKKN
// data or some other data"; Registrar audits departments in person.

/** How a program's CIA entries sit against its configured rubric. */
export type ExamAuditRubricVerdict =
  | 'follows_rubric' // all configured rounds entered, inside their windows
  | 'partial'        // some rounds/windows honoured
  | 'off_rubric'     // most rounds missing or entries outside every window
  | 'no_rubric';     // no active CIA setting covers this program

export type ExamAuditVerdict =
  | 'faculty_continuous' // faculty-stamped, spread over the term — as intended
  | 'partial'            // some continuous signal, not clean
  | 'operator_bulk'      // operator accounts and/or one-day dump — "some other data"
  | 'missing';           // registered for the exam but NO CIA rows at all

/** One round of a rubric as the viewer displays it. */
export interface ExamAuditRubricRoundDef {
  round: number;
  round_name: string | null;
  entry_from: string | null;
  entry_to: string | null;
  components: Array<{ name: string; max_marks: number }>;
  total_max: number;
}

/** What the rubric SAYS — the assessment pattern itself, not the verdicts
 *  against it. Configured by the exam cell in COE (cia_entry_settings). */
export interface ExamAuditRubricDefinition {
  setting_names: string[];
  rounds: ExamAuditRubricRoundDef[];
  /** True when the whole rubric carries zero max marks — exists on paper,
   *  grades nothing. */
  is_empty: boolean;
}

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
  verdict: ExamAuditVerdict;
  /** Rubric compliance — graded against the canonical CIA settings
   *  (cia_entry_settings.cia_rounds, the same CiaSettings/CiaRound shape the
   *  entry grid uses). Internal marks are defined by the rubric's components
   *  (tests/assignments/etc.) — never by attendance. */
  rubric_verdict: ExamAuditRubricVerdict;
  /** Rounds the rubric configures (null = no rubric covers this program). */
  rubric_rounds_configured: number | null;
  /** % of CIA rows entered inside their round's configured entry window. */
  on_window_pct: number | null;
  /** The round NUMBERS the rubric configures (e.g. [1,2]) — lets consumers say
   *  which round never happened, not just how many. */
  rubric_rounds: number[];
  rubric_setting_names: string[];
  /** The rubric's actual definition (rounds, entry windows, components with
   *  max marks) — what the rubric viewer shows. null = no rubric covers this
   *  program for this session. */
  rubric_definition: ExamAuditRubricDefinition | null;
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

// ── Program drill-down (2026-07-14) ─────────────────────────────────────────
// Director: "1 AND 2 — carry everything, drop nothing." Behind every audit
// count sits a person: these are the per-student rows the Registrar walks the
// department with. Served ONLY behind academic.internal_marks.exam_audit.view.

/** Eligibility bucket from JKKN day-one attendance. Attendance gates who may
 *  SIT the exam — it never decides the internal marks. */
export type ExamAuditAttendanceBucket = 'ok' | 'below_75' | 'below_65' | 'no_record';

/** One registered student inside a program drill-down. */
export interface ExamAuditStudentDetailRow {
  student_id: string;
  student_name: string | null;
  register_no: string | null;
  /** Courses this student is registered for in the session. */
  registered_courses: number;
  /** CIA provenance for this student within the program/session. */
  cia_rows: number;
  cia_courses: number;
  rounds_used: number[];
  faculty_stamped_pct: number | null;
  verified_pct: number | null;
  avg_internal_pct: number | null;
  /** JKKN continuous attendance over the audit window (null = no record). */
  att_present: number | null;
  /** Days marked absent that an approved tournament permission or full-day
   *  on-duty application excuses. Counted into att_pct, reported separately so
   *  a protected day can be explained rather than just improving a number. */
  att_protected: number | null;
  att_total: number | null;
  /** (att_present + att_protected) / att_total — the figure eligibility bands
   *  are read against. Raw attendance is att_present / att_total. */
  att_pct: number | null;
  att_bucket: ExamAuditAttendanceBucket;
}

export interface ExamAuditProgramDetailResponse {
  institution: { id: string; name: string | null };
  session: ExamAuditSessionRef;
  window: { from: string; to: string };
  thresholds: { eligibility: number; condonation: number };
  /** The same verdict row the overview table shows for this program. */
  program: ExamAuditProgramRow;
  students: ExamAuditStudentDetailRow[];
}

// ── Rubric-coverage evidence pack (2026-07-14) ───────────────────────────────
// The one-page document the Registrar/Director hands to the exam cell. Every
// number is derived from the SAME computeExamAuditPrograms output the page and
// the weekly alert use — the pack can never disagree with the page.

export interface ExamAuditEvidenceProgramRef {
  program_code: string;
  program_name: string | null;
  registered_students: number;
  /** Human-readable finding ("rubric configures rounds 1, 2 — round 2 never entered"). */
  detail: string;
}

export interface ExamAuditEvidenceCollege {
  institution_code: string;
  name: string | null;
  /** The exam session the college was graded on (auto-detected current term). */
  session_code: string | null;
  session_reason: 'ongoing_or_next' | 'most_recent_past' | null;
  exam_start_date: string | null;
  exam_end_date: string | null;
  /** True = sessions exist but the graded term has zero exam registrations. */
  no_registrations: boolean;
  registered_students: number;
  programs_total: number;
  /** Programs with no finding in any list below. */
  programs_ok: number;
  /** Registered students with/without any JKKN attendance record in the window. */
  attendance: { with_record: number; no_record: number } | null;
  findings: {
    no_rubric: ExamAuditEvidenceProgramRef[];
    rubric_empty: ExamAuditEvidenceProgramRef[];
    rubric_zero_entries: ExamAuditEvidenceProgramRef[];
    rounds_missing: ExamAuditEvidenceProgramRef[];
    operator_bulk: ExamAuditEvidenceProgramRef[];
  };
}

export interface ExamAuditEvidencePack {
  generated_at: string;
  /** Scope note — which colleges the generating user could see. */
  scope: string;
  /** Colleges bridged to COE but with NO examination sessions at all. */
  colleges_no_sessions: Array<{ institution_code: string; name: string | null }>;
  colleges: ExamAuditEvidenceCollege[];
  totals: {
    colleges_reviewed: number;
    colleges_no_sessions: number;
    programs_flagged: number;
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
  /** (present + protected) / total — the same rule the Registrar's audit uses,
   *  so the learner's own card and the audit can never show different bands. */
  pct: number | null;
  first_session: string | null;
  last_session: string | null;
  /** Days marked absent that an approved on-duty or tournament permission
   *  excuses. Read-time only: withdrawing the approval withdraws the credit. */
  protected: number;
}
