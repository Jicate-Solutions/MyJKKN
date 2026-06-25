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
 *  plus a derived `improved` boolean (did the class do better next time) — never a raw
 *  class average. `improved` is null when there is no next session yet OR responses are
 *  below the k>=3 anonymity floor on either session. */
export interface MyImpactRow {
  attendance_date: string;
  course_code: string | null;
  course_name: string | null;
  my_understood: number;          // the learner's own 1..5 rating for that session
  flagged: boolean;               // my_understood <= 2
  next_attendance_date: string | null;
  improved: boolean | null;       // class avg rose next time; null = awaiting / masked
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
}
