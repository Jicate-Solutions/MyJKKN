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
  /** Responses rating understanding <= 2 in window — the individual-learner
   *  lens (a struggling voice in an otherwise-fine class never moves
   *  low_sessions). Optional: absent from cached pre-2026-07-11 responses. */
  low_flag_responses?: number;
  /** Sessions containing >= 1 such response. */
  low_flag_sessions?: number;
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

/** One open free-text concern carried to the next same-course check-in
 *  ("you mentioned the lab pace — better this time?"). AI-summarized from the
 *  learner's OWN prior words; shown only to them. scf_freetext_carry. */
export interface CarryforwardConcern {
  id: string;
  summary: string;
  source_date: string;            // 'YYYY-MM-DD'
}

/** The learner's latest un-acknowledged praise item (one-line ack, no question). */
export interface CarryforwardPraise {
  id: string;
  summary: string;
}

/** A carry-forward re-ask for a pending session. fn_scf_carryforward_for_learner (PR B;
 *  free-text extension 2026-07-19). Surfaced when the learner previously took the SAME
 *  course and flagged trouble (prior_understood <= 2 OR unchecked checklist items) —
 *  OR has open free-text items for it. On a concerns-only row the checklist fields
 *  are null/empty (decision 8: words count even from a happy 5/Clear check-in). */
export interface CarryforwardItem {
  timetable_id: string;
  period_id: string;
  course_code: string;
  course_name: string | null;
  prior_session_date: string | null; // 'YYYY-MM-DD'; null = concerns-only row
  prior_understood: number | null;   // 1..5; null = concerns-only row
  prior_unmet_items: string[];       // checklist item_keys that were false/missing
  prior_concerns: CarryforwardConcern[];
  prior_praise: CarryforwardPraise | null;
}

/** Course-level counts of free-text follow-ups for a Senior Learner's own
 *  sessions. Counts only, >=floor distinct learners (fn_scf_freetext_carry_counts). */
export interface FreetextCarryCountsRow {
  course_code: string;
  course_name: string | null;
  learners: number;
  open_concerns: number;
  resolved: number;
  partly: number;
  not_better: number;
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
    /** Exact closed-window session dates the note coached on (two-sided 48h
     *  window, 2026-07-09) — stamped deterministically by the generator. */
    contributing_dates?: string[];
  } | null;
  generated_at: string;
  input_avg_understood: number | null;
  outcome_avg_understood: number | null;
  outcome_measured_at: string | null;
}

/** One AI note addressed to the logged-in facilitator, for the always-visible
 *  "Notes from your feedback loop" card on the faculty page. Same anti-gaming
 *  rule as PendingVerdictSuggestion: averages render as band words only. */
export interface MyLoopNote {
  id: string;
  course_code: string;
  kind: 'improvement' | 'success';
  suggestion: {
    summary?: string;
    quickWin?: string;
    likelyCauses?: string[];
    suggestedAdjustments?: { title: string; how: string }[];
    whatToWatchNext?: string;
    /** Exact closed-window session dates the note coached on (two-sided 48h
     *  window, 2026-07-09) — stamped deterministically by the generator. */
    contributing_dates?: string[];
  } | null;
  generated_at: string;
  input_avg_understood: number | null;
  outcome_avg_understood: number | null;
  /** Measured change vs the RECOMPUTED window baseline (not input_avg_understood
   *  — the two use different estimators). The card derives the displayed
   *  "before" as outcome_avg_understood − outcome_lift so the story adds up. */
  outcome_lift: number | null;
  outcome_measured_at: string | null;
  /** Stamped when the note waited 30+ days with no qualifying next session
   *  (course likely ended) — reads as "could not be measured", not "waiting". */
  outcome_unmeasurable_at: string | null;
  human_verdict: 'tried_helped' | 'tried_no_change' | 'not_tried' | null;
  human_verdict_at: string | null;
}

/** Student-confirmed resolution aggregate for one note (fn_scf_note_resolution_counts).
 *  The fn enforces a k>=3 floor — a note with fewer than 3 votes returns NO row, so
 *  staff can never reconstruct an individual learner's answer from a tiny class. */
export interface NoteResolutionCounts {
  suggestion_id: string;
  better: number;
  same: number;
  worse: number;
  total: number;
}

/** One facilitator's work-evidenced presence signals over a range
 *  (fn_scf_facilitator_pulse — leadership-gated aggregate). Presence signals
 *  only: no understanding scores, no ranks. */
export interface FacilitatorPulseRow {
  faculty_email: string;
  faculty_name: string;
  institution_id: string | null;
  sessions_marked: number;
  sessions_witnessed: number;
  pulses_run: number;
  lessons_linked: number;
  notes_received: number;
  verdicts_given: number;
  /** Student Better/Same/Worse answers received on this facilitator's loop
   *  notes — VOLUME ONLY. The split stays behind the k>=3 floor in
   *  fn_scf_note_resolution_counts, never on the board. */
  votes_received: number;
  last_signal_at: string | null;
}

/** The caller's OWN work-signals over the last 30 days (fn_scf_my_pulse —
 *  self-scoped by the caller's email; always exactly one row, zeros when no
 *  signal). Same doctrine as the board: presence signals only, no scores,
 *  no comparisons, no ranks. */
export interface MyPulseRow {
  sessions_marked: number;
  sessions_witnessed: number;
  pulses_run: number;
  lessons_linked: number;
  notes_received: number;
  verdicts_given: number;
  votes_received: number;
  last_signal_at: string | null;
}

/** Signal 8 — marks coverage for one facilitator's planned courses in the
 *  active COE exam cycle. COURSE COMPLETENESS, not a facilitator act: COE
 *  marks are entered by the exam cell (~4 operator accounts; faculty_id never
 *  filled), so this may never be presented as proof the facilitator entered
 *  anything. courses_expected = planned courses COE examines this cycle
 *  (registrations ∪ CIA rows); courses_marks_in = those with CIA entries. */
export interface MarksCoverageRow {
  faculty_email: string;
  courses_expected: number;
  courses_marks_in: number;
}

export interface MarksCoverageResponse {
  configured: boolean;
  session_code: string | null;
  rows: MarksCoverageRow[];
  /** Present (true) only when the planned-code list was truncated server-side
   *  and coverage may undercount — surfaced, never silent. */
  codes_capped?: boolean;
}

// ── Pre-session materials (Rank 3a) — post a link + objective opens trace ──────
// Substrate: 20260801100000_scf_session_resources.sql (session_resource +
// session_resource_open, RLS-on / SECDEF-only). All access is via the four
// fn_scf_*_session_resource / fn_scf_resources_for_session RPCs.

export type SessionResourceKind = 'notebooklm' | 'material' | 'other';

/** One active material for a session, as returned by fn_scf_resources_for_session.
 *  `opened` is the CALLER-learner's own flag; `open_count` is the aggregate number
 *  of distinct learners who opened it (adoption — the Senior Learner sees this
 *  count only, never who). */
export interface SessionResourceRow {
  id: string;
  kind: SessionResourceKind;
  title: string;
  url: string;
  posted_at: string;
  opened: boolean;
  open_count: number;
}

/** The row returned by fn_scf_post_session_resource (the inserted material). */
export interface PostedSessionResource {
  id: string;
  institution_id: string | null;
  timetable_id: string;
  attendance_date: string;
  period_id: string;
  course_id: string | null;
  kind: SessionResourceKind;
  title: string;
  url: string;
  posted_by: string;
  posted_at: string;
  is_active: boolean;
}

export interface PostSessionResourceInput {
  timetableId: string;
  attendanceDate: string;
  periodId: string;
  /** Defaults to 'notebooklm' server-side when omitted. */
  kind?: SessionResourceKind;
  title: string;
  url: string;
}

// ── Clarification requests (Lane C, CARRE evidence instrumentation) ───────────
// Substrate: 20260725133000_session_clarification_requests.sql. The learner's
// OWN trace of "I asked for a re-explanation of this session" and — self-
// reported by the SAME learner — what happened. Writes only via the two RPCs.

export type ClarificationOutcome =
  | 'pending'
  | 're_explained'
  | 'refused'
  | 'unanswered'
  /** The "did it help?" follow-up's honest "Not really" — covered again but it
   *  did not land ('refused' means the lead refused: a different fact). */
  | 'not_helped'
  /** System-only (fn_clarification_term_close): the term ended without a
   *  report. Excluded from all rates, counted against no one. Never client-
   *  writable — the RPC rejects it from learners. */
  | 'term_ended_unreported';

/** The subset a learner may self-report (fn_clarification_outcome). */
export type ReportableClarificationOutcome = Exclude<
  ClarificationOutcome,
  'pending' | 'term_ended_unreported'
>;

// ── Two-sided close (spec: clarification-act-two-sided-close-2026-07-30) ─────
// The Senior Learner records the ACT; the learner keeps the VERDICT. Acts are
// CONTEXT, NEVER EVIDENCE — recording one cannot improve any score anywhere.

export type ClarificationActType =
  | 're_explained_in_session'
  | 'helped_one_on_one'
  | 'shared_material'
  | 'planned_next_session';

/** Result of fn_scf_clarification_act — defensive, never a thrown error. */
export interface ClarificationActResult {
  success: boolean;
  reason?: string;
  acts?: number;
  last_act_type?: ClarificationActType | null;
  last_acted_at?: string | null;
  open_after_act?: boolean;
}

/** The one "did it help?" follow-up due for the calling learner
 *  (fn_clarification_followup_pending — oldest pending ask with a newer act). */
export interface ClarificationFollowupAsk {
  attendance_date: string;
  period_id: string;
  course_code: string | null;
  course_name: string | null;
  asked_on: string;
  act_type: ClarificationActType;
  acted_on: string;
  note: string | null;
}

export interface ClarificationRequestRow {
  id: string;
  institution_id: string;
  student_id: string;
  attendance_date: string;
  period_id: string;
  course_code: string | null;
  asked_at: string;
  outcome: ClarificationOutcome;
  outcome_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One session's re-explanation asks, for the Senior Learner who led it
 *  (fn_scf_clarification_sessions_for_me, last 30 IST days). COUNT-ONLY by
 *  construction: a date, a timetable slot key, a course label and integers —
 *  the RPC never returns who asked, and never a timestamp finer than the date.
 *  `still_open` counts asks the learner has not yet reported back on.
 *
 *  The `*_30d` fields are UNBOUNDED 30-day totals repeated on every row: the
 *  row list is capped at 50 sessions, so summing the rows would under-report a
 *  heavy teaching load. Headline figures must read these, never a row sum. */
export interface ClarificationSessionCountsRow {
  attendance_date: string;      // 'YYYY-MM-DD'
  period_id: string;            // timetable slot key — a session, not a person
  course_code: string;          // '—' when the session carries none
  course_name: string | null;
  asks: number;
  still_open: number;
  re_explained: number;
  refused: number;
  unanswered: number;
  /** Learners who said the revisit did not land ("Not really"). Mismatch
   *  substrate — rendered help-first, never accusatory. */
  not_helped: number;
  /** The lead's OWN act state for this session (two-sided close). Context,
   *  never evidence. `open_after_act` = a pending ask is NEWER than the latest
   *  act, so the session-row is honestly open again (spec decision 5). */
  acts: number;
  last_act_type: ClarificationActType | null;
  last_acted_at: string | null;
  open_after_act: boolean;
  /** Every attributed ask in the last 30 days, ignoring the 50-row cap. */
  asked_30d: number;
  /** Of those, still awaiting the learner's own outcome report. */
  still_open_30d: number;
}
