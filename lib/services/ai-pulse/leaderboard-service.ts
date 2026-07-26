'use client';

// lib/services/ai-pulse/leaderboard-service.ts
// ============================================================================
// AI Pulse — Leaderboard Service  (F3 / F4 / B5)
// ============================================================================
// Client-side React Query hooks over the leaderboard RPCs added in migration
// 20260724120000_ai_pulse_leaderboard.sql. Each RPC is SECURITY DEFINER and
// anon-locked; the browser (RLS/authenticated) client is all that's needed.
//
// Type note: the leaderboard RPCs are not in the generated Supabase types, so
// we cast the client to `any` — the same convention used by
// participation-service / live-session-service for the ai_pulse_* surface.
//
// Numeric coercion: PostgREST returns numeric columns as strings; every points
// field is coerced to a JS number here so the UI never has to.
// ============================================================================

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeKey = 'first_prompt' | 'gold_prompt' | 'quiz_ace' | 'loyal_streak';

// Senior Learner (staff/faculty) board badges. Builds/starters/publish do not
// exist for profile-keyed participants, so their badges are quiz + loyalty +
// session_host (earned by hosting/running a live AI Pulse session).
export type SeniorBadgeKey = 'first_quiz' | 'quiz_ace' | 'loyal_streak' | 'session_host';

export interface IndividualRow {
  rank: number;
  learner_id: string;
  learner_name: string;
  department_name: string | null;
  institution_name: string | null;
  total_pts: number;
  participation_pts: number;
  quality_pts: number;
  streak_weeks: number;
  badges: BadgeKey[];
}

export interface DeptRow {
  rank: number;
  department_id: string;
  department_name: string | null;
  institution_id: string;
  institution_name: string | null;
  active_students: number;
  participating_students: number;
  total_pts: number;
  avg_pts_per_active: number;
}

export interface MyCard {
  learner_id: string;
  rank: number;
  total_learners: number;
  total_pts: number;
  participation_pts: number;
  quality_pts: number;
  build_pts: number;
  quiz_pts: number;
  starter_pts: number;
  publish_pts: number;
  streak_weeks: number;
  badges: BadgeKey[];
}

// Senior Learner (profile-keyed) board — a row on the parallel staff/faculty
// board. Scored on attendance + quiz only (decision #18).
export interface SeniorRow {
  rank: number;
  profile_id: string;
  senior_name: string;
  role: string | null;
  department_name: string | null;
  institution_name: string | null;
  total_pts: number;
  participation_pts: number;
  quality_pts: number;
  sessions_attended: number;
  quizzes_taken: number;
  streak_weeks: number;
  badges: SeniorBadgeKey[];
}

// The signed-in Senior Learner's own standing card.
export interface MySeniorCard {
  profile_id: string;
  rank: number;
  total_seniors: number;
  total_pts: number;
  participation_pts: number;
  quality_pts: number;
  attend_pts: number;
  quiz_pts: number;
  facilitate_pts: number;
  sessions_attended: number;
  quizzes_taken: number;
  sessions_facilitated: number;
  streak_weeks: number;
  badges: SeniorBadgeKey[];
}

// ---------------------------------------------------------------------------
// Coercion helpers (PostgREST returns numeric as string)
// ---------------------------------------------------------------------------
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const badges = (v: unknown): BadgeKey[] => (Array.isArray(v) ? (v as BadgeKey[]) : []);
const seniorBadges = (v: unknown): SeniorBadgeKey[] =>
  Array.isArray(v) ? (v as SeniorBadgeKey[]) : [];

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Individual board — weekly (allTime=false, latest or given cycle) or all-time. */
export function useIndividualBoard(
  allTime: boolean,
  cycleId: string | null = null,
): UseQueryResult<IndividualRow[]> {
  return useQuery({
    queryKey: ['ai-pulse-lb-individual', allTime, cycleId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_ai_pulse_leaderboard_individual', {
        p_cycle_id: cycleId,
        p_all_time: allTime,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []).map(
        (r: any): IndividualRow => ({
          rank: num(r.rank),
          learner_id: r.learner_id,
          learner_name: r.learner_name || 'Learner',
          department_name: r.department_name ?? null,
          institution_name: r.institution_name ?? null,
          total_pts: num(r.total_pts),
          participation_pts: num(r.participation_pts),
          quality_pts: num(r.quality_pts),
          streak_weeks: num(r.streak_weeks),
          badges: badges(r.badges),
        }),
      );
    },
  });
}

/** Department board — avg points per active student. within-college filters to one institution. */
export function useDeptBoard(
  allTime: boolean,
  withinCollege: boolean,
  institutionId: string | null = null,
  cycleId: string | null = null,
): UseQueryResult<DeptRow[]> {
  return useQuery({
    queryKey: ['ai-pulse-lb-dept', allTime, withinCollege, institutionId, cycleId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_ai_pulse_leaderboard_dept', {
        p_cycle_id: cycleId,
        p_all_time: allTime,
        p_within_college: withinCollege,
        p_institution_id: institutionId,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []).map(
        (r: any): DeptRow => ({
          rank: num(r.rank),
          department_id: r.department_id,
          department_name: r.department_name ?? null,
          institution_id: r.institution_id,
          institution_name: r.institution_name ?? null,
          active_students: num(r.active_students),
          participating_students: num(r.participating_students),
          total_pts: num(r.total_pts),
          avg_pts_per_active: num(r.avg_pts_per_active),
        }),
      );
    },
  });
}

/** The signed-in learner's own card (rank + points breakdown + badges + streak). */
export function useMyLeaderboardCard(
  allTime: boolean,
  cycleId: string | null = null,
): UseQueryResult<MyCard | null> {
  return useQuery({
    queryKey: ['ai-pulse-lb-my', allTime, cycleId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_ai_pulse_my_leaderboard', {
        p_cycle_id: cycleId,
        p_all_time: allTime,
      });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      if (!r) return null;
      return {
        learner_id: r.learner_id,
        rank: num(r.rank),
        total_learners: num(r.total_learners),
        total_pts: num(r.total_pts),
        participation_pts: num(r.participation_pts),
        quality_pts: num(r.quality_pts),
        build_pts: num(r.build_pts),
        quiz_pts: num(r.quiz_pts),
        starter_pts: num(r.starter_pts),
        publish_pts: num(r.publish_pts),
        streak_weeks: num(r.streak_weeks),
        badges: badges(r.badges),
      } as MyCard;
    },
  });
}

// ---------------------------------------------------------------------------
// Senior Learner (staff/faculty) board — the SEPARATE, profile-keyed board.
// Backed by fn_ai_pulse_leaderboard_staff / fn_ai_pulse_my_staff_leaderboard
// from migration 20260726120000_ai_pulse_staff_leaderboard.sql. Same anon-lock
// + `any`-cast convention as the learner hooks above.
// ---------------------------------------------------------------------------

/** Senior Learner individual board — weekly (latest/given cycle) or all-time. */
export function useSeniorBoard(
  allTime: boolean,
  cycleId: string | null = null,
): UseQueryResult<SeniorRow[]> {
  return useQuery({
    queryKey: ['ai-pulse-lb-seniors', allTime, cycleId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_ai_pulse_leaderboard_staff', {
        p_cycle_id: cycleId,
        p_all_time: allTime,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []).map(
        (r: any): SeniorRow => ({
          rank: num(r.rank),
          profile_id: r.profile_id,
          senior_name: r.staff_name || 'Senior Learner',
          role: r.role ?? null,
          department_name: r.department_name ?? null,
          institution_name: r.institution_name ?? null,
          total_pts: num(r.total_pts),
          participation_pts: num(r.participation_pts),
          quality_pts: num(r.quality_pts),
          sessions_attended: num(r.sessions_attended),
          quizzes_taken: num(r.quizzes_taken),
          streak_weeks: num(r.streak_weeks),
          badges: seniorBadges(r.badges),
        }),
      );
    },
  });
}

/** The signed-in Senior Learner's own card (rank + points + badges + streak). */
export function useMySeniorLeaderboardCard(
  allTime: boolean,
  cycleId: string | null = null,
): UseQueryResult<MySeniorCard | null> {
  return useQuery({
    queryKey: ['ai-pulse-lb-my-senior', allTime, cycleId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_ai_pulse_my_staff_leaderboard', {
        p_cycle_id: cycleId,
        p_all_time: allTime,
      });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      if (!r) return null;
      return {
        profile_id: r.profile_id,
        rank: num(r.rank),
        total_seniors: num(r.total_staff),
        total_pts: num(r.total_pts),
        participation_pts: num(r.participation_pts),
        quality_pts: num(r.quality_pts),
        attend_pts: num(r.attend_pts),
        quiz_pts: num(r.quiz_pts),
        facilitate_pts: num(r.facilitate_pts),
        sessions_attended: num(r.sessions_attended),
        quizzes_taken: num(r.quizzes_taken),
        sessions_facilitated: num(r.sessions_facilitated),
        streak_weeks: num(r.streak_weeks),
        badges: seniorBadges(r.badges),
      } as MySeniorCard;
    },
  });
}
