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
