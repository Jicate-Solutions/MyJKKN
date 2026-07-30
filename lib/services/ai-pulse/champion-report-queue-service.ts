'use client';

// lib/services/ai-pulse/champion-report-queue-service.ts
// ============================================================================
// AI Pulse — Champion review queue (Director moderation decision #3)
// ============================================================================
// "REPORT SPEED = a champion decides — reported feed prompts route to a senior
//  learner to decide; NO auto-hide."
//
// The classmates feed no longer auto-hides a build at N flags (migration
// 20260804120000). Instead every reported build waits here for a person:
//
//   READ   fn_ai_pulse_champion_report_queue(p_limit)
//            builds with >= 1 report, not yet disqualified, not yet cleared.
//            SECURITY DEFINER + runtime guard (super admin OR aiPulse:lab.score)
//            + institution-scoped. ai_pulse_prompt_build_reports is RLS-deny-all
//            with no policies, so this RPC is the ONLY read path to the flags.
//
//   HIDE   fn_ai_pulse_disqualify_prompt_build(p_build_id, p_reason)   [existing]
//   KEEP   fn_ai_pulse_clear_prompt_build_reports(p_build_id)          [existing]
//
// Both decision RPCs already existed and already carry the same champion guard —
// this service only calls them. No new write path was added, and no new state
// column: a decision writes disqualified_at or report_cleared_at, which is what
// drops the row out of the queue on the next read.
//
// Type note: none of the ai_pulse_* RPCs are in the generated Supabase types, so
// the client is cast to `any` — same convention as shared-library-service /
// leaderboard-service / anomaly-service.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'ai-pulse/champion-report-queue';
const QUERY_KEY_ROOT = ['ai-pulse', 'champion-report-queue'] as const;
const DEFAULT_LIMIT = 50;

// ---------------------------------------------------------------------------
// Types — one row per build awaiting a champion decision
// ---------------------------------------------------------------------------

export interface ReportQueueRow {
  build_id: string;
  assembled_prompt: string;
  score: number | null;
  /** Author's display name. A champion needs it to make a moderation call; this
   *  surface is permission-gated, the learner-facing feed stays anonymised. */
  author_name: string | null;
  institution_id: string | null;
  report_count: number;
  report_reasons: string[];
  last_reported_at: string | null;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function fetchReportQueue(limit: number): Promise<ReportQueueRow[]> {
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase.rpc('fn_ai_pulse_champion_report_queue', {
    p_limit: limit,
  });
  if (error) {
    logger.error(MODULE, 'fn_ai_pulse_champion_report_queue failed', error);
    throw new Error(error.message ?? 'Failed to load the review queue');
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    build_id: String(row.build_id),
    assembled_prompt: String(row.assembled_prompt ?? ''),
    // PostgREST returns numeric/bigint as strings — coerce here so the UI never has to.
    score: row.score == null ? null : Number(row.score),
    author_name: (row.author_name as string | null) ?? null,
    institution_id: (row.institution_id as string | null) ?? null,
    report_count: Number(row.report_count ?? 0),
    report_reasons: Array.isArray(row.report_reasons) ? (row.report_reasons as string[]) : [],
    last_reported_at: (row.last_reported_at as string | null) ?? null,
  }));
}

export function useChampionReportQueue(
  limit: number = DEFAULT_LIMIT,
): UseQueryResult<ReportQueueRow[], Error> {
  return useQuery<ReportQueueRow[], Error>({
    queryKey: [...QUERY_KEY_ROOT, 'list', limit],
    queryFn: () => fetchReportQueue(limit),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Decisions — HIDE / KEEP (both over pre-existing RPCs)
// ---------------------------------------------------------------------------

export type ChampionDecision = 'hide' | 'keep';

export interface DecideInput {
  buildId: string;
  decision: ChampionDecision;
  /** Only used by HIDE — stored on disqualified_reason for the audit trail. */
  reason?: string | null;
}

export function decisionErrorMessage(e: Error): string {
  const m = e?.message ?? '';
  if (m.includes('only a champion')) {
    return 'You no longer hold the champion permission for this action. Ask a super admin to check your role.';
  }
  if (m.includes('not authenticated')) return 'Your session expired — please sign in again.';
  return 'Could not save your decision. Please try again.';
}

export function useDecideOnReportedBuild() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DecideInput>({
    mutationFn: async ({ buildId, decision, reason }) => {
      const supabase = createClientSupabaseClient() as any;

      if (decision === 'hide') {
        const { error } = await supabase.rpc('fn_ai_pulse_disqualify_prompt_build', {
          p_build_id: buildId,
          p_reason: reason ?? null,
        });
        if (error) {
          logger.error(MODULE, 'fn_ai_pulse_disqualify_prompt_build failed', error);
          throw new Error(error.message);
        }
        return;
      }

      const { error } = await supabase.rpc('fn_ai_pulse_clear_prompt_build_reports', {
        p_build_id: buildId,
      });
      if (error) {
        logger.error(MODULE, 'fn_ai_pulse_clear_prompt_build_reports failed', error);
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      // The decided build now has disqualified_at or report_cleared_at set, so
      // the next read drops it out of the queue.
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_ROOT });
    },
  });
}
