/**
 * AI Pulse — Live Session Service
 *
 * Backs Wave B.2 surfaces: the learner-facing live Thursday 6:55 PM session UI.
 * This service captures the 4-AND engagement-gate signals (spec v3 §2 / Q5)
 * that drive the locked outcome metric `engaged_attendance_rate ≥ 95%`.
 *
 * 4-AND engagement gate (per spec v3):
 *   ENGAGED iff joined_within_5min AND polls_responded ≥ 3 AND
 *           stayed_until_end AND quiz_passed
 *
 * Storage:
 *   - Each AI Pulse cycle is a row in `startup_events` with
 *     config->>'kind' = 'ai_pulse'.
 *   - Per-learner engagement signals live in
 *     `ai_pulse_live_attendance.engagement_signals` JSONB — one row per
 *     (event_id, profile_id, day_type). This is the per-LEARNER attendance
 *     table; the events module's `event_team_attendance` is per-TEAM
 *     (registration_id) and cannot represent an individual's 4-AND gate.
 *
 *   engagement_signals shape:
 *     {
 *       joined_within_5min: boolean,
 *       polls_responded: number,
 *       stayed_until: string  (HH:MM, e.g. "19:28"),
 *       quiz_score: number    (0–100)
 *     }
 *
 *   Service helpers preserve unknown JSONB keys via spread merge so other
 *   agents writing to the same row (rotation marker, async makeup writer)
 *   don't get clobbered.
 *
 * LEAVE TIME IS A JSONB SIGNAL, NOT A COLUMN
 *   `ai_pulse_live_attendance.left_at` exists in the schema and has NEVER been
 *   written: 0 of 3,631 production rows (measured 2026-08-21). The only code
 *   that ever tried was `app/api/ai-pulse/meet/webhook`, which until this
 *   change wrote to `event_team_attendance` — a per-TEAM table that has no
 *   `left_at`, no `joined_at` and no `learner_id` column, so every call failed
 *   before it could reach this table.
 *
 *   Leave time therefore lives ONLY in `engagement_signals`:
 *     last_heartbeat_at — ISO, the last moment the learner was observed
 *     stayed_until      — the same instant rendered IST "HH:MM" (e.g. "19:28")
 *   Both are written together by `recordHeartbeat` and by the Meet webhook.
 *   The 4-AND gate consumes `stayed_until` (see `isPresentAtEnd`); the trend
 *   and participation surfaces test it for PRESENCE. Do NOT reintroduce a
 *   `left_at` read anywhere — it returns a confident null that reads as a real
 *   "0 minutes / never left" in any report that trusts it.
 *
 * Permission gate:
 *   Page-level uses `aiPulse:view.self` (in PR #716). The service itself
 *   trusts RLS — every write is keyed to auth.uid() so a learner can only
 *   record their own attendance row.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EngagementSignals {
  joined_within_5min?: boolean;
  joined_at?: string; // ISO timestamp
  polls_responded?: number;
  stayed_until?: string; // HH:MM
  last_heartbeat_at?: string; // ISO timestamp
  quiz_score?: number; // 0–100
  quiz_passed?: boolean;
  quiz_async_makeup?: boolean;
  /** CARE E-move: optional "what should change next week?" free text. */
  feedback_text?: string;
}

export interface LivePoll {
  id: string;
  cycle_id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  is_open: boolean;
  issued_at: string;
  closed_at: string | null;
}

export interface LivePollResponse {
  poll_id: string;
  option_id: string;
}

/** A poll as the Champion's authoring control sees it — with a live count. */
export interface ChampionPoll {
  id: string;
  cycle_id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  is_open: boolean;
  issued_at: string;
  closed_at: string | null;
  response_count: number;
}

/**
 * A poll accepts responses iff is_open AND closed_at is null AND we're before
 * the session end. No cron — derived on read. Shared by the learner panel
 * (don't submit to a stale poll) and the service guard.
 */
export function pollIsAcceptingResponses(
  poll: { is_open?: boolean | null; closed_at?: string | null },
  endsAt: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (poll.is_open === false) return false;
  if (poll.closed_at) return false;
  if (endsAt) {
    const end = new Date(endsAt).getTime();
    if (Number.isFinite(end) && nowMs >= end) return false;
  }
  return true;
}

/**
 * This week's Champion-chosen featured AI tool, resolved from
 * config.ai_pulse.featured_tool_id (standardized nested shape, with legacy
 * flat config.featured_tool_id fallback) → ai_pulse_featured_tools. Mirrors
 * the admin/NAAC read in cycles-service hydrateCycle; surfaced here so the
 * learner-facing live page can show it too.
 */
export interface LiveFeaturedTool {
  id: string;
  label_en: string;
  vendor_name: string | null;
}

export interface LiveSessionData {
  cycle: {
    id: string;
    title: string;
    status: string; // 'live' | 'post_event' | ...
    starts_at: string | null;
    ends_at: string | null;
    meet_url: string | null;
    primary_language: string;
    secondary_language: string | null;
  };
  /**
   * NO `left_at` HERE, DELIBERATELY. The column exists on
   * `ai_pulse_live_attendance` and has never been written — 0 of 3,631
   * production rows carry a value (measured 2026-08-21). It used to be
   * surfaced on this type as an always-null field, which is the worst
   * possible shape: a consumer reading it gets a confident `null` that looks
   * like "never left" rather than "never recorded". Leave time is read from
   * `engagement_signals.stayed_until` (IST "HH:MM") / `last_heartbeat_at`
   * (ISO), which every other AI Pulse surface already uses.
   */
  attendance: {
    id: string | null;
    joined_at: string | null;
    engagement_signals: EngagementSignals;
  };
  polls: LivePoll[];
  quiz_open: boolean;
  quiz_async_window_open: boolean; // 48h async make-up window
  /**
   * Length of the async make-up window in hours (`async_makeup_window_hours`
   * policy, seeded 48).
   *
   * PRE-EXISTING BUG, fixed here because this gate is "you touched it, you own
   * it": `getLiveSession` has always returned this key and
   * `live-session-shell.tsx` has always destructured it and passed it to
   * EngagementProgress / the quiz panel — but it was never declared on this
   * interface, so the returned object literal tripped TS2353 (excess property)
   * and the value was invisible to every consumer's types. Declaring it is the
   * fix; nothing about the runtime behaviour changes.
   */
  async_makeup_window_hours: number;
  /**
   * Join button window. Cycles appear on My Pulse up to a week early —
   * join_open gates the button so an early click can't farm the on-time
   * gate. Opens `join_doors_open_minutes` (policy, seeded 15) before
   * starts_at, closes at ends_at.
   */
  join_open: boolean;
  join_opens_at: string | null; // ISO — when the button unlocks
  /**
   * The Champion's featured AI tool for this cycle, or null when none is set
   * (or the tool row was removed). Shown in the live-session header card.
   */
  featured_tool: LiveFeaturedTool | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Minutes between two ISO/parseable timestamps. */
function diffMinutes(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;
}

/**
 * Compute the on-time-join signal relative to cycle.starts_at.
 *
 * The window is policy-driven (`late_threshold_minutes`, seeded 10) — NOT the
 * old hardcoded 5 minutes. The JSONB signal key stays `joined_within_5min`
 * for backward compatibility (6 files read it); semantically it now means
 * "joined within the configured late threshold".
 */
export function withinJoinWindow(
  joinedAt: string,
  startsAt: string | null,
  windowMinutes: number,
): boolean {
  if (!startsAt) return true; // no start time → assume in-window
  const joined = new Date(joinedAt).getTime();
  const start = new Date(startsAt).getTime();
  return joined <= start + windowMinutes * 60_000;
}

// ---------------------------------------------------------------------------
// Policy reads (config mandate — every threshold is an ai_pulse_policies row)
// ---------------------------------------------------------------------------

export type PolicyMap = Record<string, unknown>;

let policyCache: { fetchedAt: number; map: PolicyMap } | null = null;
const POLICY_CACHE_TTL_MS = 60_000;

/**
 * Fetch active ai_pulse_policies rows as a config_key→value map. Cached at
 * module level for 60s so the per-action helpers (recordJoin, submitQuiz,
 * getLiveSession) don't refetch on every call. RLS: active rows are readable
 * by any authenticated user (PR #644/#715).
 */
export async function readPolicies(supabase: any): Promise<PolicyMap> {
  if (policyCache && Date.now() - policyCache.fetchedAt < POLICY_CACHE_TTL_MS) {
    return policyCache.map;
  }
  const { data, error } = await supabase
    .from('ai_pulse_policies')
    .select('config_key, value_jsonb')
    .eq('is_active', true);
  if (error) {
    logger.warn('ai-pulse/live-session', 'policy fetch failed — using fallbacks', error);
    return policyCache?.map ?? {};
  }
  const map: PolicyMap = {};
  for (const row of (data ?? []) as Array<{ config_key: string; value_jsonb: unknown }>) {
    map[row.config_key] = row.value_jsonb;
  }
  policyCache = { fetchedAt: Date.now(), map };
  return map;
}

/** Coerce a policy value to a finite number, else the fallback. */
export function policyNumber(map: PolicyMap, key: string, fallback: number): number {
  const v = Number(map[key]);
  return Number.isFinite(v) ? v : fallback;
}

/** "HH:MM" of an ISO timestamp in IST (Asia/Kolkata). */
export function isoToIstHHMM(iso: string): string {
  const d = new Date(iso);
  // toLocaleTimeString with IST keeps formatting consistent across deploys
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Derive ISO starts_at/ends_at for an AI Pulse cycle.
 *
 * `startup_events` has no starts_at/ends_at columns — the cycle's calendar
 * date lives in `demo_date` (fallback `start_date`) and the session window
 * (HH:MM, IST) lives in `config.ai_pulse.session_start_time` /
 * `session_end_time` (seeded defaults 18:55–19:30). We compose them into IST
 * timestamps the 4-AND gate can compare against.
 */
export function deriveCycleTimes(row: {
  demo_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  config?: unknown;
}): { starts_at: string | null; ends_at: string | null } {
  const config = (row.config ?? {}) as Record<string, unknown>;
  const aiPulse = (config.ai_pulse ?? {}) as Record<string, unknown>;
  // demo_date/start_date are timestamptz — take the DATE part only, else the
  // template below produces "…T00:00:00+00:00T18:55…" → Invalid Date (B7).
  const rawDate = (row.demo_date ?? row.start_date ?? null) as string | null;
  const date = rawDate ? rawDate.slice(0, 10) : null;
  const startHHMM =
    typeof aiPulse.session_start_time === 'string' ? aiPulse.session_start_time : '18:55';
  const endHHMM =
    typeof aiPulse.session_end_time === 'string' ? aiPulse.session_end_time : '19:30';
  const starts_at = date
    ? `${date}T${startHHMM}:00+05:30`
    : ((row.start_date ?? null) as string | null);
  const ends_at = date
    ? `${date}T${endHHMM}:00+05:30`
    : ((row.end_date ?? null) as string | null);
  return { starts_at, ends_at };
}

/**
 * Effective cycle status, derived from the session window.
 *
 * Nothing in the platform transitions a cycle out of 'draft' (cycles-service
 * only ever writes 'draft' on create and 'cancelled' on cancel), so the
 * heartbeat gate ("only while live") and the quiz gate ("opens post_event")
 * were unreachable — cycle #1 (2026-06-11) recorded zero engagement because
 * of it. Instead of adding status-flipping machinery someone must remember
 * to run, derive the status from the clock: a draft cycle inside its session
 * window IS live, and past its window IS post_event. Explicit non-draft
 * statuses (cancelled, or anything set by hand) always win.
 */
export function deriveEffectiveStatus(
  rawStatus: string,
  startsAt: string | null,
  endsAt: string | null,
  nowMs: number = Date.now(),
): string {
  if (rawStatus !== 'draft') return rawStatus;
  if (!startsAt || !endsAt) return rawStatus;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return rawStatus;
  if (nowMs >= start && nowMs <= end) return 'live';
  if (nowMs > end) return 'post_event';
  return rawStatus;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LiveSessionService {
  /**
   * Fetch everything the live page needs in one round-trip:
   *   - cycle (startup_events row, AI-Pulse-flagged)
   *   - this learner's attendance row + engagement_signals
   *   - open polls for this cycle
   *   - quiz availability flags (live window vs 48h async)
   */
  static async getLiveSession(cycleId: string): Promise<LiveSessionData> {
    // Cast to any: this service touches ai_pulse_live_attendance (+ the deferred
    // ai_pulse_polls/poll_responses), which are not yet in the generated
    // Database types. Matches the per-call cast pattern in cycles-service.
    const supabase = createClientSupabaseClient() as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Cycle row (startup_events has no title/starts_at/ends_at columns —
    // the real columns are name + demo_date/start_date/end_date + config).
    const { data: cycleRow, error: cycleErr } = await supabase
      .from('startup_events')
      .select('id, name, status, demo_date, start_date, end_date, config')
      .eq('id', cycleId)
      .maybeSingle();

    if (cycleErr) {
      logger.error('ai-pulse/live-session', 'cycle fetch failed', cycleErr);
      throw cycleErr;
    }
    if (!cycleRow) throw new Error('Cycle not found');

    const config = (cycleRow.config ?? {}) as Record<string, unknown>;
    const aiPulse = (config.ai_pulse ?? {}) as Record<string, unknown>;

    // Champion-chosen featured tool — read the raw config in code (NOT a
    // PostgREST `->>dotted.key` filter, which returns false-empty on dotted
    // JSON keys). Nested-first (config.ai_pulse.featured_tool_id), with a
    // fallback to the legacy flat shape (config.featured_tool_id), matching
    // the canonical read in cycles-service hydrateCycle. Then join the
    // featured-tools master for its label + vendor (same columns the admin
    // side reads). Best-effort: a missing/removed tool degrades to null.
    let featured_tool: LiveFeaturedTool | null = null;
    const featuredToolId =
      (aiPulse.featured_tool_id as string | null | undefined) ??
      (config.featured_tool_id as string | null | undefined) ??
      null;
    if (featuredToolId) {
      const { data: ft } = await supabase
        .from('ai_pulse_featured_tools')
        .select('id, label_en, vendor_name')
        .eq('id', featuredToolId)
        .maybeSingle();
      if (ft) {
        featured_tool = {
          id: ft.id as string,
          label_en: ft.label_en as string,
          vendor_name: (ft.vendor_name ?? null) as string | null,
        };
      }
    }

    // Existing per-learner attendance row (if any)
    const { data: attRow } = await supabase
      .from('ai_pulse_live_attendance')
      // `left_at` is deliberately NOT selected — see LiveSessionData.attendance.
      .select('id, joined_at, engagement_signals, day_type')
      .eq('event_id', cycleId)
      .eq('profile_id', user.id)
      .eq('day_type', 'live_session')
      .maybeSingle();

    // ALL polls for this cycle, open and closed (best-effort — table may not
    // exist on all branches). The gate needs the full issued count so closing
    // a poll doesn't shrink the requirement; the panel filters to open ones.
    let polls: LivePoll[] = [];
    try {
      const { data: pollRows } = await supabase
        .from('ai_pulse_polls')
        .select('id, cycle_id, question, options, is_open, issued_at, closed_at')
        .eq('cycle_id', cycleId)
        .order('issued_at', { ascending: true });
      polls = (pollRows ?? []) as unknown as LivePoll[];
    } catch (e) {
      // Polls table optional in v1 — fall back to empty list silently
      polls = [];
    }

    const { starts_at: startsAt, ends_at: endsAt } = deriveCycleTimes(cycleRow);
    const now = Date.now();
    const status = deriveEffectiveStatus(
      (cycleRow.status ?? 'draft') as string,
      startsAt,
      endsAt,
      now,
    );

    // Authoritative polls_responded = COUNT(DISTINCT poll_id) of this learner's
    // responses to THIS cycle's polls. We recompute it here (rather than
    // trusting the JSONB counter) so the 4-AND gate can't be fooled by a stale
    // or hand-edited engagement_signals.polls_responded, and so re-answering
    // the same poll never inflates it. Best-effort: a missing table → keeps the
    // existing signal value.
    let signals = (attRow?.engagement_signals ?? {}) as EngagementSignals;
    try {
      const distinctResponded = await LiveSessionService.countDistinctPollsResponded(
        supabase,
        cycleId,
        user.id,
      );
      signals = { ...signals, polls_responded: distinctResponded };
    } catch {
      // leave signals.polls_responded as stored
    }

    // Async make-up window is policy-driven (async_makeup_window_hours, seeded 48).
    const policies = await readPolicies(supabase);
    const asyncWindowHours = policyNumber(policies, 'async_makeup_window_hours', 48);

    const quiz_open = status === 'post_event' &&
      (!endsAt || diffMinutes(new Date(now).toISOString(), endsAt) <= 60);

    const quiz_async_window_open = status === 'post_event' && !!endsAt &&
      diffMinutes(new Date(now).toISOString(), endsAt) <= asyncWindowHours * 60;

    // Join window — doors open `join_doors_open_minutes` before start
    // (Director decision 2026-06-12; policy-seeded 15), close at session end.
    const doorsOpenMinutes = policyNumber(policies, 'join_doors_open_minutes', 15);
    let join_open = true; // no derivable window → don't block (legacy cycles)
    let join_opens_at: string | null = null;
    if (startsAt) {
      const opensMs = new Date(startsAt).getTime() - doorsOpenMinutes * 60_000;
      join_opens_at = new Date(opensMs).toISOString();
      const endMs = endsAt ? new Date(endsAt).getTime() : Number.POSITIVE_INFINITY;
      join_open = now >= opensMs && now <= endMs;
    }

    return {
      cycle: {
        id: cycleRow.id as string,
        title: (cycleRow.name ?? 'AI Pulse Cycle') as string,
        status,
        starts_at: startsAt,
        ends_at: endsAt,
        meet_url: (aiPulse.meet_url ?? null) as string | null,
        primary_language: ((aiPulse.primary_language ?? 'en') as string),
        secondary_language: ((aiPulse.secondary_language ?? null) as string | null),
      },
      attendance: {
        id: (attRow?.id ?? null) as string | null,
        joined_at: (attRow?.joined_at ?? null) as string | null,
        engagement_signals: signals,
      },
      polls,
      quiz_open,
      quiz_async_window_open,
      async_makeup_window_hours: asyncWindowHours,
      join_open,
      join_opens_at,
      featured_tool,
    };
  }

  /**
   * Record the learner pressing the Join button.
   *
   * Upserts an `ai_pulse_live_attendance` row keyed by (event_id, profile_id,
   * day_type='live_session'). Stamps joined_at + computes joined_within_5min.
   */
  static async recordJoin(cycleId: string): Promise<EngagementSignals> {
    // Cast to any: this service touches ai_pulse_live_attendance (+ the deferred
    // ai_pulse_polls/poll_responses), which are not yet in the generated
    // Database types. Matches the per-call cast pattern in cycles-service.
    const supabase = createClientSupabaseClient() as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Read cycle date + config to derive starts_at for joined_within_5min
    const { data: cycleRow } = await supabase
      .from('startup_events')
      .select('demo_date, start_date, end_date, config')
      .eq('id', cycleId)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const { starts_at: startsAt } = deriveCycleTimes(cycleRow ?? {});
    // On-time window is the late_threshold_minutes policy row (seeded 10) —
    // replaces the old hardcoded 5 minutes.
    const policies = await readPolicies(supabase);
    const lateThresholdMinutes = policyNumber(policies, 'late_threshold_minutes', 10);
    const joinedWithinWindow = withinJoinWindow(nowIso, startsAt, lateThresholdMinutes);

    // Read existing row (preserve other writers' JSONB keys)
    const { data: existing } = await supabase
      .from('ai_pulse_live_attendance')
      .select('id, engagement_signals')
      .eq('event_id', cycleId)
      .eq('profile_id', user.id)
      .eq('day_type', 'live_session')
      .maybeSingle();

    const prevSignals = (existing?.engagement_signals ?? {}) as EngagementSignals;
    const nextSignals: EngagementSignals = {
      ...prevSignals,
      joined_at: nowIso,
      joined_within_5min: joinedWithinWindow,
    };

    const { error } = await supabase
      .from('ai_pulse_live_attendance')
      .upsert(
        {
          event_id: cycleId,
          profile_id: user.id,
          day_type: 'live_session',
          joined_at: nowIso,
          engagement_signals: nextSignals,
          updated_at: nowIso,
        },
        { onConflict: 'event_id,profile_id,day_type' },
      );

    if (error) {
      logger.error('ai-pulse/live-session', 'recordJoin upsert failed', error);
      throw error;
    }
    return nextSignals;
  }

  /**
   * Record a poll response.
   *
   * 1. Upserts the (poll_id, profile_id) audit row in ai_pulse_poll_responses
   *    (UNIQUE(poll_id, profile_id)) — re-answering the same poll updates the
   *    chosen option, it does NOT create a second row.
   * 2. Recomputes polls_responded = COUNT(DISTINCT poll_id) for this learner in
   *    this cycle (NOT a naive +1) and writes it onto engagement_signals, so
   *    re-answering the same poll can never inflate the gate count.
   *
   * The poll must be accepting responses (is_open AND not closed AND before
   * session end) — RLS allows the insert, but the service rejects a closed /
   * stale poll up front so the learner gets a clear error.
   */
  static async recordPollResponse(
    cycleId: string,
    pollId: string,
    optionId: string,
  ): Promise<EngagementSignals> {
    // Cast to any: this service touches ai_pulse_live_attendance +
    // ai_pulse_polls/poll_responses, which are not yet in the generated
    // Database types. Matches the per-call cast pattern in cycles-service.
    const supabase = createClientSupabaseClient() as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Guard: the poll must be accepting responses. Derive session_end from the
    // cycle (no cron — derived on read). A closed / past-window poll is
    // rejected here so the learner sees "This poll is closed." instead of a
    // silent no-op.
    const { data: pollRow } = await supabase
      .from('ai_pulse_polls')
      .select('id, cycle_id, is_open, closed_at')
      .eq('id', pollId)
      .maybeSingle();
    if (!pollRow) throw new Error('Poll not found.');

    const { data: cycleRow } = await supabase
      .from('startup_events')
      .select('demo_date, start_date, end_date, config')
      .eq('id', cycleId)
      .maybeSingle();
    const { ends_at: endsAt } = deriveCycleTimes(cycleRow ?? {});
    if (!pollIsAcceptingResponses(pollRow, endsAt)) {
      throw new Error('This poll is closed and no longer accepting responses.');
    }

    // Upsert the audit row — UNIQUE(poll_id, profile_id) makes re-answering an
    // update, not a duplicate. The distinct count below stays correct either
    // way.
    const { error: respErr } = await supabase
      .from('ai_pulse_poll_responses')
      .upsert(
        {
          poll_id: pollId,
          profile_id: user.id,
          option_id: optionId,
          responded_at: new Date().toISOString(),
        },
        { onConflict: 'poll_id,profile_id' },
      );
    if (respErr) {
      logger.error('ai-pulse/live-session', 'poll response upsert failed', respErr);
      throw respErr;
    }

    // Recompute polls_responded = COUNT(DISTINCT poll_id) for this learner in
    // this cycle. Join responses → polls so we only count polls belonging to
    // THIS cycle (a learner's responses across cycles never cross-contaminate).
    const pollsResponded = await LiveSessionService.countDistinctPollsResponded(
      supabase,
      cycleId,
      user.id,
    );

    // Persist the recomputed count onto engagement_signals (preserving other
    // writers' JSONB keys via spread).
    const { data: existing } = await supabase
      .from('ai_pulse_live_attendance')
      .select('id, engagement_signals')
      .eq('event_id', cycleId)
      .eq('profile_id', user.id)
      .eq('day_type', 'live_session')
      .maybeSingle();

    const prevSignals = (existing?.engagement_signals ?? {}) as EngagementSignals;
    const nextSignals: EngagementSignals = {
      ...prevSignals,
      polls_responded: pollsResponded,
    };

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('ai_pulse_live_attendance')
      .upsert(
        {
          event_id: cycleId,
          profile_id: user.id,
          day_type: 'live_session',
          engagement_signals: nextSignals,
          updated_at: nowIso,
        },
        { onConflict: 'event_id,profile_id,day_type' },
      );

    if (error) {
      logger.error(
        'ai-pulse/live-session',
        'recordPollResponse upsert failed',
        error,
      );
      throw error;
    }
    return nextSignals;
  }

  /**
   * COUNT(DISTINCT poll_id) of this learner's responses to polls in this cycle.
   * Reads the learner's response rows + the cycle's poll ids and intersects in
   * code (PostgREST has no DISTINCT-count aggregate exposed here). Best-effort:
   * a missing polls table → 0.
   */
  static async countDistinctPollsResponded(
    supabase: any,
    cycleId: string,
    profileId: string,
  ): Promise<number> {
    const { data: cyclePolls } = await supabase
      .from('ai_pulse_polls')
      .select('id')
      .eq('cycle_id', cycleId);
    const cyclePollIds = new Set(
      ((cyclePolls ?? []) as Array<{ id: string }>).map((p) => p.id),
    );
    if (cyclePollIds.size === 0) return 0;

    const { data: responses } = await supabase
      .from('ai_pulse_poll_responses')
      .select('poll_id')
      .eq('profile_id', profileId);
    const answered = new Set<string>();
    for (const r of (responses ?? []) as Array<{ poll_id: string }>) {
      if (cyclePollIds.has(r.poll_id)) answered.add(r.poll_id);
    }
    return answered.size;
  }

  /**
   * Champion: create a live poll for this cycle. Inserts an ai_pulse_polls row
   * with is_open=true. RLS enforces Champion + Co-Champion (ai_pulse_champion
   * role) — a non-Champion's insert is rejected by the database.
   */
  static async createPoll(
    cycleId: string,
    question: string,
    options: Array<{ id: string; label: string }>,
  ): Promise<LivePoll> {
    const supabase = createClientSupabaseClient() as any;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const trimmedQ = question.trim();
    if (!trimmedQ) throw new Error('Poll question is required.');
    const cleanOptions = options
      .map((o) => ({ id: o.id, label: o.label.trim() }))
      .filter((o) => o.label.length > 0);
    if (cleanOptions.length < 2 || cleanOptions.length > 4) {
      throw new Error('A poll needs between 2 and 4 non-empty options.');
    }

    const { data, error } = await supabase
      .from('ai_pulse_polls')
      .insert({
        cycle_id: cycleId,
        question: trimmedQ,
        options: cleanOptions,
        is_open: true,
        created_by: user.id,
      })
      .select('id, cycle_id, question, options, issued_at, closed_at')
      .single();

    if (error) {
      logger.error('ai-pulse/live-session', 'createPoll failed', error);
      throw error;
    }
    return data as unknown as LivePoll;
  }

  /**
   * Champion: close a poll. Sets is_open=false + closed_at=now so it stops
   * accepting responses. RLS enforces Champion + Co-Champion.
   */
  static async closePoll(pollId: string): Promise<void> {
    const supabase = createClientSupabaseClient() as any;
    const { error } = await supabase
      .from('ai_pulse_polls')
      .update({ is_open: false, closed_at: new Date().toISOString() })
      .eq('id', pollId);
    if (error) {
      logger.error('ai-pulse/live-session', 'closePoll failed', error);
      throw error;
    }
  }

  /**
   * Champion: list every poll for a cycle with its live response count. Backs
   * the Champion's issue-poll control. Two reads (polls + responses) intersect
   * in code — RLS lets the Champion read all response rows.
   */
  static async listPollsWithCounts(cycleId: string): Promise<ChampionPoll[]> {
    const supabase = createClientSupabaseClient() as any;

    const { data: pollRows, error } = await supabase
      .from('ai_pulse_polls')
      .select('id, cycle_id, question, options, is_open, issued_at, closed_at')
      .eq('cycle_id', cycleId)
      .order('issued_at', { ascending: false });
    if (error) {
      logger.error('ai-pulse/live-session', 'listPollsWithCounts failed', error);
      throw error;
    }
    const polls = (pollRows ?? []) as Array<
      Omit<ChampionPoll, 'response_count'>
    >;
    if (polls.length === 0) return [];

    const pollIds = polls.map((p) => p.id);
    const { data: respRows } = await supabase
      .from('ai_pulse_poll_responses')
      .select('poll_id')
      .in('poll_id', pollIds);
    const counts = new Map<string, number>();
    for (const r of (respRows ?? []) as Array<{ poll_id: string }>) {
      counts.set(r.poll_id, (counts.get(r.poll_id) ?? 0) + 1);
    }
    return polls.map((p) => ({
      ...p,
      response_count: counts.get(p.id) ?? 0,
    }));
  }

  /**
   * Heartbeat: stamp last_heartbeat_at + recompute stayed_until as IST HH:MM.
   *
   * Final ping at session_end_time is what locks `stayed_until` ≈ ends_at,
   * which the 4-AND gate consumes as "stayed_until_end".
   */
  static async recordHeartbeat(cycleId: string): Promise<EngagementSignals> {
    // Cast to any: this service touches ai_pulse_live_attendance (+ the deferred
    // ai_pulse_polls/poll_responses), which are not yet in the generated
    // Database types. Matches the per-call cast pattern in cycles-service.
    const supabase = createClientSupabaseClient() as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: existing } = await supabase
      .from('ai_pulse_live_attendance')
      .select('id, engagement_signals')
      .eq('event_id', cycleId)
      .eq('profile_id', user.id)
      .eq('day_type', 'live_session')
      .maybeSingle();

    if (!existing) {
      // No join → no heartbeat. Don't create a row from a heartbeat.
      return {} as EngagementSignals;
    }

    const prevSignals = (existing.engagement_signals ?? {}) as EngagementSignals;
    const nowIso = new Date().toISOString();
    const nextSignals: EngagementSignals = {
      ...prevSignals,
      last_heartbeat_at: nowIso,
      stayed_until: isoToIstHHMM(nowIso),
    };

    const { error } = await supabase
      .from('ai_pulse_live_attendance')
      .update({
        engagement_signals: nextSignals,
        updated_at: nowIso,
      })
      .eq('id', existing.id);

    if (error) {
      logger.error(
        'ai-pulse/live-session',
        'recordHeartbeat update failed',
        error,
      );
      throw error;
    }
    return nextSignals;
  }

  /**
   * Submit the post-session quiz. Writes quiz_score + quiz_passed into
   * engagement_signals, plus a quiz_async_makeup flag if submitted in the
   * 60min–48h window. Optional `feedback` ("what should change next week?")
   * rides the same write — the CARE E-move voice channel; surfaced to the
   * Champion on the admin cycle page, anonymously.
   */
  static async submitQuiz(
    cycleId: string,
    score: number,
    asyncMakeup: boolean,
    feedback?: string,
  ): Promise<EngagementSignals> {
    // Cast to any: this service touches ai_pulse_live_attendance (+ the deferred
    // ai_pulse_polls/poll_responses), which are not yet in the generated
    // Database types. Matches the per-call cast pattern in cycles-service.
    const supabase = createClientSupabaseClient() as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (score < 0 || score > 100 || !Number.isFinite(score)) {
      throw new Error(`Invalid quiz score: ${score} (expected 0–100)`);
    }

    const { data: existing } = await supabase
      .from('ai_pulse_live_attendance')
      .select('id, engagement_signals')
      .eq('event_id', cycleId)
      .eq('profile_id', user.id)
      .eq('day_type', 'live_session')
      .maybeSingle();

    // Pass threshold is policy-driven per submission type:
    //   live submission  → quiz_pass_threshold_live  (seeded 40)
    //   async make-up    → quiz_pass_threshold_async (seeded 60)
    // Replaces the old hardcoded DEFAULT_PASS_THRESHOLD = 60.
    const policies = await readPolicies(supabase);
    const passThreshold = asyncMakeup
      ? policyNumber(policies, 'quiz_pass_threshold_async', 60)
      : policyNumber(policies, 'quiz_pass_threshold_live', 40);

    const prevSignals = (existing?.engagement_signals ?? {}) as EngagementSignals;
    const trimmedFeedback = feedback?.trim();
    const nextSignals: EngagementSignals = {
      ...prevSignals,
      quiz_score: score,
      quiz_passed: score >= passThreshold,
      quiz_async_makeup: asyncMakeup,
      ...(trimmedFeedback ? { feedback_text: trimmedFeedback } : {}),
    };

    // Always write to the learner's live_session row (async make-up is a flag
    // on the signals, not a separate row) so the 4-AND gate — which reads the
    // live_session row — sees the quiz score regardless of submission window.
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('ai_pulse_live_attendance')
      .upsert(
        {
          event_id: cycleId,
          profile_id: user.id,
          day_type: 'live_session',
          engagement_signals: nextSignals,
          updated_at: nowIso,
        },
        { onConflict: 'event_id,profile_id,day_type' },
      );

    if (error) {
      logger.error('ai-pulse/live-session', 'submitQuiz upsert failed', error);
      throw error;
    }
    return nextSignals;
  }
}

// ---------------------------------------------------------------------------
// 4-AND gate evaluation (pure)
// ---------------------------------------------------------------------------

export interface GateStatus {
  joined_within_5min: boolean;
  polls_responded_ok: boolean;
  stayed_until_end: boolean;
  quiz_passed: boolean;
  /** How many polls the Champion issued this cycle. Informational only — polls
   *  are NOT part of the engagement verdict until poll authoring is wired into
   *  live sessions (see specs/ai-pulse-graph-attendance-integration-2026-06-18.md). */
  polls_issued: number;
  /** How many poll responses this learner needs (min(3, polls_issued)). Display only. */
  polls_required: number;
  /** Real signals passed (0..3): joined / stayed / quiz. Polls excluded. */
  passed_count: number; // 0..3
  /** Number of gates counted toward the verdict (currently 3 — polls excluded). */
  total: number;
  is_engaged: boolean;
}

/**
 * The last heartbeat can land up to one interval (60s) before ends_at, and
 * isoToIstHHMM truncates seconds — so requiring stayed_until >= the exact end
 * HH:MM fails learners who genuinely stayed. Accept heartbeats within this
 * many minutes of the end.
 */
export const STAY_TOLERANCE_MINUTES = 5;

/** Subtract `minutes` from an "HH:MM" string, clamped at 00:00 (same-day). */
export function hhmmMinusMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const total = Math.max(0, h * 60 + m - minutes);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Observable "present at session end" — the single source of truth for the
 * `stayed_until_end` sub-gate, shared across evaluateGates, the dept heatmap,
 * the weekly digest, the learner badge, and the PDE bridge.
 *
 * It is TRUE if EITHER:
 *   1. the client-side heartbeat recorded `stayed_until` at/after the end
 *      threshold (the original sensor), OR
 *   2. the learner took the quiz IN THE LIVE WINDOW —
 *      `typeof signals.quiz_score === 'number'` AND not an async make-up.
 *
 * Rationale: AI Pulse sessions run on an EXTERNAL meeting link
 * (jkkn.in/ai-pulse), so learners leave the MyJKKN page and the heartbeat
 * never fires — `stayed_until` is never recorded and the heartbeat sensor
 * reads false for everyone despite real attendance. The live quiz only opens
 * at session end, so having taken it live is an observable substitute for
 * being present at the end. Async make-ups (`quiz_async_makeup === true`) are
 * taken AFTER the session, so they are NOT credited as "stayed".
 *
 * `endThresholdHHMM` is the cycle's session-end "HH:MM" (already
 * tolerance-adjusted by the caller via hhmmMinusMinutes, or pass the raw end
 * and let this apply the tolerance). Pass `null` when no end time is available
 * (e.g. the learner badge reads from event_team_attendance with no cycle
 * config in scope) — the heartbeat branch is then skipped and only the
 * quiz-live proxy can satisfy presence.
 */
export function isPresentAtEnd(
  signals: Pick<
    EngagementSignals,
    'stayed_until' | 'quiz_score' | 'quiz_async_makeup'
  >,
  endThresholdHHMM: string | null,
): boolean {
  // Proxy: took the quiz live (not an async make-up) ⇒ present at end.
  const tookQuizLive =
    typeof signals.quiz_score === 'number' &&
    signals.quiz_async_makeup !== true;
  if (tookQuizLive) return true;

  // Original heartbeat sensor (only usable when we know the end time).
  if (signals.stayed_until && endThresholdHHMM) {
    return signals.stayed_until >= endThresholdHHMM;
  }
  return false;
}

/**
 * The engagement verdict — honest "2 of 3 real signals" (Model B, 2026-06-18).
 *
 * The three REAL, measurable signals are:
 *   - joined  (clicked Join on time — real in-app event)
 *   - stayed  (present at end: heartbeat OR took the quiz live — see isPresentAtEnd)
 *   - quiz    (passed the weekly check — the actual learning outcome)
 *
 * `polls` is deliberately EXCLUDED from the verdict. It used to be the 4th gate,
 * but it was never a trustworthy signal: no cycle has issued polls, so the old
 * `evaluateGates` auto-PASSED it as a free point (inflating the score) while the
 * learner badge required real responses (deflating it) — the same learner read
 * "engaged" on the heatmap and "partial" on their badge. Until poll authoring is
 * wired into live sessions (blocked on the external-meeting venue — see
 * specs/ai-pulse-graph-attendance-integration-2026-06-18.md), polls is neither a
 * free pass nor a hard requirement: it simply doesn't count. Re-add it as a 4th
 * measurable gate (verdict → 3-of-4) once it's a working signal.
 *
 * History: 4-of-4 AND → 0% by construction (dead heartbeat) → 3-of-4 robust
 * (#1503, but with the polls free-pass) → this honest 2-of-3.
 *
 * `polls` is accepted for call-site compatibility but ignored. Shared so every
 * consumer (heatmap, learner badge, weekly digest, PDE bridge) agrees exactly.
 */
export function isEngagedFromGates(gates: {
  joined: boolean;
  stayed: boolean;
  quiz: boolean;
  polls?: boolean; // accepted but NOT counted — see doc above
}): boolean {
  const passed =
    Number(gates.joined) + Number(gates.stayed) + Number(gates.quiz);
  return passed >= 2;
}

/**
 * Evaluate the engagement gate from raw signals + cycle end time.
 * Pure function, used by both the progress bar and the engagement card.
 *
 * `pollsIssued` is how many polls exist for the cycle: the polls requirement
 * is min(3, pollsIssued), so a cycle with no polls (the polls feature has no
 * authoring surface yet) doesn't make engagement unattainable.
 */
export function evaluateGates(
  signals: EngagementSignals,
  endsAt: string | null,
  pollsIssued: number = 0,
): GateStatus {
  const joined_within_5min = !!signals.joined_within_5min;
  const polls_required = Math.min(3, Math.max(0, pollsIssued));
  const polls_responded_ok =
    polls_required === 0 || (signals.polls_responded ?? 0) >= polls_required;

  // Derive the tolerance-adjusted end "HH:MM" from the ISO end, then delegate
  // to the shared present-at-end helper (heartbeat OR live-quiz proxy).
  const endThresholdHHMM = endsAt
    ? hhmmMinusMinutes(
        isoToIstHHMM(endsAt),
        STAY_TOLERANCE_MINUTES,
      )
    : null;
  const stayed_until_end = isPresentAtEnd(signals, endThresholdHHMM);

  const quiz_passed = !!signals.quiz_passed;

  // Honest verdict (Model B): count only the 3 real signals. Polls is excluded
  // (it was a free auto-pass when un-issued); see isEngagedFromGates.
  const passed_count =
    Number(joined_within_5min) +
    Number(stayed_until_end) +
    Number(quiz_passed);

  return {
    joined_within_5min,
    polls_responded_ok,
    stayed_until_end,
    quiz_passed,
    polls_issued: Math.max(0, pollsIssued),
    polls_required,
    passed_count,
    total: 3,
    // Engaged = 2 of the 3 real signals (joined / stayed / quiz). Polls excluded.
    is_engaged: isEngagedFromGates({
      joined: joined_within_5min,
      polls: polls_responded_ok,
      stayed: stayed_until_end,
      quiz: quiz_passed,
    }),
  };
}

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

const liveSessionKey = (cycleId: string) =>
  ['ai-pulse', 'live-session', cycleId] as const;

export function useLiveSession(
  cycleId: string,
): UseQueryResult<LiveSessionData, Error> {
  return useQuery<LiveSessionData, Error>({
    queryKey: liveSessionKey(cycleId),
    queryFn: () => LiveSessionService.getLiveSession(cycleId),
    enabled: !!cycleId,
    staleTime: 15 * 1000, // 15s — live session, signals change fast
    // Effective status is clock-derived server-side at fetch time; poll so the
    // page crosses draft → live → post_event (heartbeat start, quiz opening)
    // without the learner having to reload.
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useRecordJoin(
  cycleId: string,
): UseMutationResult<EngagementSignals, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<EngagementSignals, Error, void>({
    mutationFn: () => LiveSessionService.recordJoin(cycleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: liveSessionKey(cycleId) });
    },
  });
}

export function useRecordPollResponse(
  cycleId: string,
): UseMutationResult<
  EngagementSignals,
  Error,
  { pollId: string; optionId: string }
> {
  const queryClient = useQueryClient();
  return useMutation<
    EngagementSignals,
    Error,
    { pollId: string; optionId: string }
  >({
    mutationFn: ({ pollId, optionId }) =>
      LiveSessionService.recordPollResponse(cycleId, pollId, optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: liveSessionKey(cycleId) });
    },
  });
}

// --- Champion-side poll authoring hooks ------------------------------------

const championPollsKey = (cycleId: string) =>
  ['ai-pulse', 'champion-polls', cycleId] as const;

/** Champion: live list of this cycle's polls with response counts. */
export function useChampionPolls(
  cycleId: string,
  enabled = true,
): UseQueryResult<ChampionPoll[], Error> {
  return useQuery<ChampionPoll[], Error>({
    queryKey: championPollsKey(cycleId),
    queryFn: () => LiveSessionService.listPollsWithCounts(cycleId),
    enabled: enabled && !!cycleId,
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000, // counts move during a live session
  });
}

/** Champion: issue a new poll. */
export function useCreatePoll(
  cycleId: string,
): UseMutationResult<
  LivePoll,
  Error,
  { question: string; options: Array<{ id: string; label: string }> }
> {
  const queryClient = useQueryClient();
  return useMutation<
    LivePoll,
    Error,
    { question: string; options: Array<{ id: string; label: string }> }
  >({
    mutationFn: ({ question, options }) =>
      LiveSessionService.createPoll(cycleId, question, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: championPollsKey(cycleId) });
      queryClient.invalidateQueries({ queryKey: liveSessionKey(cycleId) });
    },
  });
}

/** Champion: close a poll (stops accepting responses). */
export function useClosePoll(
  cycleId: string,
): UseMutationResult<void, Error, { pollId: string }> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { pollId: string }>({
    mutationFn: ({ pollId }) => LiveSessionService.closePoll(pollId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: championPollsKey(cycleId) });
      queryClient.invalidateQueries({ queryKey: liveSessionKey(cycleId) });
    },
  });
}

export function useRecordHeartbeat(
  cycleId: string,
): UseMutationResult<EngagementSignals, Error, void> {
  return useMutation<EngagementSignals, Error, void>({
    mutationFn: () => LiveSessionService.recordHeartbeat(cycleId),
    onSuccess: () => {
      // Don't invalidate on every heartbeat — it would thrash the page.
      // Caller can pull fresh state on demand.
    },
    // Heartbeat failures shouldn't crash the page.
    retry: 1,
  });
}

export function useSubmitQuiz(
  cycleId: string,
): UseMutationResult<
  EngagementSignals,
  Error,
  { score: number; asyncMakeup: boolean; feedback?: string }
> {
  const queryClient = useQueryClient();
  return useMutation<
    EngagementSignals,
    Error,
    { score: number; asyncMakeup: boolean; feedback?: string }
  >({
    mutationFn: ({ score, asyncMakeup, feedback }) =>
      LiveSessionService.submitQuiz(cycleId, score, asyncMakeup, feedback),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: liveSessionKey(cycleId) });
    },
  });
}
