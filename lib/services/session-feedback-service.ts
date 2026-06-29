// lib/services/session-feedback-service.ts
// Post-class feedback — client-side service (browser supabase + RLS/RPC).
// Mirrors the PDEService pattern (static methods over getSupabase()).
// All writes + privileged reads flow through the SECURITY DEFINER RPCs in
// 20260615233000_session_feedback_substrate.sql.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  SessionFeedbackRow,
  PendingSession,
  CarryforwardItem,
  ConfirmationStatusRow,
  FacultySummaryRow,
  FacultyCompletionRow,
  PendingRosterRow,
  EscalationRow,
  EscalationFollowupRow,
  FacultyFollowupRow,
  MyImpactRow,
  AdminCollegeSummaryRow,
  AdminFacultySummaryRow,
  AdminTrendRow,
  FacilitatorCoverageRow,
  ChecklistConfigItem,
  SubmitFeedbackInput,
  LivePulseRow,
  OpenPulseForLearner,
  PulseTotals,
} from '@/types/session-feedback';

// Untyped client — session_feedback tables are not in the generated types yet.
const getSupabase = (): any => createClientSupabaseClient();

export class SessionFeedbackService {
  /** Active checklist config: institution overrides shadow platform defaults by item_key. */
  static async getChecklistConfig(institutionId?: string | null): Promise<ChecklistConfigItem[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('session_feedback_checklist_config')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw new Error(`Failed to load checklist config: ${error.message}`);
    const rows = (data || []) as ChecklistConfigItem[];
    // Prefer an institution-specific item over the platform default of the same key.
    const byKey = new Map<string, ChecklistConfigItem>();
    for (const r of rows) {
      const existing = byKey.get(r.item_key);
      if (!existing || (r.institution_id && institutionId && r.institution_id === institutionId)) {
        byKey.set(r.item_key, r);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.sort_order - b.sort_order);
  }

  /** Sessions the learner attended (Present) but hasn't given feedback for. */
  static async getPending(lookbackDays = 30): Promise<PendingSession[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_pending_for_learner', {
      p_lookback_days: lookbackDays,
    });
    if (error) throw new Error(`Failed to load pending sessions: ${error.message}`);
    return (data || []) as PendingSession[];
  }

  /** Carry-forward re-asks: prior same-course sessions the learner flagged, for their
   *  current pending sessions. Powers the "better this time?" banner in the dialog. */
  static async getCarryforward(lookbackDays = 30): Promise<CarryforwardItem[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_carryforward_for_learner', {
      p_lookback_days: lookbackDays,
    });
    if (error) throw new Error(`Failed to load carry-forward: ${error.message}`);
    return (data || []) as CarryforwardItem[];
  }

  /** Per-session confirmation state (present-pending vs confirmed) in a date range. */
  static async getConfirmationStatus(from: string, to: string): Promise<ConfirmationStatusRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_confirmation_status', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load confirmation status: ${error.message}`);
    return (data || []) as ConfirmationStatusRow[];
  }

  /** Submit (or update) feedback for a session. The only write path.
   *  source defaults to 'async'; pass 'live_poll' for in-class Live Pulse answers
   *  (the RPC downgrades to 'async' if no pulse is open for the class). */
  static async submitFeedback(input: SubmitFeedbackInput): Promise<SessionFeedbackRow> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_submit_feedback', {
      p_attendance_date: input.attendanceDate,
      p_timetable_id: input.timetableId,
      p_period_id: input.periodId,
      p_understood: input.understood,
      p_checklist: input.checklist ?? {},
      p_free_text: input.freeText ?? null,
      p_source: input.source ?? 'async',
    });
    if (error) throw new Error(`Failed to submit feedback: ${error.message}`);
    return data as SessionFeedbackRow;
  }

  /** Anonymized aggregate over the caller faculty's own sessions. */
  static async getFacultySummary(from: string, to: string): Promise<FacultySummaryRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_faculty_summary', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load faculty summary: ${error.message}`);
    return (data || []) as FacultySummaryRow[];
  }

  /** Coverage per faculty session: how many Present students gave feedback (counts only). */
  static async getFacultyCompletion(from: string, to: string): Promise<FacultyCompletionRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_faculty_completion', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load faculty completion: ${error.message}`);
    return (data || []) as FacultyCompletionRow[];
  }

  /** Names of Present students who haven't submitted, for ONE session (identity only — never content).
   *  The RPC raises unless the caller is the assigned faculty for that session. */
  static async getPendingRoster(
    attendanceDate: string,
    timetableId: string,
    periodId: string,
  ): Promise<PendingRosterRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_faculty_pending_roster', {
      p_attendance_date: attendanceDate,
      p_timetable_id: timetableId,
      p_period_id: periodId,
    });
    if (error) throw new Error(`Failed to load pending roster: ${error.message}`);
    return (data || []) as PendingRosterRow[];
  }

  /** Institution sessions breaching the understanding threshold (Principal view). */
  static async getEscalations(from: string, to: string): Promise<EscalationRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_principal_escalations', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load escalations: ${error.message}`);
    return (data || []) as EscalationRow[];
  }

  /**
   * Escalated sessions paired with the next same-faculty+course session and the
   * understanding "lift" (Principal outer-loop view). Mirrors getEscalations'
   * security model (RPC raises for non-authorized callers).
   */
  static async getEscalationFollowups(
    from: string,
    to: string,
  ): Promise<EscalationFollowupRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_escalation_followups', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load escalation follow-ups: ${error.message}`);
    return (data || []) as EscalationFollowupRow[];
  }

  /**
   * The caller faculty's OWN low-understanding sessions paired with the next
   * same-course session + lift (B1 — "topics to revisit"). Self-scoped clone of
   * getEscalationFollowups: same row shape, but the RPC filters to the caller's
   * own taught sessions (no role gate), so any faculty can call it.
   */
  static async getFacultyFollowups(
    from: string,
    to: string,
  ): Promise<FacultyFollowupRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_faculty_followups', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load your topics to revisit: ${error.message}`);
    return (data || []) as FacultyFollowupRow[];
  }

  /**
   * The learner's private "your voice this term" receipt (C3): their own feedback
   * rows + whether each flagged session's class improved next time. Returns only a
   * derived `improved` boolean (k>=3 floor) — never another learner's data.
   */
  static async getMyImpact(from: string, to: string): Promise<MyImpactRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_my_impact', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load your feedback receipt: ${error.message}`);
    return (data || []) as MyImpactRow[];
  }

  /**
   * Self-improving loop — the HUMAN verdict channel. Records the teacher's own
   * read on whether an AI suggestion actually helped, against the recorded
   * suggestion row (id returned by the ai-suggest-improvement route). This is the
   * signal fn_scf_prior_suggestion feeds back into the next prompt — without it,
   * human_verdict is always null. fn_scf_set_verdict is SECURITY DEFINER and
   * authorizes the caller against the suggestion's own scope, so a faculty can
   * only verdict their own suggestions. Returns true when the verdict was applied.
   */
  static async setSuggestionVerdict(
    suggestionId: string,
    verdict: 'tried_helped' | 'tried_no_change' | 'not_tried',
  ): Promise<boolean> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_set_verdict', {
      p_suggestion_id: suggestionId,
      p_verdict: verdict,
    });
    if (error) throw new Error(`Failed to save your verdict: ${error.message}`);
    return data === true;
  }

  // ---------------------------------------------------------------------------
  // Super-admin / institution-leadership all-college dashboard (aggregates only).
  // The RPCs raise for non-authorized callers; all three return ONLY aggregates
  // (counts/averages) — never per-student feedback content.
  // ---------------------------------------------------------------------------

  /** Per-college submission + completion picture within scope. */
  static async getAdminCollegeSummary(
    from: string,
    to: string,
  ): Promise<AdminCollegeSummaryRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_admin_college_summary', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load college summary: ${error.message}`);
    return (data || []) as AdminCollegeSummaryRow[];
  }

  /** Per-faculty summary (worst understanding first) within scope. */
  static async getAdminFacultySummary(
    from: string,
    to: string,
  ): Promise<AdminFacultySummaryRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_admin_faculty_summary', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load faculty summary: ${error.message}`);
    return (data || []) as AdminFacultySummaryRow[];
  }

  /** Per-day understanding trend within scope. */
  static async getAdminTrend(from: string, to: string): Promise<AdminTrendRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_admin_trend', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load understanding trend: ${error.message}`);
    return (data || []) as AdminTrendRow[];
  }

  /** Per-learning-facilitator FEEDBACK coverage: (distinct taught sessions with >=1
   *  feedback) / (distinct taught sessions). Drivers first, 0% non-drivers last.
   *  Denominator comes from student_attendance, so facilitators who taught but got
   *  no feedback surface at 0% — invisible to the session_feedback-only summaries. */
  static async getFacilitatorFeedbackCoverage(
    from: string,
    to: string,
  ): Promise<FacilitatorCoverageRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_facilitator_feedback_coverage', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load facilitator coverage: ${error.message}`);
    return (data || []) as FacilitatorCoverageRow[];
  }

  // ---------------------------------------------------------------------------
  // Live Pulse Check — a live in-class poll over the SAME write path. Each
  // student answer is a normal submitFeedback({ source: 'live_poll' }); these
  // RPCs add only the live lifecycle + the teacher's anonymized totals.
  // ---------------------------------------------------------------------------

  /** Teacher (assigned faculty) or an HOD/admin of the class's institution opens a
   *  live pulse for a class. Idempotent — returns the already-open pulse if one exists. */
  static async openPulse(
    attendanceDate: string,
    timetableId: string,
    periodId: string,
  ): Promise<LivePulseRow> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_open_pulse', {
      p_attendance_date: attendanceDate,
      p_timetable_id: timetableId,
      p_period_id: periodId,
    });
    if (error) throw new Error(`Failed to open pulse: ${error.message}`);
    return data as LivePulseRow;
  }

  /** Open pulses for sessions the caller learner was marked Present in. */
  static async getOpenPulsesForLearner(): Promise<OpenPulseForLearner[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_open_pulse_for_learner');
    if (error) throw new Error(`Failed to load open pulses: ${error.message}`);
    return (data || []) as OpenPulseForLearner[];
  }

  /** Anonymized live totals for ONE pulse (the pulse's faculty, or an HOD/admin of
   *  that institution). Returns a single row, or null if the pulse is unknown. */
  static async getPulseTotals(pulseId: string): Promise<PulseTotals | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_pulse_totals', {
      p_pulse_id: pulseId,
    });
    if (error) throw new Error(`Failed to load pulse totals: ${error.message}`);
    const rows = (data || []) as PulseTotals[];
    return rows.length > 0 ? rows[0] : null;
  }
}
