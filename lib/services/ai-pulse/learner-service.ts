// lib/services/ai-pulse/learner-service.ts
// Created: 2026-05-06 — Wave B.1 Learner My Pulse
//
// Reads AI Pulse cycle/team/attendance data for the CURRENT learner.
// Backs:
//   - app/(routes)/ai-pulse/page.tsx (Server Component)
//   - app/(routes)/ai-pulse/_components/* (Client Components via React Query hooks)
//
// AI Pulse cycles are stored as `startup_events` rows discriminated solely by
// `config->>'kind' = 'ai_pulse'`. (startup_events has NO event_type column —
// the spec v3 §4.3 event_type CHECK was never applied; config.kind is the
// production discriminator, matching cycles-service.)
// Substrate (PR #644) adds the JSONB discriminator + `engagement_signals` column
// on `event_team_attendance`.
//
// Defensive: every method returns a graceful empty/null shape on error so the
// page can render "no active cycle" without crashing if substrate isn't yet
// applied or RLS blocks the read.

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  isPresentAtEnd,
  isEngagedFromGates,
} from '@/lib/services/ai-pulse/live-session-service';

// --- Types ---------------------------------------------------------------

export interface AiPulseCycleConfig {
  kind?: string;
  cycle_week_start_date?: string;
  featured_tool_id?: string | null;
  briefing_topic_id?: string | null;
  host_user_id?: string | null;
  meet_url?: string | null;
  recording_url?: string | null;
  external_judge_cycle?: boolean;
  primary_language?: string;
  secondary_language?: string;
  [key: string]: unknown;
}

export interface AiPulseCycle {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  config: AiPulseCycleConfig | null;
  /**
   * Whether this cycle has an AI starter the reader will actually see — it
   * mirrors fn_ai_pulse_my_domain_starters (own course/programme topic, else
   * the cycle-wide 'general' fallback), so it never contradicts the card.
   *
   * Only listCyclesServer() populates this; the single-cycle fetchers leave it
   * undefined, which reads as "not known" rather than "no prompt".
   */
  has_prompt?: boolean;
}

export interface AiPulseGoldWeek {
  cycle_id: string;
  cycle_name: string;
  demo_date: string | null;
  winners: Array<{ department_name: string; team_names: string[] }>;
}

export interface AiPulseTeamSummary {
  registration_id: string;
  team_name: string | null;
  is_leader: boolean;
  status: string;
  member_count: number;
}

export type AttendanceState =
  | 'engaged'        // 4-AND signals satisfied (live OR async OR excused)
  | 'partial'        // attendance row exists but signals incomplete
  | 'absent'         // no row, cycle is in/past live state
  | 'pending'        // cycle hasn't reached live state yet
  | 'unknown';       // no team / no cycle / RLS blocked

export interface AiPulseAttendance {
  state: AttendanceState;
  day_type: string | null;
  marked_at: string | null;
  signals: Record<string, unknown> | null;
}

// --- Helpers -------------------------------------------------------------

/**
 * The AI Pulse cycle "current week" is bounded by the Thursday of the running
 * week. We accept any cycle whose start_date falls within the current ISO
 * week (Mon..Sun) and is filtered by the JSONB discriminator.
 */
function currentWeekBounds(now: Date = new Date()): { start: string; end: string } {
  const d = new Date(now);
  // Roll back to Monday 00:00 IST-naive (we keep ISO strings UTC; tolerance is
  // intentional — the JSONB discriminator + active status filters the row).
  const day = d.getUTCDay(); // 0..6, Sunday=0
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 7); // exclusive upper bound
  return {
    start: monday.toISOString(),
    end: sunday.toISOString(),
  };
}

/**
 * Classify a learner's state from raw `ai_pulse_live_attendance` engagement
 * signals. This table has no status column — a row's existence IS presence (the
 * learner joined). So we only decide engaged vs partial, using the SAME shared
 * verdict
 * (`isEngagedFromGates`, honest 2-of-3) as the dept heatmap / digest / PDE
 * bridge, so the learner card and the admin views agree exactly.
 *
 * No session-end "HH:MM" is in scope here → pass null to isPresentAtEnd so it
 * falls back to the live-quiz proxy (the heartbeat is unobservable on external
 * meetings anyway). quiz uses the authoritative `quiz_passed` flag (matches the
 * admin readers), not a hardcoded score threshold.
 */
function classifyFromSignals(
  sig: Record<string, unknown> | null,
): AttendanceState {
  if (!sig) return 'partial'; // joined (row exists) but no signals captured
  const joined = sig['joined_within_5min'] === true;
  const polls =
    typeof sig['polls_responded'] === 'number' &&
    (sig['polls_responded'] as number) >= 2;
  const stayed = isPresentAtEnd(
    {
      stayed_until:
        typeof sig['stayed_until'] === 'string'
          ? (sig['stayed_until'] as string)
          : undefined,
      quiz_score:
        typeof sig['quiz_score'] === 'number'
          ? (sig['quiz_score'] as number)
          : undefined,
      quiz_async_makeup: sig['quiz_async_makeup'] === true,
    },
    null,
  );
  const quiz = sig['quiz_passed'] === true;
  return isEngagedFromGates({ joined, polls, stayed, quiz })
    ? 'engaged'
    : 'partial';
}

/**
 * One row of `ai_pulse_live_attendance` as the streak walk needs it.
 */
export interface AttendanceRow {
  event_id: string;
  joined_at?: string | null;
  engagement_signals: Record<string, unknown> | null;
}

/**
 * Walk the personal streak from ONE batched attendance read.
 *
 * `rows` is every `ai_pulse_live_attendance` row for the learner across
 * `cycleIdsNewestFirst`, ordered joined_at DESC — so the first row seen for an
 * event is that event's most recent one, which is exactly what the old
 * per-cycle `.order('joined_at', desc).limit(1)` returned. A cycle with no row
 * ends the chain (it used to classify as 'pending'), and so does a cycle whose
 * signals fall short of engaged.
 *
 * Pure, so the collapse is testable without a Supabase client.
 */
export function streakFromAttendance(
  cycleIdsNewestFirst: string[],
  rows: AttendanceRow[],
): number {
  const newestByEvent = new Map<string, Record<string, unknown> | null>();
  for (const r of rows) {
    if (!newestByEvent.has(r.event_id)) {
      newestByEvent.set(r.event_id, r.engagement_signals ?? null);
    }
  }

  let streak = 0;
  for (const id of cycleIdsNewestFirst) {
    if (!newestByEvent.has(id)) break;
    if (classifyFromSignals(newestByEvent.get(id) ?? null) !== 'engaged') break;
    streak += 1;
  }
  return streak;
}

// --- Read failure surfacing ----------------------------------------------

/**
 * Every server read below degrades to an empty shape on failure, which is right
 * for the client hooks: a card that renders nothing beats a card that crashes.
 *
 * It is WRONG for the My AI Pulse server page. There, a stalled `startup_events`
 * read came back as `null` and the page stated, with total confidence, that the
 * learner had no active cycle — the same honest-looking empty page the four
 * BUG-0055xx reporters could not get past. `throwOnError` lets that page tell a
 * failed read apart from a genuinely empty one and offer a retry instead.
 *
 * Opt-in and last-positional, so no existing caller changes behaviour.
 */
export interface AiPulseReadOptions {
  throwOnError?: boolean;
}

/** Raised only when the caller passed `throwOnError`. */
export class AiPulseReadError extends Error {
  readonly read: string;

  constructor(read: string, options?: { cause?: unknown }) {
    super(`[ai-pulse/learner] ${read} failed`, options);
    this.name = 'AiPulseReadError';
    this.read = read;
  }
}

// --- Service -------------------------------------------------------------

export class AiPulseLearnerService {
  /**
   * Log a failed read, and surface it to the caller when they asked for that.
   * Callers still `return` their empty shape on the line after — this only
   * throws under `throwOnError`.
   */
  private static fail(
    read: string,
    cause: unknown,
    opts?: AiPulseReadOptions
  ): void {
    console.error(`[ai-pulse/learner] ${read} failed:`, cause);
    if (opts?.throwOnError) throw new AiPulseReadError(read, { cause });
  }

  /**
   * Find the current week's AI Pulse cycle for `startup_events`.
   * Server-side variant — uses the SSR Supabase client (RLS-enforced).
   */
  static async getCurrentCycleServer(
    opts?: AiPulseReadOptions
  ): Promise<AiPulseCycle | null> {
    try {
      const supabase = await createServerSupabaseClient();
      const { start, end } = currentWeekBounds();
      const { data, error } = await (supabase as any)
        .from('startup_events')
        .select('id, name, start_date, end_date, status, config')
        .filter('config->>kind', 'eq', 'ai_pulse')
        .gte('start_date', start)
        .lt('start_date', end)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        AiPulseLearnerService.fail('getCurrentCycleServer', error, opts);
        return null;
      }
      return (data as AiPulseCycle) ?? null;
    } catch (e) {
      if (e instanceof AiPulseReadError) throw e;
      AiPulseLearnerService.fail('getCurrentCycleServer', e, opts);
      return null;
    }
  }

  /** Client-side variant for React Query hooks. */
  static async getCurrentCycleClient(): Promise<AiPulseCycle | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { start, end } = currentWeekBounds();
      const { data, error } = await (supabase as any)
        .from('startup_events')
        .select('id, name, start_date, end_date, status, config')
        .filter('config->>kind', 'eq', 'ai_pulse')
        .gte('start_date', start)
        .lt('start_date', end)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('[ai-pulse/learner] getCurrentCycleClient failed:', error);
        return null;
      }
      return (data as AiPulseCycle) ?? null;
    } catch (e) {
      console.error('[ai-pulse/learner] getCurrentCycleClient threw:', e);
      return null;
    }
  }

  /**
   * List recent AI Pulse cycles (newest first) — backs the learner "week
   * switcher" on My AI Pulse. Read-only browse of any past cycle.
   *
   * Surfaces every cycle the learner ATTENDED, plus every cycle that has a
   * starter for them (the union — the current week normally has starters but
   * no attendance yet, so attendance alone would drop the live week).
   *
   * A week the learner sat through but which has no prompt for their programme
   * is no longer hidden: it comes back with has_prompt=false so the page can
   * say so plainly instead of making the session invisible.
   */
  static async listCyclesServer(
    limit = 12,
    opts?: AiPulseReadOptions
  ): Promise<AiPulseCycle[]> {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await (supabase as any).rpc(
        'fn_ai_pulse_switchable_cycles',
        { p_limit: limit }
      );
      if (error) {
        AiPulseLearnerService.fail('listCyclesServer', error, opts);
        return [];
      }
      return ((data as Array<Record<string, unknown>>) ?? []).map((r) => ({
        id: r.cycle_id as string,
        name: r.name as string,
        start_date: (r.start_date as string | null) ?? null,
        end_date: (r.end_date as string | null) ?? null,
        status: (r.status as string | null) ?? null,
        config: null,
        has_prompt: r.has_prompt === true,
      })) as AiPulseCycle[];
    } catch (e) {
      if (e instanceof AiPulseReadError) throw e;
      AiPulseLearnerService.fail('listCyclesServer', e, opts);
      return [];
    }
  }

  /**
   * Fetch a single AI Pulse cycle by id — backs the `?cycle=<id>` deep-link
   * the week switcher navigates to. Returns null if the id is not an ai_pulse
   * cycle (guards against a hand-typed / stale param).
   */
  static async getCycleByIdServer(
    id: string,
    opts?: AiPulseReadOptions
  ): Promise<AiPulseCycle | null> {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('startup_events')
        .select('id, name, start_date, end_date, status, config')
        .eq('id', id)
        .filter('config->>kind', 'eq', 'ai_pulse')
        .maybeSingle();
      if (error) {
        AiPulseLearnerService.fail('getCycleByIdServer', error, opts);
        return null;
      }
      return (data as AiPulseCycle) ?? null;
    } catch (e) {
      if (e instanceof AiPulseReadError) throw e;
      AiPulseLearnerService.fail('getCycleByIdServer', e, opts);
      return null;
    }
  }

  /**
   * Find the learner's team for a given AI Pulse cycle.
   * Joins `event_team_members` → `event_registrations` filtered by event_id.
   */
  static async getMyTeam(
    eventId: string,
    profileId: string,
    client?: any,
    opts?: AiPulseReadOptions
  ): Promise<AiPulseTeamSummary | null> {
    try {
      const supabase = client ?? (await createServerSupabaseClient());
      // First find the registration(s) for this event
      const { data: regs, error: regErr } = await supabase
        .from('event_registrations')
        .select('id, team_name')
        .eq('event_id', eventId);
      // A failed read and an event with no registrations both used to return
      // null. Only the first is a failure.
      if (regErr) {
        AiPulseLearnerService.fail('getMyTeam:registrations', regErr, opts);
        return null;
      }
      if (!regs || regs.length === 0) return null;
      const regIds = regs.map((r: any) => r.id);

      // Find this profile's accepted membership
      const { data: member, error: memErr } = await supabase
        .from('event_team_members')
        .select('id, registration_id, is_leader, status')
        .in('registration_id', regIds)
        .eq('profile_id', profileId)
        .eq('status', 'accepted')
        .maybeSingle();
      if (memErr) {
        AiPulseLearnerService.fail('getMyTeam:membership', memErr, opts);
        return null;
      }
      if (!member) return null; // not on a team for this cycle — not a failure

      const reg = regs.find((r: any) => r.id === member.registration_id);

      // Count siblings on the team
      const { count, error: countErr } = await supabase
        .from('event_team_members')
        .select('id', { count: 'exact', head: true })
        .eq('registration_id', member.registration_id)
        .eq('status', 'accepted');

      // An unreadable sibling count still degrades to 0 for existing callers;
      // only an opted-in caller hears about it.
      if (countErr && opts?.throwOnError) {
        AiPulseLearnerService.fail('getMyTeam:memberCount', countErr, opts);
      }

      return {
        registration_id: member.registration_id,
        team_name: reg?.team_name ?? null,
        is_leader: !!member.is_leader,
        status: member.status,
        member_count: countErr || typeof count !== 'number' ? 0 : count,
      };
    } catch (e) {
      if (e instanceof AiPulseReadError) throw e;
      AiPulseLearnerService.fail('getMyTeam', e, opts);
      return null;
    }
  }

  /**
   * Read attendance for a learner against the current cycle.
   * Returns the most recent attendance row for the registration.
   */
  static async getMyAttendance(
    eventId: string,
    profileId: string,
    client?: any,
    opts?: AiPulseReadOptions
  ): Promise<AiPulseAttendance> {
    try {
      const supabase = client ?? (await createServerSupabaseClient());
      // AI Pulse attendance lives in `ai_pulse_live_attendance` (profile-keyed) —
      // the SAME source-of-truth every admin surface reads (dept heatmap,
      // participation card, weekly digest, PDE bridge). The older
      // `event_team_attendance` table is never populated for AI Pulse cycles, so
      // reading it showed EVERY learner "pending — session not yet started"
      // even after they attended. Keyed on profile_id (NOT team registration) so
      // it works whether or not the learner has been assigned to a team.
      const { data, error } = await supabase
        .from('ai_pulse_live_attendance')
        .select('day_type, joined_at, engagement_signals')
        .eq('event_id', eventId)
        .eq('profile_id', profileId)
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        AiPulseLearnerService.fail('getMyAttendance', error, opts);
        return { state: 'pending', day_type: null, marked_at: null, signals: null };
      }
      if (!data) {
        // No row = the learner has not joined this cycle's session. This is an
        // answer, not a failure — it must never light the retry notice.
        return { state: 'pending', day_type: null, marked_at: null, signals: null };
      }
      // A row's existence == presence (there is no status column here). Classify
      // engaged/partial from the engagement signals via the shared gate.
      const state = classifyFromSignals(
        (data as any).engagement_signals as Record<string, unknown> | null,
      );
      return {
        state,
        day_type: data.day_type ?? null,
        marked_at: (data as any).joined_at ?? null,
        signals: (data as any).engagement_signals ?? null,
      };
    } catch (e) {
      if (e instanceof AiPulseReadError) throw e;
      AiPulseLearnerService.fail('getMyAttendance', e, opts);
      return { state: 'unknown', day_type: null, marked_at: null, signals: null };
    }
  }

  /**
   * Personal streak — count of consecutive AI Pulse cycles where this learner
   * was ENGAGED, walking back from the most recent cycle.
   */
  static async getMyStreak(
    profileId: string,
    client?: any,
    opts?: AiPulseReadOptions
  ): Promise<number> {
    try {
      const supabase = client ?? (await createServerSupabaseClient());

      // Pull last 12 AI Pulse cycles ordered desc
      const { data: cycles, error: cyErr } = await supabase
        .from('startup_events')
        .select('id, start_date')
        .filter('config->>kind', 'eq', 'ai_pulse')
        .order('start_date', { ascending: false })
        .limit(12);
      if (cyErr) {
        AiPulseLearnerService.fail('getMyStreak:cycles', cyErr, opts);
        return 0;
      }
      if (!cycles || cycles.length === 0) return 0;

      const cycleIds = (cycles as Array<{ id: string }>).map((c) => c.id);

      // ONE attendance read for all 12 cycles. This loop used to await
      // getMyAttendance() per cycle, so a learner with a long streak paid up to
      // 12 extra serial round trips before the page could stream — the tail of
      // the waterfall behind the "network error" reports on My AI Pulse.
      // Attendance is profile-keyed in ai_pulse_live_attendance, so no team
      // lookup is needed (a learner can be engaged before team assignment).
      const { data: rows, error: attErr } = await supabase
        .from('ai_pulse_live_attendance')
        .select('event_id, joined_at, engagement_signals')
        .in('event_id', cycleIds)
        .eq('profile_id', profileId)
        .order('joined_at', { ascending: false });
      if (attErr) {
        AiPulseLearnerService.fail('getMyStreak:attendance', attErr, opts);
        return 0;
      }

      return streakFromAttendance(cycleIds, (rows ?? []) as AttendanceRow[]);
    } catch (e) {
      if (e instanceof AiPulseReadError) throw e;
      AiPulseLearnerService.fail('getMyStreak', e, opts);
      return 0;
    }
  }

  /**
   * Most recent cycle's Gold Standard winners, resolved to team + department
   * names — the learner-facing recognition surface (CARE R-move, audit
   * 2026-06-12: gold_selections existed only behind admin/NAAC surfaces).
   *
   * Reads config.ai_pulse.gold_selections (shape documented in
   * lab-evaluation-service) from the newest cycle that has any, then resolves
   * submission_ids → event_submissions → event_registrations.team_name.
   * Defensive: returns null on any error or when RLS hides the rows — the
   * card hides rather than rendering an empty shell.
   */
  static async getLatestGoldServer(
    client?: any,
    opts?: AiPulseReadOptions
  ): Promise<AiPulseGoldWeek | null> {
    try {
      const supabase = client ?? (await createServerSupabaseClient());

      const { data: cycles, error: cyErr } = await (supabase as any)
        .from('startup_events')
        .select('id, name, demo_date, config')
        .filter('config->>kind', 'eq', 'ai_pulse')
        .order('demo_date', { ascending: false, nullsFirst: false })
        .limit(6);
      if (cyErr) {
        AiPulseLearnerService.fail('getLatestGoldServer:cycles', cyErr, opts);
        return null;
      }
      if (!cycles) return null;

      for (const cycle of cycles as any[]) {
        const aiPulse = (cycle.config?.ai_pulse ?? cycle.config ?? {}) as Record<
          string,
          any
        >;
        const selections = (aiPulse.gold_selections ?? {}) as Record<
          string,
          { submission_ids?: string[] }
        >;
        const deptIds = Object.keys(selections);
        if (deptIds.length === 0) continue;

        const submissionIds = deptIds.flatMap(
          (d) => selections[d]?.submission_ids ?? []
        );
        if (submissionIds.length === 0) continue;

        // submission → registration → team name. The department names do not
        // depend on that chain, so both reads start together instead of the
        // second waiting on the first.
        const [
          { data: subs, error: subErr },
          { data: depts, error: deptErr },
        ] = await Promise.all([
          (supabase as any)
            .from('event_submissions')
            .select('id, registration_id')
            .in('id', submissionIds),
          (supabase as any)
            .from('departments')
            .select('id, department_name')
            .in('id', deptIds),
        ]);
        if (subErr || deptErr) {
          AiPulseLearnerService.fail(
            'getLatestGoldServer:winners',
            subErr ?? deptErr,
            opts
          );
          return null;
        }
        const regIds = Array.from(
          new Set(
            ((subs ?? []) as any[]).map((s) => s.registration_id).filter(Boolean)
          )
        );
        const { data: regs, error: regErr } = regIds.length
          ? await (supabase as any)
              .from('event_registrations')
              .select('id, team_name')
              .in('id', regIds)
          : { data: [], error: null };
        if (regErr) {
          AiPulseLearnerService.fail(
            'getLatestGoldServer:registrations',
            regErr,
            opts
          );
          return null;
        }
        const teamByReg = new Map(
          ((regs ?? []) as any[]).map((r) => [r.id, r.team_name ?? 'Team'])
        );
        const regBySub = new Map(
          ((subs ?? []) as any[]).map((s) => [s.id, s.registration_id])
        );

        const deptName = new Map(
          ((depts ?? []) as any[]).map((d) => [d.id, d.department_name ?? '—'])
        );

        const winners = deptIds
          .map((d) => ({
            department_name: (deptName.get(d) ?? '—') as string,
            team_names: (selections[d]?.submission_ids ?? [])
              .map((sid) => teamByReg.get(regBySub.get(sid)))
              .filter((t): t is string => !!t),
          }))
          .filter((w) => w.team_names.length > 0);
        if (winners.length === 0) return null; // RLS hid the rows — hide card

        return {
          cycle_id: cycle.id as string,
          cycle_name: (cycle.name ?? 'AI Pulse Cycle') as string,
          demo_date: cycle.demo_date
            ? String(cycle.demo_date).slice(0, 10)
            : null,
          winners,
        };
      }
      return null;
    } catch (e) {
      if (e instanceof AiPulseReadError) throw e;
      AiPulseLearnerService.fail('getLatestGoldServer', e, opts);
      return null;
    }
  }
}

// --- React Query hooks (client) ------------------------------------------

const QK_CYCLE = ['ai-pulse', 'learner', 'current-cycle'] as const;
const QK_TEAM = (cycleId: string, profileId: string) =>
  ['ai-pulse', 'learner', 'team', cycleId, profileId] as const;
const QK_ATT = (cycleId: string, regId: string) =>
  ['ai-pulse', 'learner', 'attendance', cycleId, regId] as const;
const QK_STREAK = (profileId: string) =>
  ['ai-pulse', 'learner', 'streak', profileId] as const;

export function useCurrentAiPulseCycle() {
  return useQuery({
    queryKey: QK_CYCLE,
    queryFn: () => AiPulseLearnerService.getCurrentCycleClient(),
    staleTime: 60_000,
  });
}

export function useMyAiPulseTeam(cycleId: string | null, profileId: string | null) {
  return useQuery({
    queryKey: cycleId && profileId ? QK_TEAM(cycleId, profileId) : ['ai-pulse', 'learner', 'team', 'idle'],
    queryFn: async () => {
      if (!cycleId || !profileId) return null;
      const supabase = createClientSupabaseClient();
      return AiPulseLearnerService.getMyTeam(cycleId, profileId, supabase);
    },
    enabled: !!cycleId && !!profileId,
    staleTime: 60_000,
  });
}

export function useMyAiPulseAttendance(cycleId: string | null, profileId: string | null) {
  return useQuery({
    queryKey: cycleId && profileId
      ? QK_ATT(cycleId, profileId)
      : ['ai-pulse', 'learner', 'attendance', 'idle'],
    queryFn: async () => {
      if (!cycleId || !profileId) {
        return { state: 'unknown' as AttendanceState, day_type: null, marked_at: null, signals: null };
      }
      const supabase = createClientSupabaseClient();
      return AiPulseLearnerService.getMyAttendance(cycleId, profileId, supabase);
    },
    enabled: !!cycleId && !!profileId,
    staleTime: 30_000,
  });
}

export function useMyAiPulseStreak(profileId: string | null) {
  return useQuery({
    queryKey: profileId ? QK_STREAK(profileId) : ['ai-pulse', 'learner', 'streak', 'idle'],
    queryFn: async () => {
      if (!profileId) return 0;
      const supabase = createClientSupabaseClient();
      return AiPulseLearnerService.getMyStreak(profileId, supabase);
    },
    enabled: !!profileId,
    staleTime: 5 * 60_000,
  });
}
