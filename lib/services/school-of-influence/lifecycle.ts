// lib/services/school-of-influence/lifecycle.ts
//
// School of Influence — INACTIVITY LIFECYCLE, READ SIDE (spec §7 S7).
// Spec: specs/school-of-influence-batches-2026-07-30.md §5.
//
// D8 — remind → pause → remove, SHIPPED DELIBERATELY DISABLED.
//   cohort_status_events has 0 rows platform-wide. SF100 carried grace,
//   escalation and inactivity settings and they never fired once, which is why
//   it sat four months with nobody noticing. So the engine records what it WOULD
//   do on every run, and this module is the surface that shows that work. There
//   is no action path here: nothing in this file changes a membership, sends a
//   reminder, or removes anybody.
//
// THE ARITHMETIC LIVES IN SQL, ON PURPOSE — this file does not re-derive it.
//   "Quiet" is defined by event_session_attendance marks against this
//   programme's sessions: the SAME numerator fn_soi_batch_completion (S6) uses.
//   Recomputing that in TypeScript would need every member and every mark in the
//   browser AND would create a second definition of "active" that could drift
//   from the completion screen. fn_soi_inactivity_core
//   (20260808150000_soi_inactivity_dry_run.sql) owns it, returns the EFFECTIVE
//   thresholds on every result, and this file states no threshold anywhere.
//
// WHAT IT DOES REUSE FROM THE SPINE (lib/services/cohort-core/lifecycle.ts):
//   • MEMBERSHIP_TRANSITIONS / canTransition — every proposed move is checked
//     against the spine's own transition map before it is shown, so the list can
//     never present a move the spine would refuse.
//   • isTerminalMembershipStatus — the same predicate that decides who occupies a
//     seat decides who is in the ladder at all.
//   No parallel lifecycle mechanism is introduced.
//
// THE HIGHEST-RISK DEFECT, GUARDED INDEPENDENTLY (carried from S6):
//   A member with member_type set to the non-learner value has no
//   learners_profiles row, so no attendance row can exist for them and they would
//   otherwise read as permanently quiet — and, once armed, be removed. The
//   database makes that impossible twice over (the verdict CASE tests learner_id
//   first, and the recorder aborts the whole run if an untrackable member ever
//   carries an actionable verdict). This file adds a THIRD, independent guard on
//   the read side: SoiInactivityRow is a discriminated union in which the
//   untrackable variant has no days_quiet and no actionable verdict — the shape
//   simply cannot express "remove this person" — and toSoiInactivityRow forces
//   any untrackable row into that variant, recording an integrity_warning so a
//   future SQL regression is shown loudly rather than obeyed.
//
// CLIENT-ONLY, like SoiBatchService and SoiAttendanceService: the browser
// Supabase client carries the caller's session so the SECURITY DEFINER RPC
// authorises the real user. Do NOT import this into a Server Component or route
// handler — server-side the browser client has no auth cookie and runs as `anon`
// (ref feedback_browser_supabase_client_serverside_returns_empty). The cron route
// is server-side and deliberately does not import this file.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  canTransition,
  isTerminalMembershipStatus,
} from '@/lib/services/cohort-core/lifecycle';
import type { MembershipStatus } from '@/lib/types/cohort-core';

/** cohort_status_events.event_type written by the recorder. */
export const SOI_INACTIVITY_RUN_EVENT = 'soi.inactivity.dry_run' as const;
export const SOI_INACTIVITY_VERDICT_EVENT = 'soi.inactivity.dry_run.member' as const;
export const SOI_INACTIVITY_ARMED_EVENT = 'soi.inactivity.armed_without_actions' as const;

/** Verdicts the evaluator can reach. Nothing here is an action. */
export type SoiInactivityVerdict = 'none' | 'nudge' | 'pause' | 'remove' | 'not_tracked';

/** The verdicts that would move somebody if the engine were ever armed. */
export type SoiActionableVerdict = Extract<SoiInactivityVerdict, 'nudge' | 'pause' | 'remove'>;

/** The §4 thresholds AS THE DATABASE RESOLVED THEM. Never restated in code. */
export interface SoiInactivityThresholds {
  nudge_days: number;
  pause_days: number;
  remove_days: number;
}

interface SoiInactivityRowBase {
  membership_id: string;
  profile_id: string;
  full_name: string;
  member_type: string;
  membership_status: string;
  /** Plain-English why, composed by the database against the effective threshold. */
  reason: string;
}

/**
 * One line of the dry-run list.
 *
 * A DISCRIMINATED UNION, not a flag on one shape. When attendance cannot be
 * tracked there is no quiet period to report and no action that could ever be
 * proposed, so those fields do not exist on that variant at all. A caller cannot
 * read days_quiet off an untrackable member, and cannot be handed a 'remove'
 * verdict for one, because the type has nowhere to put either.
 */
export type SoiInactivityRow =
  | (SoiInactivityRowBase & {
      attendance_trackable: false;
      verdict: 'not_tracked';
      /**
       * Present only when the database sent something this reader refused to
       * accept. Surfaced on screen rather than swallowed: a silent downgrade
       * would hide exactly the regression this guard exists to catch.
       */
      integrity_warning?: string;
    })
  | (SoiInactivityRowBase & {
      attendance_trackable: true;
      verdict: Exclude<SoiInactivityVerdict, 'not_tracked'>;
      /** Whole days since the last attended session, or since they joined. */
      days_quiet: number;
      /** Sessions held in that window that they did not attend. */
      sessions_missed: number;
      last_attended_at: string | null;
      quiet_since: string | null;
      /** The membership status the engine WOULD move them to. Never applied. */
      would_move_to: MembershipStatus | null;
      /** The threshold that fired, as the database resolved it. */
      threshold_days: number | null;
    });

/** One batch's full dry-run picture, including when there is nobody in it. */
export interface SoiInactivityPreview {
  cohort_id: string;
  batch_name: string | null;
  evaluated_at: string;
  evaluated_on: string;
  /** soi.inactivity.enabled as resolved for this batch. Ships false. */
  engine_armed: boolean;
  thresholds: SoiInactivityThresholds;
  attending_statuses: string[];
  sessions_scheduled: number;
  sessions_held: number;
  members: SoiInactivityRow[];
}

/** One row of the recorded log — the receipt SF100 never had. */
export interface SoiInactivityLogEntry {
  id: string;
  event_type: string;
  created_at: string;
  membership_id: string | null;
  to_status: string | null;
  reason: string | null;
  evaluated_on: string | null;
  engine_armed: boolean;
  actions_taken: number;
}

const VERDICT_LABEL: Record<SoiInactivityVerdict, string> = {
  none: 'No action',
  nudge: 'Would send a reminder',
  pause: 'Would pause access',
  remove: 'Would remove from the batch',
  not_tracked: 'Attendance not trackable',
};

/** Short label for one verdict, in the words a coordinator reads on screen. */
export function soiVerdictLabel(verdict: SoiInactivityVerdict): string {
  return VERDICT_LABEL[verdict] ?? 'No action';
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const ACTIONABLE: readonly string[] = ['nudge', 'pause', 'remove'];

/**
 * The ONLY way a SoiInactivityRow is built. Independent of the SQL: it re-tests
 * trackability from the row itself rather than trusting the verdict that came
 * with it, so an evaluator regression that hands an untrackable member an
 * actionable verdict is downgraded here and reported, not obeyed.
 */
export function toSoiInactivityRow(raw: unknown): SoiInactivityRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const base: SoiInactivityRowBase = {
    membership_id: asString(r.membership_id),
    profile_id: asString(r.profile_id),
    full_name: asString(r.full_name, 'Unnamed'),
    member_type: asString(r.member_type),
    membership_status: asString(r.membership_status),
    reason: asString(r.reason),
  };

  const rawVerdict = asString(r.verdict, 'none');

  // Trackability is decided by the row's own field, never inferred from the
  // verdict. Anything other than an explicit true is treated as not trackable.
  if (r.attendance_trackable !== true) {
    const wrong = ACTIONABLE.includes(rawVerdict);
    return {
      ...base,
      attendance_trackable: false,
      verdict: 'not_tracked',
      ...(wrong
        ? {
            integrity_warning:
              'The evaluator proposed an action for somebody whose attendance cannot be recorded at all. That is a bug, and the proposal has been discarded here. Report it before the engine is armed.',
          }
        : {}),
    };
  }

  const verdict = (
    ['none', 'nudge', 'pause', 'remove'].includes(rawVerdict) ? rawVerdict : 'none'
  ) as Exclude<SoiInactivityVerdict, 'not_tracked'>;

  return {
    ...base,
    attendance_trackable: true,
    verdict,
    days_quiet: asNumber(r.days_quiet),
    sessions_missed: asNumber(r.sessions_missed),
    last_attended_at: asNullableString(r.last_attended_at),
    quiet_since: asNullableString(r.quiet_since),
    would_move_to: (asNullableString(r.would_move_to) as MembershipStatus | null) ?? null,
    threshold_days: asNullableNumber(r.threshold_days),
  };
}

/** The untrackable variant, named once so callers narrow the same way. */
export type SoiUntrackableRow = Extract<SoiInactivityRow, { attendance_trackable: false }>;

/**
 * Narrow to the untrackable variant.
 *
 * An EXPLICIT type guard rather than a bare `!row.attendance_trackable`: this
 * repo compiles with `strict: false`, under which the boolean discriminant does
 * not reliably narrow the union, and the fields that exist only on the
 * untrackable variant then read as errors. Comparing against the literal `false`
 * inside a declared guard makes the narrowing explicit and survives that setting.
 */
export function isSoiUntrackable(row: SoiInactivityRow): row is SoiUntrackableRow {
  return row.attendance_trackable === false;
}

/** The measurable variant — the only one that can carry a quiet period. */
export type SoiTrackableRow = Extract<SoiInactivityRow, { attendance_trackable: true }>;

/** Narrow to the measurable variant. Same reason as isSoiUntrackable. */
export function isSoiTrackable(row: SoiInactivityRow): row is SoiTrackableRow {
  return row.attendance_trackable === true;
}

/**
 * Is the move this row proposes one the SPINE would actually allow? Checked
 * against cohort-core's MEMBERSHIP_TRANSITIONS via canTransition, so the list can
 * never show a move that the engine could not legally make even once armed. A
 * terminal membership is never in the ladder at all.
 *
 * Rows that propose no move (none / nudge / not_tracked) are legal by definition.
 */
export function soiPlannedMoveIsLegal(row: SoiInactivityRow): boolean {
  if (!row.attendance_trackable) return true;
  if (!row.would_move_to) return true;

  const from = row.membership_status as MembershipStatus;
  if (isTerminalMembershipStatus(from)) return false;
  return canTransition('membership', from, row.would_move_to);
}

export interface SoiInactivitySummary {
  total: number;
  /** Members whose attendance can be measured at all. */
  tracked: number;
  none: number;
  nudge: number;
  pause: number;
  remove: number;
  /** Counted separately — they have not gone quiet, they are outside measurement. */
  notTracked: number;
  /** Rows proposing a move the spine would refuse. Should always be 0. */
  illegalMoves: number;
  /** Rows this reader had to downgrade. Should always be 0. */
  integrityWarnings: number;
}

/** PURE — the counts the banner reads. Derived from the rows, never from SQL. */
export function summariseSoiInactivity(rows: SoiInactivityRow[]): SoiInactivitySummary {
  const count = (v: SoiInactivityVerdict) => rows.filter((r) => r.verdict === v).length;
  return {
    total: rows.length,
    tracked: rows.filter((r) => r.attendance_trackable).length,
    none: count('none'),
    nudge: count('nudge'),
    pause: count('pause'),
    remove: count('remove'),
    notTracked: count('not_tracked'),
    illegalMoves: rows.filter((r) => !soiPlannedMoveIsLegal(r)).length,
    integrityWarnings: rows
      .filter(isSoiUntrackable)
      .filter((r) => Boolean(r.integrity_warning)).length,
  };
}

/**
 * Turn a Postgres error into something a coordinator can act on, preserving the
 * RPC's own message (they are written for a human) and its status. Silence is the
 * failure mode CLAUDE.md rule 27 forbids, so nothing here swallows.
 */
function explain(error: unknown, fallback: string): Error {
  const message = (error as { message?: string })?.message?.trim();
  const code = (error as { code?: string })?.code;
  const explained = new Error(message && message.length > 0 ? message : fallback);
  // 42501 = insufficient_privilege — the RPC raises it for a permission refusal.
  (explained as Error & { status?: number }).status = code === '42501' ? 403 : 400;
  (explained as Error & { cause?: unknown }).cause = error;
  return explained;
}

export class SoiLifecycleService {
  private static supabase = createClientSupabaseClient();

  /**
   * What the engine WOULD do for this batch right now. Read-only: the RPC is
   * STABLE and writes nothing, so opening this screen never records or triggers
   * anything.
   */
  static async preview(cohortId: string): Promise<SoiInactivityPreview> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_inactivity_preview', {
      p_cohort_id: cohortId,
    });
    if (error) throw explain(error, 'The inactivity preview could not be worked out.');

    const d = (data ?? {}) as Record<string, unknown>;
    const t = (d.thresholds ?? {}) as Record<string, unknown>;
    return {
      cohort_id: asString(d.cohort_id, cohortId),
      batch_name: asNullableString(d.batch_name),
      evaluated_at: asString(d.evaluated_at),
      evaluated_on: asString(d.evaluated_on),
      engine_armed: d.engine_armed === true,
      thresholds: {
        nudge_days: asNumber(t.nudge_days),
        pause_days: asNumber(t.pause_days),
        remove_days: asNumber(t.remove_days),
      },
      attending_statuses: Array.isArray(d.attending_statuses)
        ? (d.attending_statuses as unknown[]).map((s) => asString(s))
        : [],
      sessions_scheduled: asNumber(d.sessions_scheduled),
      sessions_held: asNumber(d.sessions_held),
      members: Array.isArray(d.members) ? d.members.map(toSoiInactivityRow) : [],
    };
  }

  /**
   * The recorded runs and verdicts for this batch, newest first — proof that the
   * engine has actually been running. Read straight from cohort_status_events
   * under the spine's own RLS (cohort_status_events_select_permission), so this
   * needs no new function and no widened policy.
   */
  static async listRecordedEvents(
    cohortId: string,
    limit = 50
  ): Promise<SoiInactivityLogEntry[]> {
    // Cast for the same reason the RPC calls above are cast: cohort_status_events
    // is newer than the checked-in generated Supabase types, so the typed client
    // rejects the table name outright. The shape is re-derived defensively below
    // rather than trusted from the generated types either way.
    const { data, error } = await (this.supabase as any)
      .from('cohort_status_events')
      .select('id, event_type, created_at, membership_id, to_status, reason, metadata')
      .eq('cohort_id', cohortId)
      .in('event_type', [
        SOI_INACTIVITY_RUN_EVENT,
        SOI_INACTIVITY_VERDICT_EVENT,
        SOI_INACTIVITY_ARMED_EVENT,
      ])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw explain(error, 'The recorded dry-runs could not be loaded.');

    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: asString(r.id),
        event_type: asString(r.event_type),
        created_at: asString(r.created_at),
        membership_id: asNullableString(r.membership_id),
        to_status: asNullableString(r.to_status),
        reason: asNullableString(r.reason),
        evaluated_on: asNullableString(meta.evaluated_on),
        engine_armed: meta.engine_armed === true,
        actions_taken: asNumber(meta.actions_taken),
      };
    });
  }
}
