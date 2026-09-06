// types/proof-record.ts
// Verified Skills Record ("My Proof") — shapes returned by fn_vsr_my_record /
// fn_vsr_shared_record (JSONB) plus the app-layer marks overlay.
// Spec: specs/verified-learner-transcript-spec-2026-07-14.md

export interface ProofLearnerHeader {
  name: string | null;
  register_number: string | null;
  roll_number: string | null;
  program: string | null;
  institution: string | null;
  institution_id: string | null;
}

/** Days marked absent that an approved tournament or on-duty permission
 *  excuses. Optional because a record generated before the protection change
 *  simply has no such key — those records read exactly as they always did. */
export type ProofProtectedDays = number | null | undefined;

export interface ProofAttendanceCourse {
  course_code: string | null;
  course_name: string | null;
  /** Days marked present in session. NOT the numerator of `pct`. */
  present: number;
  protected?: ProofProtectedDays;
  total: number;
  /** (present + protected) / total — the same rule the Registrar's audit and
   *  the learner's own card use, and the same rule `overall.pct` uses. */
  pct: number | null;
  first_session: string | null;
  last_session: string | null;
}

export interface ProofAttendance {
  verified: boolean;
  courses: ProofAttendanceCourse[];
  /** Sums of the per-course figures — including `protected`, so the overall
   *  percentage counts exactly the days the per-course percentages count. One
   *  document, one attendance rule. */
  overall: {
    present: number;
    protected?: ProofProtectedDays;
    total: number;
    pct: number | null;
  };
}

export interface ProofEngagement {
  verified: boolean;
  total_checkins: number;
  prompt_checkins: number;
  active_days: number;
  courses_covered: number;
  first_day: string | null;
  last_day: string | null;
  rating_levels_used: number;
  concerns_raised: number;
}

export interface ProofHealth {
  window_days: number;
  min_active_days: number;
  attendance: { healthy: boolean; active_days: number };
  engagement: { healthy: boolean; active_days: number };
}

export interface ProofDispute {
  id: string;
  section: ProofDisputeSection;
  detail: string;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  resolution_note: string | null;
}

export type ProofDisputeSection = 'attendance' | 'engagement' | 'marks' | 'profile' | 'other';

export interface ProofSelfClaims {
  label: string;
  items: unknown[];
}

/** What fn_vsr_my_record returns (learner's own view). */
export interface ProofRecord {
  learner: ProofLearnerHeader;
  generated_at: string;
  health: ProofHealth;
  /** null = section hidden by the college data health gate (never blank-damning). */
  attendance: ProofAttendance | null;
  engagement: ProofEngagement | null;
  durable_skills: null; // phase 2 — never faked in phase 1
  self_claims: ProofSelfClaims;
  disputes: ProofDispute[];
}

/** What fn_vsr_shared_record returns (employer view — health/disputes stripped). */
export interface SharedProofRecord {
  learner: ProofLearnerHeader;
  generated_at: string;
  attendance: ProofAttendance | null;
  engagement: ProofEngagement | null;
  durable_skills: null;
  self_claims: ProofSelfClaims;
  shared: { issued_at: string; expires_at: string; label: string | null };
}

// ── Marks overlay (app layer — COE + exam-audit provenance verdicts) ─────────

export type ProofMarksStatus =
  | 'verified' // program's latest exam-audit verdict passed provenance
  | 'unverified' // marks exist but the program verdict did not pass
  | 'pending' // no verdict snapshot yet (weekly audit has not graded this program)
  | 'empty' // no internal-assessment rows exist for this learner
  | 'unavailable'; // COE unreachable / institution unmapped

export interface ProofMarksCourse {
  course_code: string | null;
  course_name: string | null;
  total: number | null;
  max: number | null;
  pct: number | null;
}

export interface ProofMarksSession {
  session_name: string | null;
  courses: ProofMarksCourse[];
}

export interface ProofMarksLayer {
  status: ProofMarksStatus;
  /** The exam-audit verdict backing the status (e.g. faculty_continuous). */
  program_verdict: string | null;
  sessions: ProofMarksSession[];
}

export interface ProofSharePanel {
  sharing_enabled: boolean;
  has_viewed: boolean;
  open_disputes: number;
  tokens: ProofShareToken[];
}

export interface ProofShareToken {
  id: string;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
}

/** GET /api/proof-record response. */
export interface ProofRecordResponse {
  record: ProofRecord | null;
  marks: ProofMarksLayer;
  share: ProofSharePanel | null;
}
