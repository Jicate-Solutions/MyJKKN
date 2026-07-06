// types/loop-activity.ts
// SCF self-improving loop → LOOP ACTIVITY PANEL (#4) types.
// Mirrors fn_scf_loop_activity in
// supabase/migrations/20260630201000_scf_loop_activity.sql.
// NOTE: deliberately a NEW file — types/session-feedback.ts is left untouched.

/** One of the 8 most-recent AI suggestions in the loop-activity snapshot.
 *  `summary` is the AI's own one-line coaching text (improvement rows store it under
 *  `summary`, success rows under `whatWorked` — the RPC coalesces the two). It is
 *  advice ABOUT a course, never a learner's words. */
export interface LoopActivityRecentSuggestion {
  id: string;
  course_code: string | null;
  kind: 'improvement' | 'success';
  summary: string;
  /** Measured understanding lift (next session avg − window baseline). null until
   *  measured (improvement rows only; success rows are never lift-graded). */
  outcome_lift: number | null;
  outcome_responses: number | null;
  generated_at: string;
}

/** The loop's vital signs for one window (single jsonb object from fn_scf_loop_activity).
 *  Aggregates + AI coaching summaries only — never per-student feedback content. */
export interface LoopActivity {
  window_from: string;
  window_to: string;
  /** Raw learner signal that came in. total = async + live_poll. */
  total_feedback: number;
  async_feedback: number;       // source='async' (after-class page submissions)
  live_poll_feedback: number;   // source='live_poll' (in-class Live Pulse answers)
  /** Live pulses opened in the window (the in-class poll lifecycle, scf_live_pulse). */
  live_pulses: number;
  /** Per-response low-understanding flags (understood <= 2) — the struggle signal. */
  low_understanding_flags: number;
  /** AI suggestions the loop PRODUCED in the window, split by kind. */
  improvement_suggestions: number;  // generated from low windows ("fix it")
  success_suggestions: number;      // generated from standout windows ("replicate it")
  /** Of the improvement suggestions, how many have a measured outcome + their avg lift.
   *  avg is improvement-only (success baselines sit at the ceiling → meaningless lift). */
  measured_outcomes: number;
  avg_outcome_lift: number | null;
  recent_suggestions: LoopActivityRecentSuggestion[];
}
