// types/scf-learner-loop.ts
// SCF self-improving loop · LEARNER LANE types (#2 trigger + #3b loop-closure).
// Kept OUT of the orchestrator-owned types/session-feedback.ts so the lanes don't collide.
// Shapes mirror the RETURNS TABLE of the two learner-scoped RPCs added in
// 20260630181000_scf_loop_closure_for_learner.sql and
// 20260630182000_scf_downward_trend_for_learner.sql.

/** fn_scf_loop_closure_for_learner — one row per flagged class the learner's feedback moved.
 *  HONESTY: my_prior_understood / my_next_understood / my_delta are THIS learner's own 1..5
 *  ratings. cohort_lift is a CLASS-WIDE mean — render only with an explicit "across the class"
 *  label, never as the learner's number. */
export interface LoopClosureRow {
  attendance_date: string;            // 'YYYY-MM-DD' — the flagged class
  course_code: string;
  course_name: string | null;
  my_prior_understood: number;        // the learner's own rating in the flagged class (1..2)
  input_theme: string[];              // checklist item_keys they left false (UI maps key -> label)
  the_change: string | null;          // what the facilitator was advised / did (suggestion summary)
  action_kind: 'verdict_worked' | 'suggestion_issued' | null;
  action_date: string | null;        // 'YYYY-MM-DD' when the suggestion was generated
  cohort_lift: number | null;         // class-wide mean lift — secondary, explicitly labelled only
  my_next_understood: number | null;  // the learner's own rating in their next same-course session
  my_next_date: string | null;        // 'YYYY-MM-DD'
  my_understanding_rose: boolean;     // my_next_understood > my_prior_understood (the learner's OWN win)
  my_delta: number | null;            // my_next_understood - my_prior_understood (null until a later session)
  suggestion_id: string | null;       // the winning note behind the_change — target for the resolution vote
  my_resolution_vote: 'better' | 'same' | 'worse' | null; // the learner's explicit confirm (null = not yet asked/answered)
}

/** fn_scf_my_struggling_note — the calling learner's most-recent AI-written support note.
 *  Generated server-side by the scf-learner-notes cron for learners on a 3-session downward
 *  trend. The learner sees it ONLY when one exists (no template fallback). The `note` text is
 *  private to the learner; leadership only ever sees that a note was sent, never the wording. */
export interface StrugglingNoteRow {
  course_code: string;
  course_name: string | null;
  note: string;          // the AI-written supportive note (shown to the learner only)
  generated_at: string;  // ISO timestamp the note was generated
  // Nullable: during the deploy→migrate gap the old fn shape omits id — the
  // card gates the tap row on it (deep-review #1902 r2 LOW, honest typing).
  id: string | null;
  reached_out: boolean | null; // the learner's own one-tap follow-up; null = not answered
}

/** The caller's OWN senior peer mentor from their induction group (mentee side).
 *  Used by the support-note card to point at a real person (2026-07-09). */
export interface MyMentorRow {
  mentor_name: string;
}
