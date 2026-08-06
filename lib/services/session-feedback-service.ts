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
  MyConfirmedAttendance,
  PendingVerdictSuggestion,
  MyLoopNote,
  NoteResolutionCounts,
  FacilitatorPulseRow,
  MyPulseRow,
  MarksCoverageResponse,
  FreetextCarryCountsRow,
  SessionResourceRow,
  PostedSessionResource,
  PostSessionResourceInput,
  ClarificationRequestRow,
  ReportableClarificationOutcome,
  ClarificationSessionCountsRow,
  ClarificationActType,
  ClarificationActResult,
  ClarificationFollowupAsk,
} from '@/types/session-feedback';
import { logger } from '@/lib/utils/enhanced-logger';

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

  /** The feedback-window length (hours) from the shared config lever
   *  session_feedback.window_hours — the SAME row every server-side window fn
   *  reads, so the UI hint and the enforcement can't drift apart. The caller's
   *  own institution_id is resolved as the scope so a per-institution override
   *  reads the same row the server enforces with (deep-review #1898 consensus
   *  finding: a global-only read would drift under a tenant override and the
   *  client race-guard would block still-valid submissions). Fail-soft to 48:
   *  the server fns remain the source of truth. */
  static async getFeedbackWindowHours(): Promise<number> {
    const supabase = getSupabase();
    let scopeId: string | null = null;
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user?.id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('institution_id')
          .eq('id', auth.user.id)
          .maybeSingle();
        scopeId = (prof?.institution_id as string | null) ?? null;
      }
    } catch {
      // fall through to the global-scope read
    }
    const { data, error } = await supabase.rpc('fn_get_policy_int', {
      p_key: 'session_feedback.window_hours',
      p_default: 48,
      p_scope_id: scopeId,
    });
    const n = Number(data);
    // <= 0 guards a misconfigured lever (0 would disable every row client-side).
    if (error || data == null || Number.isNaN(n) || n <= 0) return 48;
    return n;
  }

  /** The caller learner's OWN confirmed-attendance snapshot (transparency, #7).
   *  Forward-only; NOT gated on attendance_coupling_enabled — a learner may always see
   *  their own number. Returns null when the caller is not a learner or has no in-scope marks. */
  static async getMyConfirmedAttendance(): Promise<MyConfirmedAttendance | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_my_confirmed_attendance', {});
    if (error) throw new Error(`Failed to load confirmed attendance: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return (row as MyConfirmedAttendance) ?? null;
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

  /** Course-level counts of learners' free-text follow-ups for the CALLER's own
   *  sessions (Senior Learner view). Counts only — never words, never names —
   *  and a course appears ONLY at/above the >=3-distinct-learners privacy floor
   *  (fn_scf_freetext_carry_counts enforces both server-side). */
  static async getFreetextCarryCounts(): Promise<FreetextCarryCountsRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_freetext_carry_counts');
    if (error) throw new Error(`Failed to load follow-up counts: ${error.message}`);
    return (data || []) as FreetextCarryCountsRow[];
  }

  /** Answer one free-text follow-up (Yes/Partly/No; 'Seen' acknowledges praise).
   *  Self-scoped server-side — only the item's own learner can answer it. */
  static async answerFreetextCarry(
    id: string,
    answer: 'Yes' | 'Partly' | 'No' | 'Seen',
  ): Promise<void> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_answer_freetext_carry', {
      p_id: id,
      p_answer: answer,
    });
    if (error) throw new Error(`Could not save your answer: ${error.message}`);
    const result = data as { success?: boolean; error?: string } | null;
    if (result && result.success === false) {
      throw new Error(result.error ?? 'Could not save your answer.');
    }
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

  // ── Clarification requests (Lane C) — ask → self-reported outcome ──────────
  // Substrate: 20260725133000_session_clarification_requests.sql. Reads go via
  // RLS (a learner only ever sees their OWN rows); writes only via the RPCs.

  /** The caller's own clarification request for one session, if any. */
  static async getClarification(
    attendanceDate: string,
    periodId: string,
  ): Promise<ClarificationRequestRow | null> {
    const supabase = getSupabase();
    // Deterministic single row even for broad-RLS viewers (leadership can see
    // several learners' asks for one session — a bare maybeSingle() would
    // throw on >1 row). Learners still only ever see their own row via RLS.
    const { data, error } = await supabase
      .from('session_clarification_requests')
      .select('*')
      .eq('attendance_date', attendanceDate)
      .eq('period_id', periodId)
      .order('asked_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load clarification request: ${error.message}`);
    return (data as ClarificationRequestRow) ?? null;
  }

  /** Record "I asked for a re-explanation of this session" (learner-only;
   *  one per session — a second tap upserts, never duplicates). */
  static async askClarification(
    attendanceDate: string,
    timetableId: string,
    periodId: string,
  ): Promise<ClarificationRequestRow> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_clarification_ask', {
      p_attendance_date: attendanceDate,
      p_timetable_id: timetableId,
      p_period_id: periodId,
    });
    if (error) throw new Error(`Could not record your request: ${error.message}`);
    return data as ClarificationRequestRow;
  }

  /** The SAME learner self-reports what happened after their ask — mirrors the
   *  SCF verdict pattern (this is the learner's own record; nobody else writes it). */
  static async reportClarificationOutcome(
    attendanceDate: string,
    periodId: string,
    outcome: ReportableClarificationOutcome,
  ): Promise<ClarificationRequestRow> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_clarification_outcome', {
      p_attendance_date: attendanceDate,
      p_period_id: periodId,
      p_outcome: outcome,
    });
    if (error) throw new Error(`Could not record what happened: ${error.message}`);
    return data as ClarificationRequestRow;
  }

  /** The read side of Lane C, for the person who LED the sessions: per-session
   *  counts of re-explanation asks over the last 30 days. Self-scoped and
   *  count-only server-side — the RPC cannot return who asked. Decorative
   *  surface: any failure resolves to [] so the card simply doesn't render. */
  static async getMyClarificationSessions(): Promise<ClarificationSessionCountsRow[]> {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_clarification_sessions_for_me');
      if (error) {
        logger.warn('academic/session-feedback', 'clarification session counts load failed', error);
        return [];
      }
      return (data || []) as ClarificationSessionCountsRow[];
    } catch (err) {
      logger.warn('academic/session-feedback', 'clarification session counts load failed', err);
      return [];
    }
  }

  /** Two-sided close, the lead's half: record "I acted on this" against one
   *  session's open asks. The server verifies the caller is the session's
   *  attributed lead via the SHARED attribution view and is DEFENSIVE — it
   *  returns {success:false, reason} instead of throwing, and so does this
   *  method. Acts are CONTEXT, NEVER EVIDENCE (spec decision 4). */
  static async recordClarificationAct(
    attendanceDate: string,
    periodId: string,
    courseCode: string | null,
    actType: ClarificationActType,
    note?: string,
  ): Promise<ClarificationActResult> {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_clarification_act', {
        p_attendance_date: attendanceDate,
        p_period_id: periodId,
        // The card shows '—' for a course-less session; the RPC keys on NULL.
        p_course_code: courseCode && courseCode !== '—' ? courseCode : null,
        p_act_type: actType,
        p_note: note?.trim() ? note.trim().slice(0, 500) : null,
      });
      if (error) {
        logger.warn('academic/session-feedback', 'clarification act not recorded', error);
        return { success: false, reason: 'unavailable' };
      }
      return (data ?? { success: false, reason: 'empty' }) as ClarificationActResult;
    } catch (err) {
      logger.warn('academic/session-feedback', 'clarification act threw', err);
      return { success: false, reason: 'unavailable' };
    }
  }

  /** Two-sided close, the learner's half: the ONE "did it help?" follow-up due
   *  for the caller — their oldest pending ask that has a lead-recorded act
   *  newer than it. Decorative surface: any failure (or the kill switch)
   *  resolves to null and the card simply doesn't render. */
  static async getPendingClarificationFollowup(): Promise<ClarificationFollowupAsk | null> {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_clarification_followup_pending');
      if (error) {
        logger.warn('academic/session-feedback', 'clarification follow-up load failed', error);
        return null;
      }
      const ask = (data as { ask?: ClarificationFollowupAsk | null } | null)?.ask ?? null;
      return ask && ask.attendance_date ? ask : null;
    } catch (err) {
      logger.warn('academic/session-feedback', 'clarification follow-up threw', err);
      return null;
    }
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

  /** Faculty-triggered per-session nudge (PR-B): sends ONE in-app bell to each
   *  Present-but-unconfirmed learner of this session, reusing the canonical
   *  nudge notification path. The RPC authorizes the caller as the assigned
   *  faculty (or super/admin). Returns how many learners were newly nudged
   *  (idempotent per learner/session/day, so a repeat click may return 0). */
  static async notifySessionPending(
    attendanceDate: string,
    timetableId: string,
    periodId: string,
  ): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_notify_session_pending', {
      p_attendance_date: attendanceDate,
      p_timetable_id: timetableId,
      p_period_id: periodId,
    });
    if (error) throw new Error(`Failed to notify pending learners: ${error.message}`);
    return Number(data ?? 0);
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


  /**
   * Facilitator Pulse — work-evidenced presence signals per facilitator
   * (leadership-gated; fn_scf_facilitator_pulse raises for non-leadership).
   * Presence signals only — no understanding scores, no ranks.
   */
  static async getFacilitatorPulse(
    from: string,
    to: string,
  ): Promise<FacilitatorPulseRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_facilitator_pulse', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load facilitator pulse: ${error.message}`);
    return (data ?? []) as FacilitatorPulseRow[];
  }

  /**
   * My Pulse — the CALLER's own work-signals over the last 30 days
   * (fn_scf_my_pulse: self-scoped by the caller's email, no leadership gate,
   * always one row — zeros when no signal yet). Decorative surface: failures
   * return null and the card simply doesn't render.
   */
  static async getMyPulse(): Promise<MyPulseRow | null> {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_my_pulse');
      if (error) {
        logger.warn('academic/session-feedback', 'my-pulse load failed', error);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as MyPulseRow | null;
    } catch (err) {
      logger.warn('academic/session-feedback', 'my-pulse load failed', err);
      return null;
    }
  }

  /**
   * Signal 8 — marks coverage for the pulse roster (server route joins the
   * COE exam-cycle data; same leadership gate as the pulse — the route calls
   * fn_scf_facilitator_pulse with the caller's session). Decorative to the
   * pulse board: failures return null and the column simply doesn't render.
   */
  static async getMarksCoverage(
    from: string,
    to: string,
  ): Promise<MarksCoverageResponse | null> {
    try {
      const res = await fetch(
        `/api/academic/session-feedback/marks-coverage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!res.ok) return null;
      const body = (await res.json()) as MarksCoverageResponse;
      return body.configured ? body : null;
    } catch {
      return null;
    }
  }

  /**
   * Verdict-at-next-class: the latest UNVERDICTED improvement note addressed to
   * the CALLER for this course, generated before today — i.e. today's class (the
   * one just marked) happened AFTER the advice, so "did you try it?" is now
   * answerable. Read is RLS-scoped (institution) + filtered to the caller's own
   * faculty_email; fn_scf_set_verdict re-authorizes on write (defense in depth).
   * This surface is decorative to attendance-marking, so failures LOG and return
   * null — they must never block or noise the save flow.
   */
  static async getPendingVerdictSuggestion(
    courseCode: string,
  ): Promise<PendingVerdictSuggestion | null> {
    try {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const email: string | undefined = userData?.user?.email
        ?.trim()
        .toLowerCase();
      if (!email || !courseCode) return null;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('scf_ai_suggestions')
        .select(
          'id, course_code, kind, suggestion, generated_at, input_avg_understood, outcome_avg_understood, outcome_measured_at',
        )
        .eq('domain', 'session_feedback')
        .eq('kind', 'improvement')
        .eq('course_code', courseCode)
        .eq('faculty_email', email)
        .is('human_verdict', null)
        .lt('generated_at', todayStart.toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.warn('academic/session-feedback', 'pending-verdict read failed', {
          courseCode,
          error: error.message,
        });
        return null;
      }
      return (data as PendingVerdictSuggestion | null) ?? null;
    } catch (err) {
      logger.warn('academic/session-feedback', 'pending-verdict read threw', err);
      return null;
    }
  }

  /**
   * All AI notes addressed to the CALLER, newest first — the faculty page's
   * "Notes from your feedback loop" card. Unlike getPendingVerdictSuggestion
   * (one course, unverdicted, pre-today), this is the full personal history:
   * both kinds, verdicted or not, so a note is always findable after the
   * one-tap attendance ask has passed. Decorative surface: failures LOG and
   * return [] — never an error state on the faculty page.
   */
  static async getMyLoopNotes(limit = 20): Promise<MyLoopNote[]> {
    try {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email?.trim().toLowerCase();
      if (!email) return [];

      const { data, error } = await supabase
        .from('scf_ai_suggestions')
        .select(
          'id, course_code, kind, suggestion, generated_at, input_avg_understood, outcome_avg_understood, outcome_lift, outcome_measured_at, outcome_unmeasurable_at, human_verdict, human_verdict_at',
        )
        .eq('domain', 'session_feedback')
        .eq('faculty_email', email)
        .order('generated_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.warn('academic/session-feedback', 'my-loop-notes read failed', {
          error: error.message,
        });
        return [];
      }
      return (data as MyLoopNote[] | null) ?? [];
    } catch (err) {
      logger.warn('academic/session-feedback', 'my-loop-notes read threw', err);
      return [];
    }
  }

  /**
   * Student-confirmed resolution aggregates for a set of notes — the loop's
   * fourth witness. fn_scf_note_resolution_counts enforces the k>=3 anonymity
   * floor server-side: notes with fewer than 3 votes simply return no row.
   * Decorative surface: failures log and return [].
   */
  static async getNoteResolutionCounts(
    suggestionIds: string[],
  ): Promise<NoteResolutionCounts[]> {
    if (suggestionIds.length === 0) return [];
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_note_resolution_counts', {
        p_suggestion_ids: suggestionIds,
      });
      if (error) {
        logger.warn('academic/session-feedback', 'resolution-counts read failed', {
          error: error.message,
        });
        return [];
      }
      return (data as NoteResolutionCounts[] | null) ?? [];
    } catch (err) {
      logger.warn('academic/session-feedback', 'resolution-counts read threw', err);
      return [];
    }
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
  static async getAdminTrend(
    from: string,
    to: string,
    institutionId?: string | null,
  ): Promise<AdminTrendRow[]> {
    const supabase = getSupabase();
    // p_institution_id NARROWS within the caller's institution scope; it can
    // never widen it. Always sent (null = all colleges in scope) so PostgREST
    // resolves the 3-arg overload rather than the legacy 2-arg one.
    const { data, error } = await supabase.rpc('fn_scf_admin_trend', {
      p_from: from,
      p_to: to,
      p_institution_id: institutionId ?? null,
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
    institutionId?: string,
  ): Promise<FacilitatorCoverageRow[]> {
    const supabase = getSupabase();
    // College narrowing happens server-side (NULL = all colleges in caller
    // scope) so this card's correctness never depends on client filter state.
    const { data, error } = await supabase.rpc('fn_scf_facilitator_feedback_coverage', {
      p_from: from,
      p_to: to,
      p_institution_id: institutionId ?? null,
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

  // ---------------------------------------------------------------------------
  // Pre-session materials (Rank 3a) — post a NotebookLM link/material for a
  // session + log objective opens. All four flow through the SECURITY DEFINER
  // RPCs in 20260801100000_scf_session_resources.sql (RLS-on tables, anon-locked).
  // Authority for post/deactivate is _fn_curriculum_class_ctx(...require_manage):
  // the RPC raises for a caller without manage rights on that session.
  // ---------------------------------------------------------------------------

  /** Post a material for a session (a Senior Learner of the course, or an
   *  HOD/admin of the institution). Throws on failure so the caller sees the real
   *  auth/validation error (e.g. another course's Senior Learner is rejected).
   *  Returns the inserted row. */
  static async postSessionResource(
    input: PostSessionResourceInput,
  ): Promise<PostedSessionResource> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_post_session_resource', {
      p_timetable_id: input.timetableId,
      p_attendance_date: input.attendanceDate,
      p_period_id: input.periodId,
      p_kind: input.kind ?? 'notebooklm',
      p_title: input.title,
      p_url: input.url,
    });
    if (error) throw new Error(error.message);
    return data as PostedSessionResource;
  }

  /** Active materials for a session + the caller-learner's own `opened` flag and
   *  the aggregate `open_count`. Authenticated read (class-shared study links, not
   *  sensitive). Decorative on both surfaces — a read failure (including the RPC
   *  not yet applied on prod) returns [] so neither page ever crashes. */
  static async getResourcesForSession(
    timetableId: string,
    attendanceDate: string,
    periodId: string,
  ): Promise<SessionResourceRow[]> {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_resources_for_session', {
        p_timetable_id: timetableId,
        p_attendance_date: attendanceDate,
        p_period_id: periodId,
      });
      if (error) {
        logger.warn('academic/session-feedback', 'resources-for-session read failed', {
          error: error.message,
        });
        return [];
      }
      return (data || []) as SessionResourceRow[];
    } catch (err) {
      logger.warn('academic/session-feedback', 'resources-for-session read threw', err);
      return [];
    }
  }

  /** Learner logs an open of a material (idempotent upsert; increments the count
   *  on re-open). Throws on failure — the UI fires the new-tab open regardless, so
   *  the link still works even if the log call fails. */
  static async logResourceOpen(resourceId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('fn_scf_log_resource_open', {
      p_resource_id: resourceId,
    });
    if (error) throw new Error(error.message);
  }

  /** Deactivate a mis-posted material (manage authority; the RPC raises otherwise). */
  static async deactivateSessionResource(resourceId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('fn_scf_deactivate_session_resource', {
      p_resource_id: resourceId,
    });
    if (error) throw new Error(error.message);
  }
}
