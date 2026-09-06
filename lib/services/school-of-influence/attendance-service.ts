// lib/services/school-of-influence/attendance-service.ts
//
// School of Influence — SESSION ATTENDANCE + DERIVED COMPLETION (spec §7 S6).
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// D11 — a coordinator ticks a list each session.
// D9  — someone completes ONLY if their attendance share meets
//       soi.completion.min_attendance_pct, read AT RUNTIME per batch.
//
// THIS FILE ADDS NO NEW MECHANISM AND NO NEW TABLE. Sessions are
// public.event_sessions rows and marks are public.event_session_attendance rows
// — the pair that already carries 855 marks across 43 sessions. Every call here
// is a thin wrapper over one of the SECURITY DEFINER RPCs in
// supabase/migrations/20260808145000_soi_attendance_completion.sql.
//
// WHY RPCs AND NOT TABLE READS. Both tables are already RLS-locked against this
// module: event_sessions is admin-only (event_sessions_admin), and
// event_session_attendance is gated on induction.manage / induction.view. A
// School of Influence coordinator holds cohort.manage, so a direct table read
// returns ZERO ROWS and a direct write fails silently. Widening those policies
// would hand SoI coordinators every induction register on the platform, so the
// migration adds no policy and authorises per-batch inside narrow DEFINER
// functions instead — the same shape induction itself uses.
//
// NO HARDCODED THRESHOLD. The completion bar is never stated in TypeScript.
// fn_soi_batch_completion reads soi.completion.min_attendance_pct at call time
// and RETURNS the effective value in every row, so the UI renders the number the
// database actually judged against. If somebody changes the policy, this file
// needs no edit and cannot disagree with the database.
//
// COMPLETION IS A DERIVED READ. There is deliberately no `markCompleted()` and
// no stored flag: recomputing after a correction always agrees with the register,
// which a denormalised boolean cannot guarantee.
//
// CLIENT-ONLY, exactly like SoiBatchService and the cohort spine it wraps: the
// browser Supabase client carries the caller's session, so the RPCs' own
// permission checks run as the real user. Do NOT import this into a Server
// Component or route handler — server-side the browser client has no auth cookie
// and would run as `anon`, which these RPCs refuse
// (ref feedback_browser_supabase_client_serverside_returns_empty).

import { createClientSupabaseClient } from '@/lib/supabase/client';

/** The marks event_session_attendance's own CHECK constraint admits. */
export type SoiAttendanceStatus = 'present' | 'absent' | 'excused' | 'od';

export const SOI_ATTENDANCE_STATUSES: {
  value: SoiAttendanceStatus;
  short: string;
  label: string;
}[] = [
  { value: 'present', short: 'P', label: 'Present' },
  { value: 'absent', short: 'A', label: 'Absent' },
  { value: 'excused', short: 'E', label: 'Excused' },
  { value: 'od', short: 'OD', label: 'Official duty' },
];

/** One session of the programme, with THIS batch's marking progress. */
export interface SoiSession {
  session_id: string;
  title: string;
  start_at: string;
  end_at: string;
  venue_text: string | null;
  session_status: string;
  session_order: number;
  /** end_at has passed — the session can be marked from the register, not a plan. */
  has_happened: boolean;
  /** Batch members with any mark for this session. */
  marked_count: number;
  /** Batch members whose mark counts as attending. */
  present_count: number;
}

/** One line of the tick-list. */
export interface SoiRosterRow {
  membership_id: string;
  profile_id: string;
  full_name: string;
  member_type: string;
  membership_status: string;
  /**
   * False when no mark can be stored for this person at all. The register keys
   * on a learner record and a staff profile has none, so the row is shown and
   * explained rather than hidden — hiding it would look like the person had left
   * the batch.
   */
  attendance_trackable: boolean;
  /** Plain-English why, present only when attendance_trackable is false. */
  untrackable_reason: string | null;
  marked_status: SoiAttendanceStatus | null;
}

/**
 * One member's completion picture — every field recomputed from the register on
 * each call. `min_attendance_pct` is the value the DATABASE used, not a local
 * assumption.
 */
export interface SoiCompletionRow {
  membership_id: string;
  profile_id: string;
  full_name: string;
  member_type: string;
  membership_status: string;
  attendance_trackable: boolean;
  /** Every non-cancelled session of the programme. */
  sessions_scheduled: number;
  /** Those that have already finished. */
  sessions_held: number;
  sessions_attended: number;
  sessions_remaining: number;
  /** Share of the sessions held so far — how they are doing right now. */
  pct_to_date: number;
  /** Share of the whole programme — what completion is finally judged on. */
  pct_of_programme: number;
  /** soi.completion.min_attendance_pct as resolved for this batch. */
  min_attendance_pct: number;
  /** Sessions needed over the whole programme to clear the bar (rounded up). */
  sessions_needed_total: number;
  /** How many MORE they must attend. 0 once the bar is cleared. */
  sessions_still_needed: number;
  /** Is the bar still arithmetically reachable with the sessions left? */
  can_still_complete: boolean;
  completion_state: 'met' | 'on_track' | 'cannot_meet' | 'not_tracked';
}

/** One tick, keyed on the profile the batch roster is keyed on. */
export interface SoiAttendanceMark {
  profile_id: string;
  status: SoiAttendanceStatus;
}

/**
 * Turn a Postgres error into something a coordinator can act on, preserving the
 * RPC's own message (they are written for a human) and its status. Silence is
 * the failure mode CLAUDE.md rule 27 forbids, so nothing here swallows.
 */
function explain(error: unknown, fallback: string): Error {
  const message = (error as { message?: string })?.message?.trim();
  const code = (error as { code?: string })?.code;
  const explained = new Error(message && message.length > 0 ? message : fallback);
  // 42501 = insufficient_privilege — the RPCs raise it for a permission refusal.
  (explained as Error & { status?: number }).status = code === '42501' ? 403 : 400;
  (explained as Error & { cause?: unknown }).cause = error;
  return explained;
}

export class SoiAttendanceService {
  private static supabase = createClientSupabaseClient();

  /**
   * Add one session to the programme this batch belongs to (spec P4 — the event
   * has zero sessions and D9/D11 need some). The event is derived from the batch
   * inside the RPC, never passed in.
   */
  static async createSession(input: {
    cohortId: string;
    title: string;
    startAt: string;
    endAt: string;
    venueText?: string | null;
  }): Promise<string> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_create_session', {
      p_cohort_id: input.cohortId,
      p_title: input.title,
      p_start_at: input.startAt,
      p_end_at: input.endAt,
      p_venue_text: input.venueText ?? null,
    });
    if (error) throw explain(error, 'The session could not be created.');
    return data as string;
  }

  /** Every session of the programme, with this batch's marking progress. */
  static async listSessions(cohortId: string): Promise<SoiSession[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_list_sessions', {
      p_cohort_id: cohortId,
    });
    if (error) throw explain(error, 'The sessions could not be loaded.');
    return (data ?? []) as SoiSession[];
  }

  /** The tick-list for one session (D11). */
  static async getSessionRoster(
    cohortId: string,
    sessionId: string
  ): Promise<SoiRosterRow[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_session_roster', {
      p_cohort_id: cohortId,
      p_session_id: sessionId,
    });
    if (error) throw explain(error, 'The register could not be loaded.');
    return (data ?? []) as SoiRosterRow[];
  }

  /**
   * Save one session's ticks (D11). All-or-nothing in the database: if any line
   * cannot be stored the whole save is refused with a named reason, so a
   * coordinator never sees "saved" over a half-written register.
   */
  static async markAttendance(
    cohortId: string,
    sessionId: string,
    marks: SoiAttendanceMark[]
  ): Promise<number> {
    if (marks.length === 0) {
      const err = new Error('Mark at least one person before saving.');
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    const { data, error } = await (this.supabase as any).rpc(
      'fn_soi_mark_session_attendance',
      { p_cohort_id: cohortId, p_session_id: sessionId, p_marks: marks }
    );
    if (error) throw explain(error, 'The attendance could not be saved.');
    return (data ?? 0) as number;
  }

  /**
   * Completion for every member of the batch (D9), derived fresh from the
   * register. Nothing is written and nothing is cached — call it again after a
   * correction and the numbers move with the ticks.
   */
  static async getCompletion(cohortId: string): Promise<SoiCompletionRow[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_batch_completion', {
      p_cohort_id: cohortId,
    });
    if (error) throw explain(error, 'Completion could not be worked out.');
    return (data ?? []) as SoiCompletionRow[];
  }

  /**
   * PURE — the batch-level summary a coordinator reads first. Derived from the
   * per-member rows so it can never disagree with the table under it. Members
   * whose attendance cannot be tracked are counted separately rather than folded
   * into "short", because they have not fallen behind — they are outside the
   * measurement (see SoiRosterRow.attendance_trackable).
   */
  static summarise(rows: SoiCompletionRow[]): {
    total: number;
    tracked: number;
    met: number;
    onTrack: number;
    cannotMeet: number;
    notTracked: number;
    /** soi.completion.min_attendance_pct as the database resolved it. */
    minAttendancePct: number | null;
  } {
    const tracked = rows.filter((r) => r.attendance_trackable);
    return {
      total: rows.length,
      tracked: tracked.length,
      met: rows.filter((r) => r.completion_state === 'met').length,
      onTrack: rows.filter((r) => r.completion_state === 'on_track').length,
      cannotMeet: rows.filter((r) => r.completion_state === 'cannot_meet').length,
      notTracked: rows.filter((r) => r.completion_state === 'not_tracked').length,
      minAttendancePct: rows.length > 0 ? rows[0].min_attendance_pct : null,
    };
  }
}
