// types/session-feedback.ts
// Post-class feedback module — shared types. Mirrors the RPC contracts in
// supabase/migrations/20260615233000_session_feedback_substrate.sql.
// Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md

/** A persisted feedback row (returned by fn_scf_submit_feedback). */
export interface SessionFeedbackRow {
  id: string;
  institution_id: string;
  student_id: string;
  attendance_date: string;
  timetable_id: string;
  period_id: string;
  section_id: string | null;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  faculty_id: string | null;
  faculty_email: string | null;
  understood: number;            // 1..5
  checklist: Record<string, boolean>;
  free_text: string | null;
  created_at: string;
  updated_at: string;
}

/** A session the learner attended (Present) but has not yet given feedback for.
 *  fn_scf_pending_for_learner. course_code/faculty_name may be null for coarse
 *  FN/AN attendance blobs that carry no course/faculty metadata. */
export interface PendingSession {
  attendance_date: string;
  timetable_id: string;
  period_id: string;
  section_id: string | null;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  faculty_name: string | null;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
}

/** Per-session confirmation state for the learner. fn_scf_confirmation_status. */
export interface ConfirmationStatusRow {
  attendance_date: string;
  timetable_id: string;
  period_id: string;
  course_code: string | null;
  course_name: string | null;
  confirmed: boolean;            // false = present-pending (feedback not yet given)
}

/** Anonymized faculty summary row. fn_scf_faculty_summary. */
export interface FacultySummaryRow {
  attendance_date: string;
  period_id: string;
  course_code: string | null;
  course_name: string | null;
  responses: number;
  avg_understood: number | null;
  low_understanding: number;
}

/** Faculty completion (coverage) per session. fn_scf_faculty_completion.
 *  Counts only — confirms how MANY of the Present students gave feedback, never WHO/what. */
export interface FacultyCompletionRow {
  attendance_date: string;
  timetable_id: string;
  period_id: string;
  course_code: string | null;
  course_name: string | null;
  present_count: number;
  confirmed_count: number;
  pending_count: number;
  completion_pct: number;        // 0..100
  within_window: boolean;        // feedback still inside the due window
  // Added 2026-07-04 (faculty-engagement adoption). Optional so older callers/rows
  // (and any pre-migration deploy) keep type-checking.
  start_time?: string | null;    // blob wall-clock, powers the current-period spotlight (PR-A)
  end_time?: string | null;
  /** Resolved post-class-feedback gate for this session's institution.
   *  'visibility' by default (dark) — 'hard' only after the config flip. */
  gate_mode?: 'off' | 'visibility' | 'hard' | null;
  /** DERIVED enforcement status (PR-C). 'incomplete' appears ONLY under gate_mode='hard'
   *  with pending>0 inside the window; inert (never 'incomplete') otherwise. */
  session_status?: 'complete' | 'incomplete' | 'open' | 'overdue' | null;
}

/** DERIVED, non-destructive per-learner "effective attendance %" coupling row.
 *  fn_scf_effective_attendance (PR-D). Counts only — never feedback content. The
 *  effective_pct only counts CONFIRMED present marks, so present-but-no-feedback
 *  lowers it vs official_pct. Read-only: attendance_data is never mutated. */
export interface EffectiveAttendanceRow {
  student_id: string;
  present_marks: number;
  absent_marks: number;
  confirmed_present: number;
  official_pct: number;          // present / (present + absent)
  effective_pct: number;         // confirmed_present / (present + absent)
}

/** Result of the compliance-gated effective-% read. `enabled` is false (and rows
 *  empty) whenever session_feedback.attendance_coupling_enabled is OFF (the default),
 *  in which case NOTHING was computed and the official % is untouched. */
export interface EffectiveAttendanceCoupling {
  enabled: boolean;
  rows: EffectiveAttendanceRow[];
}

/** A Present student who has NOT submitted feedback. fn_scf_faculty_pending_roster.
 *  Identity ONLY — the RPC never returns any feedback content (understood/checklist/free_text). */
export interface PendingRosterRow {
  student_name: string | null;
  register_number: string | null;
}

/** Principal escalation row. fn_scf_principal_escalations. */
export interface EscalationRow {
  attendance_date: string;
  period_id: string;
  course_code: string | null;
  course_name: string | null;
  faculty_email: string | null;
  responses: number;
  avg_understood: number | null;
  low_understanding: number;
}

/** Escalated session paired with its next same-faculty+course session and the
 *  understanding "lift". fn_scf_escalation_followups (closes the outer loop, #10).
 *  next_* fields are null when no later session of the same class has feedback yet. */
export interface EscalationFollowupRow {
  // The escalated session (the trigger)
  attendance_date: string;
  period_id: string;
  course_code: string | null;
  course_name: string | null;
  faculty_email: string | null;
  responses: number;
  avg_understood: number | null;
  low_understanding: number;
  // The next same-faculty+course session (the follow-up)
  next_attendance_date: string | null;
  next_responses: number | null;
  next_avg_understood: number | null;
  // lift = next_avg_understood - avg_understood; positive = improved; null = no next session yet
  lift: number | null;
}

/** Teacher's own "topics to revisit" row. fn_scf_faculty_followups (B1).
 *  Identical contract to EscalationFollowupRow — the principal lift RPC self-scoped
 *  to the caller's own taught sessions — so the shared FollowupCell renders it as-is. */
export type FacultyFollowupRow = EscalationFollowupRow;

/** A learner's private "your voice this term" receipt row. fn_scf_my_impact (C3).
 *  One row per session the learner gave feedback on. Carries the learner's OWN rating
 *  plus — for sessions they FLAGGED — whether a DISCRETE, recorded downstream faculty
 *  action exists that is traceable to their own voice: an AI suggestion issued to the
 *  teacher whose generation window CONTAINS this session (so the learner's flag was part
 *  of the signal that produced it). NEVER a class-average lift — a cohort effect is never
 *  attributed to one learner. action_* stay null/false until such an action exists. */
export interface MyImpactRow {
  attendance_date: string;
  course_code: string | null;
  course_name: string | null;
  my_understood: number;          // the learner's own 1..5 rating for that session
  flagged: boolean;               // my_understood <= 2
  // The single discrete downstream action recorded for this flagged class, traceable to
  // the learner's own flag. 'verdict_worked' = teacher attested it helped; 'suggestion_issued'
  // = a follow-up suggestion was issued to the teacher; null = nothing yet (no causal claim).
  action_taken: boolean;
  action_kind: 'verdict_worked' | 'suggestion_issued' | null;
  action_detail: string | null;  // the concrete thing the teacher was advised to do
  action_date: string | null;    // when that suggestion was generated
}

/** Per-college admin summary. fn_scf_admin_college_summary (aggregates only).
 *  Cross-college for super_admin; own-institution for institution leadership. */
export interface AdminCollegeSummaryRow {
  institution_id: string;
  institution_name: string | null;
  sessions: number;
  responses: number;
  students: number;
  avg_understood: number | null;
  low_sessions: number;
}

/** Per-faculty admin summary (worst understanding first). fn_scf_admin_faculty_summary.
 *  Aggregates only — never per-student feedback content. */
export interface AdminFacultySummaryRow {
  institution_id: string;
  institution_name: string | null;
  faculty_email: string | null;
  sessions: number;
  responses: number;
  avg_understood: number | null;
  low_sessions: number;
}

/** Per-day understanding trend across scope. fn_scf_admin_trend (aggregates only). */
export interface AdminTrendRow {
  attendance_date: string;
  responses: number;
  students: number;
  avg_understood: number | null;
}

/** Per-learning-facilitator FEEDBACK coverage. fn_scf_facilitator_feedback_coverage.
 *  Denominator (taught_sessions) = distinct sessions the facilitator TAUGHT (attendance
 *  marked), drawn from student_attendance — NOT from session_feedback — so facilitators
 *  who taught but received zero feedback appear with coverage_pct = 0 (the whole point).
 *  Aggregates only: never per-student understood / checklist / free_text. */
export interface FacilitatorCoverageRow {
  institution_id: string;
  institution_name: string | null;
  staff_id: string;
  facilitator_name: string | null;
  designation: string | null;
  department_name: string | null;
  taught_sessions: number;
  covered_sessions: number;
  coverage_pct: number;
  responses: number;
  last_taught: string | null;
  last_feedback: string | null;
}

/** A carry-forward re-ask for a pending session. fn_scf_carryforward_for_learner (PR B).
 *  Surfaced when the learner previously took the SAME course and flagged trouble
 *  (prior_understood <= 2 OR left checklist items unchecked). prior_unmet_items are
 *  the checklist item_keys that were false/missing in the prior row (UI maps to labels). */
export interface CarryforwardItem {
  timetable_id: string;
  period_id: string;
  course_code: string;
  course_name: string | null;
  prior_session_date: string;     // 'YYYY-MM-DD'
  prior_understood: number;       // 1..5
  prior_unmet_items: string[];    // checklist item_keys that were false/missing
}

/** A configured checklist item the learner ticks. session_feedback_checklist_config. */
export interface ChecklistConfigItem {
  id: string;
  institution_id: string | null;
  item_key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

/** Input to submit feedback. */
export interface SubmitFeedbackInput {
  attendanceDate: string;        // 'YYYY-MM-DD'
  timetableId: string;
  periodId: string;
  understood: number;            // 1..5
  checklist?: Record<string, boolean>;
  freeText?: string | null;
  /** Capture channel. 'live_poll' is honored only when a pulse is open for the
   *  class (the RPC downgrades to 'async' otherwise). Defaults to 'async'. */
  source?: 'async' | 'live_poll';
}

// ── Live Pulse Check — a live in-class poll that fuels the feedback loop ──────
// Spec: specs/live-pulse-check-2026-06-25.md. Each student answer is a normal
// feedback submit with source='live_poll'; these types cover only the live
// lifecycle (scf_live_pulse) + the teacher's anonymized totals.

/** A live pulse session (scf_live_pulse). Returned by fn_scf_open_pulse. */
export interface LivePulseRow {
  id: string;
  institution_id: string | null;
  timetable_id: string;
  attendance_date: string;
  period_id: string;
  course_code: string | null;
  course_name: string | null;
  faculty_email: string | null;
  is_open: boolean;
  issued_at: string;
  auto_close_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** An open pulse for a session the learner is marked Present in.
 *  fn_scf_open_pulse_for_learner. */
export interface OpenPulseForLearner {
  pulse_id: string;
  attendance_date: string;
  timetable_id: string;
  period_id: string;
  course_code: string | null;
  course_name: string | null;
  faculty_email: string | null;
  issued_at: string;
  auto_close_at: string;
  already_answered: boolean;
}

/** Anonymized live totals for the teacher (fn_scf_pulse_totals). TOTALS ONLY —
 *  never who answered what. The understanding distribution + checklist tallies
 *  are suppressed (null) until at least 3 responses (k-anonymity floor, #2). */
export interface PulseTotals {
  is_open: boolean;
  auto_close_at: string;
  present_count: number;
  response_count: number;
  suppressed: boolean;                                // true when response_count < 3
  avg_understood: number | null;                      // null when suppressed
  dist: Record<string, number> | null;               // {"1":n,...,"5":n} or null
  checklist_counts: Record<string, number> | null;   // {item_key:n} or null
}

/** The caller learner's OWN confirmed-attendance snapshot (fn_scf_my_confirmed_attendance).
 *  Forward-only from enforcement_start: confirmed_pct = present-AND-feedback / (present+absent).
 *  Below min_marks the % is still "building up" (settle-in floor, #6) and is not yet judged
 *  against pass_line. Never mutates attendance; official_pct is shown for context only. */
export interface MyConfirmedAttendance {
  present_marks: number;
  absent_marks: number;
  confirmed_present: number;
  total_marks: number;
  official_pct: number;
  confirmed_pct: number;
  enforcement_start: string;
  gate_mode: 'off' | 'visibility' | 'hard';
  pass_line: number;   // 75
  min_marks: number;   // 10 — settle-in floor
}

/** One unverdicted AI improvement note for a course+facilitator, surfaced at the
 *  NEXT attendance-marking of that course (verdict-at-next-class card). Aggregate
 *  guidance only — never per-student content, never a raw understanding number
 *  (the card renders bands via understandingLevel; anti-gaming, same rule as
 *  the faculty dashboard). */
export interface PendingVerdictSuggestion {
  id: string;
  course_code: string;
  kind: 'improvement';
  suggestion: {
    summary?: string;
    quickWin?: string;
    likelyCauses?: string[];
    suggestedAdjustments?: { title: string; how: string }[];
    whatToWatchNext?: string;
  } | null;
  generated_at: string;
  input_avg_understood: number | null;
  outcome_avg_understood: number | null;
  outcome_measured_at: string | null;
}
