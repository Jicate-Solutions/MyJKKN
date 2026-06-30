// hooks/use-learner-loop.ts
// SCF self-improving loop · LEARNER LANE hooks (#2 trigger + #3b loop-closure).
// Lives beside hooks/use-session-feedback.ts (orchestrator-owned) but does NOT import it,
// so the two lanes never edit the same file. Calls the learner-scoped RPCs directly via the
// browser supabase client (RLS + SECURITY DEFINER enforce learner-only reads server-side).

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LoopClosureRow, DownwardTrendRow } from '@/types/scf-learner-loop';

const getSupabase = () => createClientSupabaseClient();

export const scfLearnerLoopKeys = {
  all: ['scf-learner-loop'] as const,
  loopClosure: (from: string, to: string) =>
    [...scfLearnerLoopKeys.all, 'loop-closure', from, to] as const,
  downwardTrend: () => [...scfLearnerLoopKeys.all, 'downward-trend'] as const,
};

/**
 * #3b — the honest loop-closure feed for the calling learner.
 * Each row: the learner's flagged class -> the facilitator's change -> the learner's OWN
 * before/after understanding. fn_scf_loop_closure_for_learner scopes to the caller internally.
 */
export function useLoopClosure(from: string, to: string) {
  return useQuery({
    queryKey: scfLearnerLoopKeys.loopClosure(from, to),
    queryFn: async (): Promise<LoopClosureRow[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_loop_closure_for_learner', {
        p_from: from,
        p_to: to,
      });
      if (error) throw new Error(`Failed to load your loop-closure: ${error.message}`);
      return (data || []) as LoopClosureRow[];
    },
    staleTime: 60_000,
  });
}

/**
 * #2 trigger — courses where the calling learner's last 3 ratings trend down.
 * Used today to render an empathetic TEMPLATE line in the carry-forward re-ask. A future
 * server cron will read the same signal to decide who receives an AI-written note.
 *
 * AI-NOTE STUB (intentional, per brief): the per-learner generated note is NOT wired here.
 * It must be produced server-side with a real API key (a Max/Pro subscription cannot power
 * production AI — see memory feedback_subscription_cannot_power_production_app_ai). The seam:
 *   1. a cron reads fn_scf_downward_trend_for_learner() per struggling learner,
 *   2. calls Claude to draft a short supportive note,
 *   3. persists it (future column/table) for this hook to surface.
 * Until that exists, isDownTrendFor() drives the cheap, honest template message.
 */
export function useDownwardTrend() {
  return useQuery({
    queryKey: scfLearnerLoopKeys.downwardTrend(),
    queryFn: async (): Promise<DownwardTrendRow[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_downward_trend_for_learner');
      if (error) throw new Error(`Failed to load your trend: ${error.message}`);
      return (data || []) as DownwardTrendRow[];
    },
    staleTime: 60_000,
  });
}

/** Convenience: is the learner on a downward trend for a given course_code? */
export function isDownTrendFor(
  rows: DownwardTrendRow[] | undefined,
  courseCode: string | null | undefined,
): DownwardTrendRow | null {
  if (!rows || !courseCode) return null;
  return rows.find((r) => r.course_code === courseCode) ?? null;
}
