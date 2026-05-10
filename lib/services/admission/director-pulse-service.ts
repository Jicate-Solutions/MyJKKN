// lib/services/admission/director-pulse-service.ts
// Director Pulse Service — surfaces "X of N counselors active today" reality
// in real-time so leadership can see who is actually calling vs. silent.
//
// Empirical motivation (2026-05-08): of 100 active admission_counselors rows,
// only 2 made calls today and only 5 in the last 7 days. Director had no
// single page surfacing this asymmetry. This service powers that page.

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface CounselorPulseRow {
  counselor_id: string;          // admission_counselors.id
  user_id: string | null;        // admission_counselors.user_id (= profiles.id, FK target on call logs)
  name: string;
  designation: string | null;
  institution_id: string | null;
  is_active: boolean;
  calls_today: number;
  last_call_at: string | null;   // ISO timestamp of most recent call (any time)
  days_since_last_call: number | null;
}

export interface LiveCallEvent {
  id: string;
  call_sid: string | null;
  counselor_id: string | null;       // profiles.id
  counselor_name: string | null;     // resolved via JOIN
  lead_id: string | null;
  to_number: string | null;
  from_number: string | null;
  direction: string | null;
  status: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  created_at: string;
  call_disposition: string | null;
  institution_id: string | null;
}

export interface PulseKPIs {
  total_active_counselors: number;        // admission_counselors WHERE is_active = true
  counselors_called_today: number;
  counselors_called_7d: number;
  total_calls_today: number;
  calls_per_active_counselor_avg: number; // total_calls_today / counselors_called_today (avoid div by 0)
  silent_7d_count: number;                // counselors with NO calls in last 7 days
  silent_30d_count: number;
  computed_at: string;                    // ISO
}

// ============================================================================
// SERVICE
// ============================================================================

export class DirectorPulseService {
  /**
   * KPI strip data — single round-trip aggregate.
   * Uses client-side joins because admission_call_logs.counselor_id → profiles.id,
   * but admission_counselors has its own PK with user_id pointing at profiles.id.
   */
  static async getKPIs(institutionId?: string): Promise<PulseKPIs> {
    const supabase = createClientSupabaseClient();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. All active counselors (with their user_id which call logs reference)
    let counselorsQuery = supabase
      .from('admission_counselors')
      .select('id, user_id')
      .eq('is_active', true);
    if (institutionId) counselorsQuery = counselorsQuery.eq('institution_id', institutionId);
    const { data: counselors } = await counselorsQuery;
    const activeCounselorUserIds = new Set(
      (counselors || []).map((c) => c.user_id).filter(Boolean) as string[]
    );

    // 2. Today's calls
    let todayCallsQuery = supabase
      .from('admission_call_logs')
      .select('counselor_id')
      .gte('created_at', todayStart);
    if (institutionId) todayCallsQuery = todayCallsQuery.eq('institution_id', institutionId);
    const { data: todayCalls } = await todayCallsQuery;

    const counselorsWhoCalledToday = new Set(
      (todayCalls || []).map((c) => c.counselor_id).filter(Boolean) as string[]
    );
    const totalCallsToday = (todayCalls || []).length;

    // 3. Last-7-day calls (just to count distinct counselors)
    let sevenDayCallsQuery = supabase
      .from('admission_call_logs')
      .select('counselor_id, created_at')
      .gte('created_at', sevenDaysAgo);
    if (institutionId) sevenDayCallsQuery = sevenDayCallsQuery.eq('institution_id', institutionId);
    const { data: sevenDayCalls } = await sevenDayCallsQuery;
    const counselorsCalled7d = new Set(
      (sevenDayCalls || []).map((c) => c.counselor_id).filter(Boolean) as string[]
    );

    // 4. Last-30-day calls
    let thirtyDayCallsQuery = supabase
      .from('admission_call_logs')
      .select('counselor_id')
      .gte('created_at', thirtyDaysAgo);
    if (institutionId) thirtyDayCallsQuery = thirtyDayCallsQuery.eq('institution_id', institutionId);
    const { data: thirtyDayCalls } = await thirtyDayCallsQuery;
    const counselorsCalled30d = new Set(
      (thirtyDayCalls || []).map((c) => c.counselor_id).filter(Boolean) as string[]
    );

    // Silent counts: active counselors NOT in the called-recently set
    let silent7d = 0;
    let silent30d = 0;
    activeCounselorUserIds.forEach((uid) => {
      if (!counselorsCalled7d.has(uid)) silent7d++;
      if (!counselorsCalled30d.has(uid)) silent30d++;
    });

    const callsPerActiveAvg = counselorsWhoCalledToday.size > 0
      ? totalCallsToday / counselorsWhoCalledToday.size
      : 0;

    return {
      total_active_counselors: activeCounselorUserIds.size,
      counselors_called_today: counselorsWhoCalledToday.size,
      counselors_called_7d: counselorsCalled7d.size,
      total_calls_today: totalCallsToday,
      calls_per_active_counselor_avg: Math.round(callsPerActiveAvg * 10) / 10,
      silent_7d_count: silent7d,
      silent_30d_count: silent30d,
      computed_at: new Date().toISOString(),
    };
  }

  /**
   * Today's call breakdown per counselor (for active counselors only).
   * Sorts by calls_today desc — top-of-list = the 2 who actually called.
   */
  static async getCounselorPulseToday(institutionId?: string): Promise<CounselorPulseRow[]> {
    const supabase = createClientSupabaseClient();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 1. Active counselors
    let counselorsQuery = supabase
      .from('admission_counselors')
      .select('id, user_id, name, designation, institution_id, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (institutionId) counselorsQuery = counselorsQuery.eq('institution_id', institutionId);
    const { data: counselors } = await counselorsQuery;

    if (!counselors || counselors.length === 0) return [];

    const userIds = counselors.map((c) => c.user_id).filter(Boolean) as string[];

    // 2. Today's calls — count per counselor_id (= profiles.id = admission_counselors.user_id)
    let todayCallsQuery = supabase
      .from('admission_call_logs')
      .select('counselor_id')
      .gte('created_at', todayStart)
      .in('counselor_id', userIds);
    if (institutionId) todayCallsQuery = todayCallsQuery.eq('institution_id', institutionId);
    const { data: todayCalls } = await todayCallsQuery;

    const callsByCounselor = new Map<string, number>();
    (todayCalls || []).forEach((c) => {
      if (!c.counselor_id) return;
      callsByCounselor.set(c.counselor_id, (callsByCounselor.get(c.counselor_id) || 0) + 1);
    });

    // 3. Last call timestamp ever — separate query, all-time
    let lastCallQuery = supabase
      .from('admission_call_logs')
      .select('counselor_id, created_at')
      .in('counselor_id', userIds)
      .order('created_at', { ascending: false });
    if (institutionId) lastCallQuery = lastCallQuery.eq('institution_id', institutionId);
    const { data: allCalls } = await lastCallQuery;

    const lastCallByCounselor = new Map<string, string>();
    (allCalls || []).forEach((c) => {
      if (!c.counselor_id || !c.created_at) return;
      if (!lastCallByCounselor.has(c.counselor_id)) {
        lastCallByCounselor.set(c.counselor_id, c.created_at);
      }
    });

    const nowMs = now.getTime();
    return counselors.map((c) => {
      const callsToday = c.user_id ? callsByCounselor.get(c.user_id) || 0 : 0;
      const lastCallAt = c.user_id ? lastCallByCounselor.get(c.user_id) || null : null;
      const daysSince = lastCallAt
        ? Math.floor((nowMs - new Date(lastCallAt).getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return {
        counselor_id: c.id,
        user_id: c.user_id,
        name: c.name,
        designation: c.designation,
        institution_id: c.institution_id,
        is_active: c.is_active,
        calls_today: callsToday,
        last_call_at: lastCallAt,
        days_since_last_call: daysSince,
      };
    }).sort((a, b) => b.calls_today - a.calls_today);
  }

  /**
   * Silent counselors — zero calls today, sorted by oldest activity first.
   * This is the actionable list: "Who do I message right now?"
   */
  static async getSilentCounselors(institutionId?: string): Promise<CounselorPulseRow[]> {
    const all = await this.getCounselorPulseToday(institutionId);
    return all
      .filter((c) => c.calls_today === 0)
      .sort((a, b) => {
        // Nulls (never called) at top
        if (a.last_call_at === null && b.last_call_at !== null) return -1;
        if (a.last_call_at !== null && b.last_call_at === null) return 1;
        if (a.last_call_at === null && b.last_call_at === null) return 0;
        return new Date(a.last_call_at!).getTime() - new Date(b.last_call_at!).getTime();
      });
  }

  /**
   * Latest N call events — feeds the live ticker.
   */
  static async getLiveCallFeed(institutionId?: string, limit = 20): Promise<LiveCallEvent[]> {
    const supabase = createClientSupabaseClient();

    let q = supabase
      .from('admission_call_logs')
      .select(
        'id, call_sid, counselor_id, lead_id, to_number, from_number, direction, status, duration_seconds, started_at, created_at, call_disposition, institution_id'
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data: calls } = await q;

    const counselorIds = Array.from(
      new Set((calls || []).map((c) => c.counselor_id).filter(Boolean) as string[])
    );

    let nameMap = new Map<string, string>();
    if (counselorIds.length > 0) {
      const { data: counselorRows } = await supabase
        .from('admission_counselors')
        .select('user_id, name')
        .in('user_id', counselorIds);
      (counselorRows || []).forEach((c) => {
        if (c.user_id && c.name) nameMap.set(c.user_id, c.name);
      });
    }

    return (calls || []).map((c) => ({
      id: c.id,
      call_sid: c.call_sid,
      counselor_id: c.counselor_id,
      counselor_name: c.counselor_id ? nameMap.get(c.counselor_id) || null : null,
      lead_id: c.lead_id,
      to_number: c.to_number,
      from_number: c.from_number,
      direction: c.direction,
      status: c.status,
      duration_seconds: c.duration_seconds,
      started_at: c.started_at,
      created_at: c.created_at,
      call_disposition: c.call_disposition,
      institution_id: c.institution_id,
    }));
  }
}

// ============================================================================
// REACT QUERY HOOKS
// ============================================================================

import { useQuery } from '@tanstack/react-query';

export const directorPulseKeys = {
  all: ['director-pulse'] as const,
  kpis: (institutionId?: string) => [...directorPulseKeys.all, 'kpis', institutionId] as const,
  pulseToday: (institutionId?: string) => [...directorPulseKeys.all, 'pulse-today', institutionId] as const,
  silent: (institutionId?: string) => [...directorPulseKeys.all, 'silent', institutionId] as const,
  liveFeed: (institutionId?: string) => [...directorPulseKeys.all, 'live-feed', institutionId] as const,
};

const REFRESH_MS = 30_000;

export function usePulseKPIs(institutionId?: string) {
  return useQuery({
    queryKey: directorPulseKeys.kpis(institutionId),
    queryFn: () => DirectorPulseService.getKPIs(institutionId),
    refetchInterval: REFRESH_MS,
    staleTime: 10_000,
  });
}

export function useCounselorPulseToday(institutionId?: string) {
  return useQuery({
    queryKey: directorPulseKeys.pulseToday(institutionId),
    queryFn: () => DirectorPulseService.getCounselorPulseToday(institutionId),
    refetchInterval: REFRESH_MS,
    staleTime: 10_000,
  });
}

export function useSilentCounselors(institutionId?: string) {
  return useQuery({
    queryKey: directorPulseKeys.silent(institutionId),
    queryFn: () => DirectorPulseService.getSilentCounselors(institutionId),
    refetchInterval: REFRESH_MS,
    staleTime: 10_000,
  });
}

export function useLiveCallFeed(institutionId?: string, limit = 20) {
  return useQuery({
    queryKey: directorPulseKeys.liveFeed(institutionId),
    queryFn: () => DirectorPulseService.getLiveCallFeed(institutionId, limit),
    refetchInterval: 15_000, // tick faster than other panels
    staleTime: 5_000,
  });
}
