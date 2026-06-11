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
}

export interface LivePoll {
  id: string;
  cycle_id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  issued_at: string;
  closed_at: string | null;
}

export interface LivePollResponse {
  poll_id: string;
  option_id: string;
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
  attendance: {
    id: string | null;
    joined_at: string | null;
    left_at: string | null;
    engagement_signals: EngagementSignals;
  };
  polls: LivePoll[];
  quiz_open: boolean;
  quiz_async_window_open: boolean; // 48h async make-up window
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
function withinJoinWindow(
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

type PolicyMap = Record<string, unknown>;

let policyCache: { fetchedAt: number; map: PolicyMap } | null = null;
const POLICY_CACHE_TTL_MS = 60_000;

/**
 * Fetch active ai_pulse_policies rows as a config_key→value map. Cached at
 * module level for 60s so the per-action helpers (recordJoin, submitQuiz,
 * getLiveSession) don't refetch on every call. RLS: active rows are readable
 * by any authenticated user (PR #644/#715).
 */
async function readPolicies(supabase: any): Promise<PolicyMap> {
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
function policyNumber(map: PolicyMap, key: string, fallback: number): number {
  const v = Number(map[key]);
  return Number.isFinite(v) ? v : fallback;
}

/** "HH:MM" of an ISO timestamp in IST (Asia/Kolkata). */
function isoToIstHHMM(iso: string): string {
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
function deriveCycleTimes(row: {
  demo_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  config?: unknown;
}): { starts_at: string | null; ends_at: string | null } {
  const config = (row.config ?? {}) as Record<string, unknown>;
  const aiPulse = (config.ai_pulse ?? {}) as Record<string, unknown>;
  const date = (row.demo_date ?? row.start_date ?? null) as string | null;
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

    // Existing per-learner attendance row (if any)
    const { data: attRow } = await supabase
      .from('ai_pulse_live_attendance')
      .select('id, joined_at, left_at, engagement_signals, day_type')
      .eq('event_id', cycleId)
      .eq('profile_id', user.id)
      .eq('day_type', 'live_session')
      .maybeSingle();

    // Open polls for this cycle (best-effort — table may not exist on all branches)
    let polls: LivePoll[] = [];
    try {
      const { data: pollRows } = await supabase
        .from('ai_pulse_polls')
        .select('id, cycle_id, question, options, issued_at, closed_at')
        .eq('cycle_id', cycleId)
        .is('closed_at', null)
        .order('issued_at', { ascending: true });
      polls = (pollRows ?? []) as unknown as LivePoll[];
    } catch (e) {
      // Polls table optional in v1 — fall back to empty list silently
      polls = [];
    }

    const status = (cycleRow.status ?? 'draft') as string;
    const { starts_at: startsAt, ends_at: endsAt } = deriveCycleTimes(cycleRow);
    const now = Date.now();

    // Async make-up window is policy-driven (async_makeup_window_hours, seeded 48).
    const policies = await readPolicies(supabase);
    const asyncWindowHours = policyNumber(policies, 'async_makeup_window_hours', 48);

    const quiz_open = status === 'post_event' &&
      (!endsAt || diffMinutes(new Date(now).toISOString(), endsAt) <= 60);

    const quiz_async_window_open = status === 'post_event' && !!endsAt &&
      diffMinutes(new Date(now).toISOString(), endsAt) <= asyncWindowHours * 60;

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
        left_at: (attRow?.left_at ?? null) as string | null,
        engagement_signals: ((attRow?.engagement_signals ?? {}) as EngagementSignals),
      },
      polls,
      quiz_open,
      quiz_async_window_open,
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
   * Record a poll response. Increments polls_responded and stores the
   * (poll_id, option_id) pair in a sibling table when available.
   *
   * The engagement-signal counter is the load-bearing field — the response
   * row is for audit / Champion review.
   */
  static async recordPollResponse(
    cycleId: string,
    pollId: string,
    optionId: string,
  ): Promise<EngagementSignals> {
    // Cast to any: this service touches ai_pulse_live_attendance (+ the deferred
    // ai_pulse_polls/poll_responses), which are not yet in the generated
    // Database types. Matches the per-call cast pattern in cycles-service.
    const supabase = createClientSupabaseClient() as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Best-effort audit row — the ai_pulse_poll_responses substrate is
    // deferred (polls feature not yet activated). supabase-js resolves with
    // an { error } rather than throwing when the table is absent, so this is
    // a no-op until the polls tables ship; the engagement counter below is
    // the load-bearing signal.
    await supabase.from('ai_pulse_poll_responses').insert({
      poll_id: pollId,
      profile_id: user.id,
      option_id: optionId,
      responded_at: new Date().toISOString(),
    });

    // Increment polls_responded on engagement_signals
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
      polls_responded: (prevSignals.polls_responded ?? 0) + 1,
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
   * 60min–48h window.
   */
  static async submitQuiz(
    cycleId: string,
    score: number,
    asyncMakeup: boolean,
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
    const nextSignals: EngagementSignals = {
      ...prevSignals,
      quiz_score: score,
      quiz_passed: score >= passThreshold,
      quiz_async_makeup: asyncMakeup,
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
  passed_count: number; // 0..4
  total: 4;
  is_engaged: boolean;
}

/**
 * Evaluate the 4-AND gate from raw signals + cycle end time.
 * Pure function, used by both the progress bar and the engagement card.
 */
export function evaluateGates(
  signals: EngagementSignals,
  endsAt: string | null,
): GateStatus {
  const joined_within_5min = !!signals.joined_within_5min;
  const polls_responded_ok = (signals.polls_responded ?? 0) >= 3;

  let stayed_until_end = false;
  if (signals.stayed_until && endsAt) {
    const endHHMM = isoToIstHHMM(endsAt);
    // Compare HH:MM strings — works for same-day sessions.
    stayed_until_end = signals.stayed_until >= endHHMM;
  }

  const quiz_passed = !!signals.quiz_passed;

  const passed_count =
    Number(joined_within_5min) +
    Number(polls_responded_ok) +
    Number(stayed_until_end) +
    Number(quiz_passed);

  return {
    joined_within_5min,
    polls_responded_ok,
    stayed_until_end,
    quiz_passed,
    passed_count,
    total: 4,
    is_engaged: passed_count === 4,
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

export function useRecordHeartbeat(
  cycleId: string,
): UseMutationResult<EngagementSignals, Error, void> {
  const queryClient = useQueryClient();
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
  { score: number; asyncMakeup: boolean }
> {
  const queryClient = useQueryClient();
  return useMutation<
    EngagementSignals,
    Error,
    { score: number; asyncMakeup: boolean }
  >({
    mutationFn: ({ score, asyncMakeup }) =>
      LiveSessionService.submitQuiz(cycleId, score, asyncMakeup),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: liveSessionKey(cycleId) });
    },
  });
}
