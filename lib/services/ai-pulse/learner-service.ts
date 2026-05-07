// lib/services/ai-pulse/learner-service.ts
// Created: 2026-05-06 — Wave B.1 Learner My Pulse
//
// Reads AI Pulse cycle/team/attendance data for the CURRENT learner.
// Backs:
//   - app/(routes)/ai-pulse/page.tsx (Server Component)
//   - app/(routes)/ai-pulse/_components/* (Client Components via React Query hooks)
//
// AI Pulse cycles are stored as `startup_events` rows with
// `event_type = 'ai_pulse'` and `config->>'kind' = 'ai_pulse'` per spec v3.
// Substrate (PR #644) adds the JSONB discriminator + `engagement_signals` column
// on `event_team_attendance`.
//
// Defensive: every method returns a graceful empty/null shape on error so the
// page can render "no active cycle" without crashing if substrate isn't yet
// applied or RLS blocks the read.

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

function classifyAttendance(row: {
  status: string | null;
  day_type: string | null;
  engagement_signals?: Record<string, unknown> | null;
}): AttendanceState {
  if (!row || !row.status) return 'unknown';
  if (row.status === 'excused') return 'engaged';
  if (row.status === 'present') {
    const sig = row.engagement_signals || {};
    const joined = sig['joined_within_5min'] === true;
    const polls = typeof sig['polls_responded'] === 'number' && (sig['polls_responded'] as number) >= 2;
    const stayed = typeof sig['stayed_until'] === 'string' && (sig['stayed_until'] as string).length > 0;
    const quiz = typeof sig['quiz_score'] === 'number' && (sig['quiz_score'] as number) >= 50;
    const fourAnd = joined && polls && stayed && quiz;
    return fourAnd ? 'engaged' : 'partial';
  }
  if (row.status === 'absent') return 'absent';
  return 'unknown';
}

// --- Service -------------------------------------------------------------

export class AiPulseLearnerService {
  /**
   * Find the current week's AI Pulse cycle for `startup_events`.
   * Server-side variant — uses the SSR Supabase client (RLS-enforced).
   */
  static async getCurrentCycleServer(): Promise<AiPulseCycle | null> {
    try {
      const supabase = await createServerSupabaseClient();
      const { start, end } = currentWeekBounds();
      const { data, error } = await (supabase as any)
        .from('startup_events')
        .select('id, name, start_date, end_date, status, config')
        .eq('event_type', 'ai_pulse')
        .filter('config->>kind', 'eq', 'ai_pulse')
        .gte('start_date', start)
        .lt('start_date', end)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[ai-pulse/learner] getCurrentCycleServer failed:', error);
        return null;
      }
      return (data as AiPulseCycle) ?? null;
    } catch (e) {
      console.error('[ai-pulse/learner] getCurrentCycleServer threw:', e);
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
        .eq('event_type', 'ai_pulse')
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
   * Find the learner's team for a given AI Pulse cycle.
   * Joins `event_team_members` → `event_registrations` filtered by event_id.
   */
  static async getMyTeam(
    eventId: string,
    profileId: string,
    client?: any
  ): Promise<AiPulseTeamSummary | null> {
    try {
      const supabase = client ?? (await createServerSupabaseClient());
      // First find the registration(s) for this event
      const { data: regs, error: regErr } = await supabase
        .from('event_registrations')
        .select('id, team_name')
        .eq('event_id', eventId);
      if (regErr || !regs || regs.length === 0) return null;
      const regIds = regs.map((r: any) => r.id);

      // Find this profile's accepted membership
      const { data: member, error: memErr } = await supabase
        .from('event_team_members')
        .select('id, registration_id, is_leader, status')
        .in('registration_id', regIds)
        .eq('profile_id', profileId)
        .eq('status', 'accepted')
        .maybeSingle();
      if (memErr || !member) return null;

      const reg = regs.find((r: any) => r.id === member.registration_id);

      // Count siblings on the team
      const { count, error: countErr } = await supabase
        .from('event_team_members')
        .select('id', { count: 'exact', head: true })
        .eq('registration_id', member.registration_id)
        .eq('status', 'accepted');

      return {
        registration_id: member.registration_id,
        team_name: reg?.team_name ?? null,
        is_leader: !!member.is_leader,
        status: member.status,
        member_count: countErr || typeof count !== 'number' ? 0 : count,
      };
    } catch (e) {
      console.error('[ai-pulse/learner] getMyTeam threw:', e);
      return null;
    }
  }

  /**
   * Read attendance for a learner against the current cycle.
   * Returns the most recent attendance row for the registration.
   */
  static async getMyAttendance(
    eventId: string,
    registrationId: string,
    client?: any
  ): Promise<AiPulseAttendance> {
    try {
      const supabase = client ?? (await createServerSupabaseClient());
      const { data, error } = await supabase
        .from('event_team_attendance')
        .select('status, day_type, marked_at, engagement_signals, notes')
        .eq('event_id', eventId)
        .eq('registration_id', registrationId)
        .order('marked_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return { state: 'pending', day_type: null, marked_at: null, signals: null };
      }
      const state = classifyAttendance(data as any);
      return {
        state,
        day_type: data.day_type ?? null,
        marked_at: data.marked_at ?? null,
        signals: (data as any).engagement_signals ?? null,
      };
    } catch (e) {
      console.error('[ai-pulse/learner] getMyAttendance threw:', e);
      return { state: 'unknown', day_type: null, marked_at: null, signals: null };
    }
  }

  /**
   * Personal streak — count of consecutive AI Pulse cycles where this learner
   * was ENGAGED, walking back from the most recent cycle.
   */
  static async getMyStreak(
    profileId: string,
    client?: any
  ): Promise<number> {
    try {
      const supabase = client ?? (await createServerSupabaseClient());

      // Pull last 12 AI Pulse cycles ordered desc
      const { data: cycles, error: cyErr } = await supabase
        .from('startup_events')
        .select('id, start_date')
        .eq('event_type', 'ai_pulse')
        .filter('config->>kind', 'eq', 'ai_pulse')
        .order('start_date', { ascending: false })
        .limit(12);
      if (cyErr || !cycles || cycles.length === 0) return 0;

      let streak = 0;
      for (const c of cycles as Array<{ id: string }>) {
        const team = await AiPulseLearnerService.getMyTeam(c.id, profileId, supabase);
        if (!team) break;
        const att = await AiPulseLearnerService.getMyAttendance(
          c.id,
          team.registration_id,
          supabase
        );
        if (att.state === 'engaged') {
          streak += 1;
        } else {
          break;
        }
      }
      return streak;
    } catch (e) {
      console.error('[ai-pulse/learner] getMyStreak threw:', e);
      return 0;
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

export function useMyAiPulseAttendance(cycleId: string | null, registrationId: string | null) {
  return useQuery({
    queryKey: cycleId && registrationId
      ? QK_ATT(cycleId, registrationId)
      : ['ai-pulse', 'learner', 'attendance', 'idle'],
    queryFn: async () => {
      if (!cycleId || !registrationId) {
        return { state: 'unknown' as AttendanceState, day_type: null, marked_at: null, signals: null };
      }
      const supabase = createClientSupabaseClient();
      return AiPulseLearnerService.getMyAttendance(cycleId, registrationId, supabase);
    },
    enabled: !!cycleId && !!registrationId,
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
