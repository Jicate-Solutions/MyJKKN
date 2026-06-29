// lib/services/induction/induction-service.ts
// Fresher Induction — client-side service (browser supabase + RLS/RPC).
// Mirrors the SessionFeedbackService / PDEService pattern (static methods over
// getSupabase()). Privileged writes flow through the SECURITY DEFINER engine
// RPCs in 20260627170000_induction_phase1_engine_rpcs.sql (anon-revoked,
// auth+permission gated internally). Spec: specs/induction-program-module-2026-06-27.md
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

export interface CreateInductionInput {
  institutionId: string;
  academicYearId: string | null;
  name: string;
  startDate: string; // ISO
  endDate: string;   // ISO
  venueText?: string;
  description?: string | null;
}

export class InductionService {
  /** Create the induction (events row event_type='induction' + satellite). Returns event_id. */
  static async createProgram(input: CreateInductionInput): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_create_program', {
      p_institution_id: input.institutionId,
      p_academic_year_id: input.academicYearId,
      p_name: input.name,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_venue_text: input.venueText ?? 'Campus',
      p_description: input.description ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Auto-enroll the joining cohort (first-years + laterals). Returns count enrolled. */
  static async autoEnroll(eventId: string): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_auto_enroll', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Auto-split enrollees into N batches by department. Returns learners assigned. */
  static async autoSplitBatches(eventId: string, numBatches = 2): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_auto_split_batches', {
      p_event_id: eventId,
      p_num_batches: numBatches,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  // ── Session authoring (event_sessions, via gated DEFINER RPCs) ──────────────

  /** List sessions for an induction (coordinator: all; student: their batch + combined). */
  static async listSessions(eventId: string): Promise<InductionSessionRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_list_sessions', { p_event_id: eventId });
    if (error) throw error;
    return (data as InductionSessionRow[]) ?? [];
  }

  /** Insert (sessionId null) or update a session. Returns the session id. */
  static async upsertSession(input: UpsertSessionInput): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_upsert_session', {
      p_event_id: input.eventId,
      p_session_id: input.sessionId ?? null,
      p_day_number: input.dayNumber ?? null,
      p_batch_id: input.batchId ?? null,
      p_start_at: input.startAt,
      p_end_at: input.endAt,
      p_title: input.title,
      p_description: input.description ?? null,
      p_venue_text: input.venueText ?? null,
      p_speaker_text: input.speakerText ?? null,
      p_outcome_text: input.outcomeText ?? null,
      p_resource_links: input.resourceLinks ?? [],
      p_session_order: input.sessionOrder ?? 1,
    });
    if (error) throw error;
    return data as string;
  }

  /** Delete a session. */
  static async deleteSession(sessionId: string): Promise<boolean> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_delete_session', { p_session_id: sessionId });
    if (error) throw error;
    return (data as boolean) ?? false;
  }

  // ── Attendance (roster marking + completion rollup, via gated DEFINER RPCs) ──

  /** Roster for a session — enrolled learners (of the session's batch) + current mark. */
  static async getSessionRoster(sessionId: string): Promise<RosterRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_session_roster', { p_session_id: sessionId });
    if (error) throw error;
    return (data as RosterRow[]) ?? [];
  }

  /** Bulk mark attendance; recomputes completion. Returns rows marked. */
  static async markAttendance(sessionId: string, marks: AttendanceMark[]): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_mark_attendance', {
      p_session_id: sessionId,
      p_marks: marks,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  // ── Per-session feedback (value signal; student submit + coordinator summary) ──

  /** Student submits/updates their 1–5 rating (+ comment) for a session. Returns feedback id. */
  static async submitFeedback(sessionId: string, rating: number, comment?: string | null): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_feedback', {
      p_session_id: sessionId,
      p_rating: rating,
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Coordinator: per-session avg rating + response count. */
  static async getSessionFeedbackSummary(eventId: string): Promise<SessionFeedbackSummary[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_session_feedback_summary', { p_event_id: eventId });
    if (error) throw error;
    return (data as SessionFeedbackSummary[]) ?? [];
  }

  // ── Student-facing reads (the fresher's "my induction") ─────────────────────

  /** The calling learner's induction enrollment(s) + completion rollup + profile
   *  snapshot. Empty when the caller isn't a learner / isn't enrolled. */
  static async myEnrollments(): Promise<MyInductionEnrollment[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_enrollments');
    if (error) throw error;
    return (data as MyInductionEnrollment[]) ?? [];
  }

  /** The caller's OWN prior per-session ratings for one induction (pre-fill). */
  static async myFeedback(eventId: string): Promise<MyInductionFeedback[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_feedback', { p_event_id: eventId });
    if (error) throw error;
    return (data as MyInductionFeedback[]) ?? [];
  }

  // ── Scorecard (coordinator/leadership funnel + joins-vs-vacancy; NAAC evidence) ──

  /** One induction's value→advocacy→referred→submitted→JOINED funnel, broken out
   *  by department + batch + a program total. Coordinator scope. `joined` is LIVE. */
  static async getScorecard(eventId: string): Promise<ScorecardRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_scorecard', { p_event_id: eventId });
    if (error) throw error;
    return (data as ScorecardRow[]) ?? [];
  }

  /** Cross-college funnel + joins-vs-vacancy for an academic year (one college,
   *  or all the caller may access when institutionId is omitted). Leadership scope. */
  static async getLeadershipScorecard(
    academicYearId: string,
    institutionId?: string | null,
  ): Promise<LeadershipScorecardRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_scorecard_leadership', {
      p_academic_year_id: academicYearId,
      p_institution_id: institutionId ?? null,
    });
    if (error) throw error;
    return (data as LeadershipScorecardRow[]) ?? [];
  }

  /** Record/refresh this induction as NAAC Criterion 5 + 7 evidence in the canonical
   *  quality_evidence_mappings junction (with the live rollup in metadata). Returns
   *  the number of evidence rows upserted (2). Coordinator action (induction.manage). */
  static async emitNaacEvidence(eventId: string): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_emit_naac_evidence', { p_event_id: eventId });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  // ── Phase 4: referral + advocacy (the value→advocacy→refer→join funnel) ──────

  /** Refer a prospect into the admission funnel (source='referral', referral_type
   *  ='learner', referred_by_id=me). Recomputes the effort gate. */
  static async submitReferral(eventId: string, input: ReferralInput): Promise<SubmitReferralResult> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_referral', {
      p_event_id: eventId,
      p_first_name: input.firstName,
      p_phone: input.phone,
      p_last_name: input.lastName ?? null,
      p_email: input.email ?? null,
      p_program_id: input.programId ?? null,
      p_note: input.note ?? null,
    });
    if (error) throw error;
    return data as SubmitReferralResult;
  }

  /** The fresher's own referrals + live join status. */
  static async myReferrals(eventId: string): Promise<MyInductionReferral[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_referrals', { p_event_id: eventId });
    if (error) throw error;
    return (data as MyInductionReferral[]) ?? [];
  }

  /** End-of-induction advocacy / NPS (0–10) → induction_completion.advocacy_score. */
  static async submitAdvocacy(eventId: string, score: number): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_advocacy', {
      p_event_id: eventId,
      p_score: score,
    });
    if (error) throw error;
    return data as number;
  }

  /**
   * The induction loop's current playbook for a cohort (+ its adoption verdict),
   * or null if the generator hasn't produced one yet. Browser read — RLS scopes
   * scf_ai_suggestions induction rows to super/admin/institution.
   */
  static async getLoopPlaybook(
    institutionId: string,
    academicYearId: string,
  ): Promise<InductionLoopPlaybook | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('scf_ai_suggestions')
      .select(
        'suggestion, human_verdict, input_avg_understood, outcome_avg_understood, outcome_lift, generated_at',
      )
      .eq('domain', 'induction')
      .eq('institution_id', institutionId)
      .eq('academic_year_id', academicYearId)
      .maybeSingle();
    if (error) throw error;
    return (data as InductionLoopPlaybook | null) ?? null;
  }

  /**
   * Record whether the coordinator ADOPTED / partially adopted / IGNORED the
   * cohort's playbook. This is the loop's counterfactual arm: ignored cohorts are
   * the control that lets the year-over-year lift be falsified (drift vs causal).
   * Manager-gated inside the SECURITY DEFINER RPC (induction.manage + inst access).
   */
  static async setPlaybookVerdict(
    institutionId: string,
    academicYearId: string,
    verdict: 'adopted' | 'partial' | 'ignored',
  ): Promise<boolean> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_set_playbook_verdict', {
      p_institution_id: institutionId,
      p_academic_year_id: academicYearId,
      p_verdict: verdict,
    });
    if (error) throw error;
    return data as boolean;
  }
}

export interface InductionLoopPlaybook {
  suggestion: Record<string, unknown> | null;
  human_verdict: 'adopted' | 'partial' | 'ignored' | null;
  input_avg_understood: number | null;
  outcome_avg_understood: number | null;
  outcome_lift: number | null;
  generated_at: string;
}

export interface SessionFeedbackSummary { session_id: string; avg_rating: number; response_count: number; }

/** One row of fn_induction_scorecard — a funnel slice (total / a department / a batch). */
export interface ScorecardRow {
  dimension: 'total' | 'department' | 'batch';
  group_id: string | null;
  group_label: string;
  enrolled: number;
  value_rated: number;
  value_avg: number | null;
  advocacy_given: number;
  advocacy_avg: number | null;
  promoters: number;
  referred: number;
  referrals_submitted: number;
  referrals_joined: number;
}

/** One row of fn_induction_scorecard_leadership — a college's funnel + joins-vs-vacancy. */
export interface LeadershipScorecardRow {
  institution_id: string;
  institution_name: string;
  inductions: number;
  enrolled: number;
  value_avg: number | null;
  advocacy_avg: number | null;
  promoters: number;
  referred: number;
  referrals_submitted: number;
  referrals_joined: number;
  vacant_seats: number;
  joins_vs_vacancy_pct: number | null;
}

export interface MyInductionEnrollment {
  event_id: string;
  event_name: string;
  institution_id: string;
  institution_name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  batch_id: string | null;
  batch_label: string | null;
  sessions_total: number;
  sessions_attended: number;
  attendance_pct: number;
  participation_complete: boolean;
  value_score_avg: number | null;
  advocacy_score: number | null;
  is_profile_complete: boolean;
  profile_fields_total: number;
  profile_fields_filled: number;
}

export interface MyInductionFeedback {
  session_id: string;
  rating: number;
  comment: string | null;
}

export interface ReferralInput {
  firstName: string;
  phone: string;
  lastName?: string | null;
  email?: string | null;
  programId?: string | null;
  note?: string | null;
}

export interface SubmitReferralResult {
  lead_id: string;
  action: 'created' | 'duplicate';
  referrals_submitted: number;
  outcome_complete: boolean;
}

export interface MyInductionReferral {
  lead_id: string;
  full_name: string | null;
  phone: string | null;
  program_id: string | null;
  funnel_stage: string | null;
  joined: boolean;
  submitted_at: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'od';
export interface AttendanceMark { learner_id: string; status: AttendanceStatus; }
export interface RosterRow {
  learner_id: string;
  name: string;
  register_number: string | null;
  batch_label: string | null;
  status: AttendanceStatus | null;
}

export interface ResourceLink { label: string; url: string; }

export interface InductionSessionRow {
  id: string;
  day_number: number | null;
  session_order: number | null;
  batch_id: string | null;
  batch_label: string | null;
  start_at: string;
  end_at: string;
  title: string;
  description: string | null;
  venue_text: string | null;
  speaker_text: string | null;
  outcome_text: string | null;
  resource_links: ResourceLink[];
  status: string | null;
}

export interface UpsertSessionInput {
  eventId: string;
  sessionId?: string | null;
  dayNumber?: number | null;
  batchId?: string | null;
  startAt: string; // ISO
  endAt: string;   // ISO
  title: string;
  description?: string | null;
  venueText?: string | null;
  speakerText?: string | null;
  outcomeText?: string | null;
  resourceLinks?: ResourceLink[];
  sessionOrder?: number | null;
}
