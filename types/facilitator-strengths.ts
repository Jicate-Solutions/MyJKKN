// types/facilitator-strengths.ts
// SCF learning-facilitator STRENGTHS board — shared types. Mirrors the RPC
// contract in supabase/migrations/20260630191000_scf_facilitator_strengths.sql.
// The positive mirror of FacilitatorCoverageRow (types/session-feedback.ts).

/** One learning facilitator's standout teaching patterns in a window.
 *  fn_scf_facilitator_strengths(p_from, p_to).
 *
 *  Source: scf_ai_suggestions rows with kind='success' — aggregate "what worked,
 *  replicate it" patterns the learn-from-positive loop generates from windows that
 *  scored highly on understanding (avg >= 4.5 with comments). Carries NO per-student
 *  feedback content. faculty_email is the facilitator key (the only one the source
 *  table stores); facilitator_name/designation/department_name are resolved from
 *  `staff` by email and may be null when no staff row matches. */
export interface FacilitatorStrengthRow {
  institution_id: string | null;
  institution_name: string | null;
  faculty_email: string;
  facilitator_name: string | null;
  designation: string | null;
  department_name: string | null;
  /** Count of kind='success' patterns whose teaching window overlaps the period. */
  success_patterns: number;
  /** Distinct course codes those success patterns came from. */
  courses: string[];
  course_count: number;
  /** Avg input_avg_understood across the success rows (1..5; >= 4.5 by the gate). */
  avg_understood: number | null;
  /** Context for the highlight below — the most-recent success pattern's course. */
  latest_course_code: string | null;
  /** The most-recent pattern's `whatWorked` one-liner. */
  latest_what_worked: string | null;
  /** The most-recent pattern's `shareWithPeers` note (the board's call-to-action). */
  latest_share_with_peers: string | null;
  /** When the most-recent success pattern was captured (ISO timestamp). */
  latest_generated_at: string | null;
}
