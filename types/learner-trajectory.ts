// types/learner-trajectory.ts
// SCF → PER-LEARNER UNDERSTANDING TRAJECTORY / at-risk early warning (#3a) types.
// Mirrors fn_scf_learner_trajectory in
// supabase/migrations/20260630202000_scf_learner_trajectory.sql.
//
// PRIVACY: this row carries a DERIVED trend (slope) + identity + an at_risk flag only.
// It NEVER carries any raw `understood` value (the candid per-session rating stays
// private to the learner). See the migration header for the full anonymity rationale.

/** One sliding learner's trajectory for one course (an early-warning row).
 *  The list returns only learners whose understanding is declining
 *  (slope <= the RPC's threshold), worst-decline + at-risk first. */
export interface LearnerTrajectoryRow {
  institution_id: string;
  institution_name: string | null;
  student_id: string;
  learner_name: string | null;
  register_number: string | null;
  department_name: string | null;
  course_code: string;
  /** How many of the learner's OWN feedback rows fed the trend (>= 3, the privacy floor). */
  sessions: number;
  /** understood points gained/lost per SESSION (negative = sliding). Derived, not a rating. */
  slope: number;
  /** Sliding AND recently struggling (avg of the learner's two most recent sessions < 3).
   *  The recent average itself is computed server-side only and never returned. */
  at_risk: boolean;
  first_session: string;
  last_session: string;
}
