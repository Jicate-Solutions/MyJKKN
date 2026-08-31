// lib/services/ai-pulse/pulse-trends-service.ts
// Created: 2026-08-13 — AI Pulse Champion Console, cross-cycle trend read path.
//
// Backs: app/(routes)/ai-pulse/admin/trends/page.tsx
//
// WHY A NEW SERVICE
//   The Champion (Krishnaveni) and Co-Champion (Ranjith) could only inspect ONE
//   cycle at a time (/ai-pulse/admin/cycles/[id]). Their actual weekly question
//   is "did last week's change help?", which no single-cycle number can answer.
//   This service computes the SAME independent signals the per-cycle
//   Participation card shows, but across every cycle, with a week-over-week
//   delta attached to each rate.
//
//   It deliberately does NOT extend pulse-analytics-service.ts — that file is
//   the Instagram publication read path (reach / gold posts), a different
//   concern with a different substrate.
//
// SOURCES
//   startup_events            — one row per cycle, `config->>kind = 'ai_pulse'`
//                               (the canonical filter used by cycles-service).
//                               Dated by start_date, falling back to demo_date.
//   ai_pulse_live_attendance  — one row per attendee per cycle. Every real
//                               signal lives in the `engagement_signals` JSONB.
//   ai_pulse_domain_starters  — per-cycle starter prompts carrying the
//                               denormalised distinct-learner views/copies.
//
// COLUMN THAT LOOKS USEFUL AND IS NOT
//   `ai_pulse_live_attendance.left_at` is DEAD — zero of ~2,978 production rows
//   carry a value. "Stayed" is read from engagement_signals.stayed_until, whose
//   PRESENCE (not value) is the signal. Never reintroduce left_at here.
//
// DAY_TYPE — deliberate difference from the per-cycle card
//   participation-service filters `day_type = 'live_session'`. This service does
//   NOT: it counts every attendance row for the cycle, so async make-ups are
//   included in the denominator. That is what makes the trend comparable to the
//   turnout the Champion actually convened. The two surfaces can therefore
//   differ for a cycle with async make-ups; that is intended, not a defect.
//
// RLS
//   Read-only, browser/session client throughout — never service role. Rows the
//   caller may not see simply do not arrive. Because a denied read and an empty
//   table are INDISTINGUISHABLE over PostgREST (both return zero rows and no
//   error), every unreadable signal is reported as `not captured` with its
//   reason, never as a zero. See STARTER TAKE-UP below.
//
//   The page that consumes this is gated on `aiPulse:anomaly.review`, the same
//   key as the sibling champion read surfaces (/admin/anomalies, /admin/reports)
//   — NOT on `aiPulse:cycles.manage`. That is deliberate: the SELECT policy on
//   ai_pulse_live_attendance (20260611) admits is_super_admin / is_admin / the
//   learner's own row / `aiPulse:attendance.mark` / `aiPulse:anomaly.review`,
//   and does NOT list `cycles.manage`. Gating on cycles.manage would open a page
//   whose every number then read "not captured" for want of rows. The
//   ai_pulse_champion role holds both keys, so Krishnaveni and Ranjith are
//   admitted either way; only this choice also guarantees the data arrives.
//
// Pattern reference: pulse-analytics-service.ts (service shape, policy reads)
//                    participation-service.ts (attendance read + signal counts)

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// Types
// ============================================================================

/** The five independent engagement signals, each counted on its own. */
export type SignalKey =
  | 'on_time'
  | 'stayed'
  | 'quiz_attempted'
  | 'quiz_passed'
  | 'gave_feedback';

export const SIGNAL_KEYS: readonly SignalKey[] = [
  'on_time',
  'stayed',
  'quiz_attempted',
  'quiz_passed',
  'gave_feedback',
] as const;

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  on_time: 'Joined on time',
  stayed: 'Stayed to the end',
  quiz_attempted: 'Attempted the quiz',
  quiz_passed: 'Passed the quiz',
  gave_feedback: 'Left feedback',
};

/** Verb phrase for prose callouts ("joining on time is at an all-time high"). */
export const SIGNAL_PHRASES: Record<SignalKey, string> = {
  on_time: 'joining on time',
  stayed: 'staying to the end',
  quiz_attempted: 'attempting the quiz',
  quiz_passed: 'passing the quiz',
  gave_feedback: 'leaving feedback',
};

export type Direction = 'up' | 'down' | 'flat';

export interface SignalCell {
  /** How many attendees fired this signal. */
  count: number;
  /**
   * Share of attendees, 0–100. `null` = NOT CAPTURED — the cycle has no
   * attendance rows, so the share is undefined. Never render this as 0.
   */
  rate: number | null;
  /**
   * Change in percentage points against the previous cycle that counts as a
   * session. `null` = no comparable earlier cycle, so there is nothing to say.
   */
  delta_pp: number | null;
  /** Direction of `delta_pp`; `null` whenever `delta_pp` is null. */
  direction: Direction | null;
}

export interface CycleTrend {
  cycle_id: string;
  /** startup_events.name — the Champion's own label for the week. */
  name: string;
  /** 'YYYY-MM-DD' from start_date, falling back to demo_date. null if neither. */
  session_date: string | null;
  /** Total attendance rows for the cycle. */
  attended: number;
  /**
   * false = too few attendees to be a real session. Kept in the table and
   * clearly marked; excluded from deltas, callouts and all-time comparisons.
   */
  is_session: boolean;
  signals: Record<SignalKey, SignalCell>;
}

export type StarterStatus = 'captured' | 'not_captured';

export interface StarterTakeup {
  status: StarterStatus;
  /** Present when status is 'not_captured' — why, in plain English. */
  reason: string | null;
  /** Distinct learners who viewed a starter prompt. null when not captured. */
  views: number | null;
  /** Distinct learners who copied one. null when not captured. */
  copies: number | null;
  /** copies/views as a percentage, 0–100. null when views is 0 or not captured. */
  conversion_pct: number | null;
  /** How many cycles contributed rows; 0 when not captured. */
  cycles_covered: number;
}

export type CalloutTone = 'concern' | 'win' | 'neutral';

export interface TrendCallout {
  id: string;
  tone: CalloutTone;
  /** One plain-language sentence a Champion can act on. */
  text: string;
}

export interface PulseTrends {
  /** Newest first. Includes non-sessions, clearly flagged. */
  cycles: CycleTrend[];
  /** Cycles held out of the trend, with the reason shown to the reader. */
  excluded: Array<{ cycle_id: string; session_date: string | null; attended: number }>;
  /** Live bar for "is this a session at all". */
  min_session_attendees: number;
  /**
   * true = the attendance read hit its page cap, so counts are incomplete and
   * every rate must be treated as not captured rather than reported.
   */
  truncated: boolean;
  starter: StarterTakeup;
  callouts: TrendCallout[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Fallback bar for "this was a real session". Overridden at runtime by the
 * `trend_min_session_attendees` policy row, per the standing rule that every
 * policy decision is a config row rather than a constant in code.
 *
 * Two production cycles (2026-07-02 and 2026-06-25) have exactly one attendee.
 * A single attendee makes every rate 0% or 100%, which would swamp a trend line
 * that is otherwise moving in single-digit points.
 */
const MIN_SESSION_ATTENDEES_FALLBACK = 2;

/** PostgREST caps a single response at 1,000 rows; page through explicitly. */
const ATTENDANCE_PAGE_SIZE = 1000;
/** Hard stop so a runaway table cannot hang the page. ~5x today's volume. */
const ATTENDANCE_MAX_ROWS = 20000;

/** A delta smaller than this rounds to 0.0pp, so call it flat. */
const FLAT_THRESHOLD_PP = 0.05;

interface AttendanceRow {
  event_id: string;
  engagement_signals: Record<string, unknown> | null;
}

interface CycleRow {
  id: string;
  name: string | null;
  start_date: string | null;
  demo_date: string | null;
}

function emptyCounts(): Record<SignalKey, number> {
  return {
    on_time: 0,
    stayed: 0,
    quiz_attempted: 0,
    quiz_passed: 0,
    gave_feedback: 0,
  };
}

/**
 * Signal readers, one per key — the TypeScript twin of the proven SQL:
 *   count(*) filter (where (engagement_signals->>'joined_within_5min')::bool)
 * and siblings. `stayed_until` is tested for PRESENCE, matching
 * `... is not null`; its value is never parsed.
 */
const SIGNAL_TESTS: Record<SignalKey, (s: Record<string, unknown>) => boolean> = {
  on_time: (s) => s.joined_within_5min === true,
  stayed: (s) => s.stayed_until !== null && s.stayed_until !== undefined,
  quiz_attempted: (s) => s.quiz_score !== null && s.quiz_score !== undefined,
  quiz_passed: (s) => s.quiz_passed === true,
  gave_feedback: (s) =>
    typeof s.feedback_text === 'string' && s.feedback_text.trim().length > 0,
};

/** Date-only 'YYYY-MM-DD' with no Date parsing, so no timezone can shift it. */
function toDateOnly(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : null;
}

/** '2026-07-30' → '07-30', the short form used inside callout sentences. */
export function shortDate(date: string | null): string {
  return date ? date.slice(5) : 'undated';
}

/** '2026-07-30' → '30 Jul 2026'. Built from parts — never via new Date(). */
export function longDate(date: string | null): string {
  if (!date) return 'No date set';
  const [y, m, d] = date.split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const monthIndex = parseInt(m, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return date;
  return `${parseInt(d, 10)} ${months[monthIndex]} ${y}`;
}

/** One decimal place, e.g. 68.8. */
export function pct(value: number): number {
  return Math.round(value * 10) / 10;
}

function directionOf(deltaPp: number): Direction {
  if (Math.abs(deltaPp) < FLAT_THRESHOLD_PP) return 'flat';
  return deltaPp > 0 ? 'up' : 'down';
}

/** 2 → 'second'. Used for "for a third week running". */
function ordinal(n: number): string {
  const words = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  return words[n] ?? `${n}th`;
}

// ============================================================================
// Reads
// ============================================================================

/** Live value of the min-attendee bar; falls back when the policy row is absent. */
async function readMinSessionAttendees(supabase: any): Promise<number> {
  const { data, error } = await supabase
    .from('ai_pulse_policies')
    .select('value_jsonb')
    .eq('config_key', 'trend_min_session_attendees')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return MIN_SESSION_ATTENDEES_FALLBACK;

  const raw = data.value_jsonb;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 1 ? n : MIN_SESSION_ATTENDEES_FALLBACK;
}

/**
 * Every attendance row for the given cycles, paged past the PostgREST 1,000-row
 * ceiling. Returns `truncated: true` if the hard cap was reached — the caller
 * must then report rates as not captured rather than publish a short count.
 */
async function readAttendance(
  supabase: any,
  cycleIds: string[],
): Promise<{ rows: AttendanceRow[]; truncated: boolean }> {
  const rows: AttendanceRow[] = [];
  if (cycleIds.length === 0) return { rows, truncated: false };

  for (let from = 0; from < ATTENDANCE_MAX_ROWS; from += ATTENDANCE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('ai_pulse_live_attendance')
      .select('event_id, engagement_signals')
      .in('event_id', cycleIds)
      .order('id', { ascending: true })
      .range(from, from + ATTENDANCE_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as AttendanceRow[];
    rows.push(...page);
    if (page.length < ATTENDANCE_PAGE_SIZE) {
      return { rows, truncated: false };
    }
  }

  return { rows, truncated: true };
}

/**
 * Starter take-up across the cycles in view.
 *
 * `ai_pulse_domain_starters` shipped with RLS enabled and ZERO policies
 * (20260719110000), which in PostgreSQL is deny-all — the read returns an empty
 * set and NO error for every role without BYPASSRLS. Its child events table was
 * given a SELECT policy on 2026-07-31, but that policy does not list the
 * Champion's own key, and without the parent there is no starter → cycle link
 * anyway. So zero visible rows here is genuinely ambiguous: either nothing has
 * been generated, or the caller is being refused. We report NOT CAPTURED and
 * name both possibilities rather than print a 0 the reader would trust.
 *
 * `supabase/migrations/20260828043000_ai_pulse_starter_takeup_readable.sql`
 * closes this; it is a FILE ONLY and is Director-gated. This function needs no
 * change when it is applied — rows simply start arriving.
 */
async function readStarterTakeup(
  supabase: any,
  cycleIds: string[],
): Promise<StarterTakeup> {
  const notCaptured = (reason: string): StarterTakeup => ({
    status: 'not_captured',
    reason,
    views: null,
    copies: null,
    conversion_pct: null,
    cycles_covered: 0,
  });

  if (cycleIds.length === 0) {
    return notCaptured('No cycles to read starter take-up for.');
  }

  const { data, error } = await supabase
    .from('ai_pulse_domain_starters')
    .select('cycle_id, views, copies')
    .in('cycle_id', cycleIds);

  if (error) {
    return notCaptured(`The starter prompt table could not be read: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    cycle_id: string;
    views: number | null;
    copies: number | null;
  }>;

  if (rows.length === 0) {
    return notCaptured(
      'No starter prompt rows are visible to you. This reads the same as "none were generated", ' +
        'so it cannot be reported as zero: ai_pulse_domain_starters has row-level security ' +
        'switched on with no policy attached, which withholds every row without raising an error. ' +
        'Migration 20260828043000_ai_pulse_starter_takeup_readable.sql adds the missing policy and ' +
        'is waiting on Director approval.',
    );
  }

  let views = 0;
  let copies = 0;
  const cycles = new Set<string>();
  for (const row of rows) {
    views += typeof row.views === 'number' ? row.views : 0;
    copies += typeof row.copies === 'number' ? row.copies : 0;
    cycles.add(row.cycle_id);
  }

  return {
    status: 'captured',
    reason: null,
    views,
    copies,
    conversion_pct: views > 0 ? pct((copies / views) * 100) : null,
    cycles_covered: cycles.size,
  };
}

// ============================================================================
// Callouts — the ranked "what should I change this week" read
// ============================================================================

interface Scored extends TrendCallout {
  score: number;
}

/**
 * Turn the computed series into ranked plain sentences.
 *
 * Ranking answers "what should the Champion change", so a sustained decline
 * outranks a one-week dip, which outranks a win. Only cycles that count as
 * sessions and have a computable rate take part.
 */
function buildCallouts(cycles: CycleTrend[]): TrendCallout[] {
  // Oldest → newest, sessions only, so streaks read in time order.
  const series = cycles.filter((c) => c.is_session).slice().reverse();
  if (series.length < 2) return [];

  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  const scored: Scored[] = [];

  // Attendance context — used to sharpen the "declined while attendance grew"
  // reading, which is the version a Champion can act on.
  const attendanceGrew = latest.attended > previous.attended;

  for (const key of SIGNAL_KEYS) {
    const cell = latest.signals[key];
    if (cell.rate === null || cell.delta_pp === null) continue;

    const phrase = SIGNAL_PHRASES[key];
    const now = pct(cell.rate);
    const then = pct(previous.signals[key].rate ?? 0);
    const magnitude = Math.abs(cell.delta_pp);

    // How many consecutive cycles has this signal moved the same way?
    let streak = 1;
    for (let i = series.length - 2; i >= 1; i -= 1) {
      const d = series[i].signals[key].direction;
      if (d && d === cell.direction && d !== 'flat') streak += 1;
      else break;
    }

    const rates = series
      .map((c) => c.signals[key].rate)
      .filter((r): r is number => r !== null);
    const isHigh = rates.length >= 3 && now >= pct(Math.max(...rates));
    const isLow = rates.length >= 3 && now <= pct(Math.min(...rates));

    if (cell.direction === 'down') {
      const streakText = streak >= 2 ? ` for a ${ordinal(streak)} week running` : '';
      const growthText =
        streak >= 2 && attendanceGrew
          ? ' — and it has slipped while attendance grew, so the room is getting bigger and less engaged'
          : '';
      scored.push({
        id: `${key}-down`,
        tone: 'concern',
        score: (streak >= 2 ? 100 + streak * 10 : 60) + magnitude + (isLow ? 15 : 0),
        text:
          `Fewer learners are ${phrase}${streakText}: ${then}% → ${now}% ` +
          `(${pct(cell.delta_pp)} points)` +
          `${isLow ? ', the lowest it has been' : ''}${growthText}.`,
      });
      continue;
    }

    if (cell.direction === 'up') {
      scored.push({
        id: `${key}-up`,
        tone: 'win',
        score: (isHigh ? 45 : 30) + magnitude / 2,
        text:
          `More learners are ${phrase}${isHigh ? ', an all-time high' : ''}: ` +
          `${then}% → ${now}% (+${pct(cell.delta_pp)} points from ` +
          `${shortDate(previous.session_date)}).`,
      });
    }
  }

  if (scored.length === 0) {
    scored.push({
      id: 'flat',
      tone: 'neutral',
      score: 1,
      text: `Nothing moved measurably between ${shortDate(previous.session_date)} and ${shortDate(latest.session_date)}.`,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ score: _score, ...rest }) => rest);
}

// ============================================================================
// Service
// ============================================================================

/**
 * Every AI Pulse cycle with its engagement signals and week-over-week deltas.
 * Read-only; nothing here writes.
 */
export async function getPulseTrends(): Promise<PulseTrends> {
  // Cast to any: ai_pulse_live_attendance / ai_pulse_domain_starters are not in
  // the generated Supabase types (same convention as participation-service).
  const supabase = createClientSupabaseClient() as any;

  const { data: cycleData, error: cycleError } = await supabase
    .from('startup_events')
    .select('id, name, start_date, demo_date')
    .filter('config->>kind', 'eq', 'ai_pulse')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('demo_date', { ascending: false, nullsFirst: false });

  if (cycleError) throw new Error(cycleError.message);

  const cycleRows = (cycleData ?? []) as CycleRow[];
  const cycleIds = cycleRows.map((c) => c.id);

  const [minSessionAttendees, attendance, starter] = await Promise.all([
    readMinSessionAttendees(supabase),
    readAttendance(supabase, cycleIds),
    readStarterTakeup(supabase, cycleIds),
  ]);

  // Fold attendance into per-cycle counts.
  const totals = new Map<string, number>();
  const counts = new Map<string, Record<SignalKey, number>>();
  for (const id of cycleIds) {
    totals.set(id, 0);
    counts.set(id, emptyCounts());
  }
  for (const row of attendance.rows) {
    const bucket = counts.get(row.event_id);
    if (!bucket) continue;
    totals.set(row.event_id, (totals.get(row.event_id) ?? 0) + 1);
    const signals = row.engagement_signals ?? {};
    for (const key of SIGNAL_KEYS) {
      if (SIGNAL_TESTS[key](signals)) bucket[key] += 1;
    }
  }

  // Newest first, matching the read order.
  const cycles: CycleTrend[] = cycleRows.map((c) => {
    const attended = totals.get(c.id) ?? 0;
    const bucket = counts.get(c.id) ?? emptyCounts();
    const signals = {} as Record<SignalKey, SignalCell>;
    for (const key of SIGNAL_KEYS) {
      signals[key] = {
        count: bucket[key],
        // A cycle with no attendance rows has no denominator, and a truncated
        // read has an untrustworthy one. Both are NOT CAPTURED, never 0%.
        rate:
          attended > 0 && !attendance.truncated
            ? (bucket[key] / attended) * 100
            : null,
        delta_pp: null,
        direction: null,
      };
    }
    return {
      cycle_id: c.id,
      name: c.name ?? 'Untitled cycle',
      session_date: toDateOnly(c.start_date) ?? toDateOnly(c.demo_date),
      attended,
      is_session: attended >= minSessionAttendees,
      signals,
    };
  });

  // Order on the RESOLVED date, not on the two raw columns. The read orders by
  // start_date then demo_date, but the date this page DISPLAYS and compares on
  // is `start_date ?? demo_date` — so a cycle with a NULL start_date sinks to
  // the bottom of the list no matter when it actually ran. That is currently
  // masked (the affected rows have 0 attendees and are held out of the trend),
  // but `sessions` preserves this order, deltas pair sessions[i] with
  // sessions[i+1], and the headline reads the last element. The first
  // NULL-start_date cycle with real attendance would therefore compare the
  // wrong pair — the one thing this page exists to compute. Nulls sort last.
  cycles.sort((a, b) => {
    if (a.session_date === b.session_date) return 0;
    if (a.session_date === null) return 1;
    if (b.session_date === null) return -1;
    return a.session_date < b.session_date ? 1 : -1;
  });

  // Deltas compare each session to the NEXT-OLDER session, stepping over the
  // cycles that did not clear the bar so a one-attendee week cannot fake a swing.
  const sessions = cycles.filter((c) => c.is_session);
  for (let i = 0; i < sessions.length - 1; i += 1) {
    const current = sessions[i];
    const older = sessions[i + 1];
    for (const key of SIGNAL_KEYS) {
      const now = current.signals[key].rate;
      const before = older.signals[key].rate;
      if (now === null || before === null) continue;
      const delta = now - before;
      current.signals[key].delta_pp = delta;
      current.signals[key].direction = directionOf(delta);
    }
  }

  return {
    cycles,
    excluded: cycles
      .filter((c) => !c.is_session)
      .map((c) => ({
        cycle_id: c.cycle_id,
        session_date: c.session_date,
        attended: c.attended,
      })),
    min_session_attendees: minSessionAttendees,
    truncated: attendance.truncated,
    starter,
    callouts: attendance.truncated ? [] : buildCallouts(cycles),
  };
}

// ============================================================================
// React Query hook
// ============================================================================

export function usePulseTrends(): UseQueryResult<PulseTrends, Error> {
  return useQuery<PulseTrends, Error>({
    queryKey: ['ai-pulse', 'trends'],
    queryFn: getPulseTrends,
    staleTime: 60_000,
  });
}
