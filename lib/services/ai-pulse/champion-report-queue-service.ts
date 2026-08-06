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
//            SECURITY DEFINER + runtime guard (super admin OR the designated
//            champion key aiPulse:anomaly.review) + institution-scoped.
//            ai_pulse_prompt_build_reports is RLS-deny-all with no policies, so
//            this RPC is the ONLY read path to the flags.
//
//   HIDE   fn_ai_pulse_disqualify_prompt_build(p_build_id, p_reason)   [existing]
//   KEEP   fn_ai_pulse_clear_prompt_build_reports(p_build_id)          [existing]
//
// Both decision RPCs already existed — this service only calls them. No new
// write path was added, and no new state column: a decision writes
// disqualified_at or report_cleared_at, which is what drops the row out of the
// queue on the next read.
//
// PERMISSION NOTE (Director's retarget, 2026-08-04): the two decision RPCs were
// gated on the Monday-Lab scoring key alone, so a designated champion holding
// only aiPulse:anomaly.review could have read this queue and then had BOTH
// buttons raise 42501. Migration 20260804120000 section 3 WIDENS both to accept
// either key (the scoring key is kept — the graduated-library moderation path
// still depends on it), so read and write now agree.
//
// Type note: none of the ai_pulse_* RPCs are in the generated Supabase types, so
// the client is cast to `any` — same convention as shared-library-service /
// leaderboard-service / anomaly-service.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'ai-pulse/champion-report-queue';
const QUERY_KEY_ROOT = ['ai-pulse', 'champion-report-queue'] as const;
const SAFETY_QUERY_KEY_ROOT = ['ai-pulse', 'champion-safety-queue'] as const;
const SAFETY_HEALTH_KEY_ROOT = ['ai-pulse', 'prompt-safety-health'] as const;
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

// ===========================================================================
// AI-REJECTED PROMPTS — Director moderation decisions #8 and #10
// ===========================================================================
// Decision #8: "AI-rejected prompts: route to a champion for a second look. A
// safety_status='failed' prompt must appear somewhere a human can release it."
//
// The ₹0 safety pre-gate (migration 20260804110000) judges a learner's prompt
// build before it can enter the classmates feed, and the safety prompt tells the
// model to answer "not appropriate" whenever it is UNSURE — so false positives
// are the expected failure direction. The very first verdict it ever produced was
// one: a learner practising how to report a lost purse at a police station was
// rejected. Until this surface existed, a 'failed' verdict was a silent dead end.
//
//   READ    fn_ai_pulse_champion_safety_queue(p_limit)
//   RELEASE fn_ai_pulse_release_prompt_build_safety(p_build_id)   failed -> passed
//   HEALTH  fn_ai_pulse_prompt_safety_health()                    decision #10
//
// Decision #10: the safety check runs every ten minutes on a cron. If it silently
// stops, every new build stays 'pending' and simply never appears — and an empty
// feed is indistinguishable from "nobody is writing prompts". The health read is
// the only place that distinction is visible.
//
// Director decision #2 (2026-07-30) then corrected WHICH signal it watches. The
// first version read max(safety_checked_at) over builds, which measures work
// done, not the checker being alive: the cron stamps a build only when one is
// eligible, so a healthy run with nothing to do stamps nothing. Measured on prod
// that day — 0 eligible builds, 357 minutes since the last stamp, alarm firing,
// cron perfectly healthy, and no way for it to ever clear. The health read now
// carries BOTH, and only the first is the heartbeat:
//   checker_last_ran_at    from the ai_pulse_cron_runs run log   (liveness)
//   last_build_checked_at  max(safety_checked_at)                (throughput)
//
// Substrate: migrations 20260805100000_ai_pulse_safety_review_queue.sql and
// 20260805140000_ai_pulse_cron_heartbeat.sql.
// All three are SECURITY DEFINER, gated on super admin OR aiPulse:anomaly.review,
// institution-scoped, with anon and PUBLIC revoked.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SafetyQueueRow {
  build_id: string;
  assembled_prompt: string;
  score: number | null;
  /** Author's display name — a champion needs it to judge; the learner-facing
   *  feed stays anonymised. Null when the author's profile row is missing. */
  author_name: string | null;
  institution_id: string | null;
  /** The automated checker's OWN stated reasons. Not findings of fact — the UI
   *  must label them as the checker's reasoning, because they can be wrong. */
  safety_reasons: string[];
  safety_checked_at: string | null;
  created_at: string | null;
}

export interface PromptSafetyHealth {
  /** EVERY pending build, eligible or not. Still shown so the whole backlog is
   *  visible — but deliberately NOT the number any alarm is derived from, see
   *  eligible_waiting_count. */
  waiting_count: number;
  /** The subset of pending builds the cron would actually pick up: graded,
   *  scored 60-79, prompt present, not graduated, not disqualified. Zero here
   *  with a fresh heartbeat is HEALTHY AND IDLE, not stuck.
   *
   *  Null means the reader could not tell us — i.e. this build of the app is
   *  talking to a database where migration 20260813030000 has not been applied
   *  yet. The card must treat null as "unknown" and stay quiet, never as zero
   *  and never as an alarm: the deploy and the hand-applied migration do not
   *  land at the same moment. */
  eligible_waiting_count: number | null;
  rejected_count: number;
  passed_count: number;
  /** When the oldest build the checker would ACTUALLY pick up arrived. As of
   *  migration 20260813030000 this is eligible-only. It previously spanned every
   *  pending build and therefore grew without bound on a healthy system —
   *  measured at 14 days on 2026-08-06, when 44 of the 46 pending builds scored
   *  5-58 and were permanently outside the checker's 60-79 band. */
  oldest_waiting_at: string | null;
  /** Is the checker SUPPOSED to be working? The live kill switch
   *  (prompt_safety_check_enabled). "Switched off" is a REPORTABLE state, not
   *  silence, and it is not the same thing as "crashed" — the cron writes its
   *  heartbeat before reading this switch, so a disabled checker still ticks.
   *
   *  Null means unknown (pre-migration reader), which is not "off". */
  checker_enabled: boolean | null;
  /** LIVENESS — when the checker itself last ran, from the ai_pulse_cron_runs
   *  run log. This is the heartbeat. Null means no run has ever been recorded,
   *  which on a fresh deploy is expected and is NOT an alarm. */
  checker_last_ran_at: string | null;
  /** THROUGHPUT — when a prompt was last stamped, i.e. max(safety_checked_at).
   *  Deliberately NOT the heartbeat: this route stamps a build only when one is
   *  eligible, so a healthy cron with nothing to do freezes this value. Reading
   *  it as liveness produced a permanent false alarm (Director decision #2). */
  last_build_checked_at: string | null;
}

// ---------------------------------------------------------------------------
// Read — the AI-rejected queue
// ---------------------------------------------------------------------------

async function fetchSafetyQueue(limit: number): Promise<SafetyQueueRow[]> {
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase.rpc('fn_ai_pulse_champion_safety_queue', {
    p_limit: limit,
  });
  if (error) {
    logger.error(MODULE, 'fn_ai_pulse_champion_safety_queue failed', error);
    throw new Error(error.message ?? 'Failed to load the AI-rejected prompts');
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    build_id: String(row.build_id),
    assembled_prompt: String(row.assembled_prompt ?? ''),
    // PostgREST returns numeric/bigint as strings — coerce here so the UI never has to.
    score: row.score == null ? null : Number(row.score),
    author_name: (row.author_name as string | null) ?? null,
    institution_id: (row.institution_id as string | null) ?? null,
    safety_reasons: Array.isArray(row.safety_reasons) ? (row.safety_reasons as string[]) : [],
    safety_checked_at: (row.safety_checked_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  }));
}

export function useChampionSafetyQueue(
  limit: number = DEFAULT_LIMIT,
): UseQueryResult<SafetyQueueRow[], Error> {
  return useQuery<SafetyQueueRow[], Error>({
    queryKey: [...SAFETY_QUERY_KEY_ROOT, 'list', limit],
    queryFn: () => fetchSafetyQueue(limit),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Read — is the automatic safety check still running? (decision #10)
// ---------------------------------------------------------------------------

async function fetchPromptSafetyHealth(): Promise<PromptSafetyHealth> {
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase.rpc('fn_ai_pulse_prompt_safety_health');
  if (error) {
    logger.error(MODULE, 'fn_ai_pulse_prompt_safety_health failed', error);
    throw new Error(error.message ?? 'Failed to load the safety check status');
  }
  // A RETURNS TABLE function comes back as an array even for its single row.
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  return {
    // bigint arrives as a string — Number() here, never in the component.
    waiting_count: Number(row?.waiting_count ?? 0),
    // The two fields added by migration 20260813030000 are mapped to null when
    // ABSENT rather than defaulted, and absent is distinguished from a real
    // value — not folded into `?? 0` / `?? false`. The reason is deploy order:
    // this code ships in a PR whose migration is applied by hand afterwards, so
    // for a while the RPC returns the older six columns. Defaulting would make
    // the card announce "0 eligible" and "checker switched off" about a checker
    // that is running perfectly — reintroducing, from the client side, the exact
    // false alarm this change exists to remove.
    eligible_waiting_count:
      row?.eligible_waiting_count == null ? null : Number(row.eligible_waiting_count),
    rejected_count: Number(row?.rejected_count ?? 0),
    passed_count: Number(row?.passed_count ?? 0),
    oldest_waiting_at: (row?.oldest_waiting_at as string | null) ?? null,
    checker_enabled: typeof row?.checker_enabled === 'boolean' ? row.checker_enabled : null,
    checker_last_ran_at: (row?.checker_last_ran_at as string | null) ?? null,
    last_build_checked_at: (row?.last_build_checked_at as string | null) ?? null,
  };
}

export function usePromptSafetyHealth(): UseQueryResult<PromptSafetyHealth, Error> {
  return useQuery<PromptSafetyHealth, Error>({
    queryKey: [...SAFETY_HEALTH_KEY_ROOT, 'summary'],
    queryFn: fetchPromptSafetyHealth,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Release — a champion overturns an AI rejection
// ---------------------------------------------------------------------------

export function releaseErrorMessage(e: Error): string {
  const m = e?.message ?? '';
  if (m.includes('only a champion')) {
    return 'You no longer hold the champion permission for this action. Ask a super admin to check your role.';
  }
  if (m.includes('no longer awaiting release')) {
    return 'Someone already handled this prompt — refresh to see the current list.';
  }
  if (m.includes('not authenticated')) return 'Your session expired — please sign in again.';
  return 'Could not release this prompt. Please try again.';
}

export function useReleasePromptBuildSafety() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { buildId: string }>({
    mutationFn: async ({ buildId }) => {
      const supabase = createClientSupabaseClient() as any;
      const { error } = await supabase.rpc('fn_ai_pulse_release_prompt_build_safety', {
        p_build_id: buildId,
      });
      if (error) {
        logger.error(MODULE, 'fn_ai_pulse_release_prompt_build_safety failed', error);
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      // The released build is now 'passed', so it drops out of the queue read —
      // and the health counts move one from rejected to passed.
      queryClient.invalidateQueries({ queryKey: SAFETY_QUERY_KEY_ROOT });
      queryClient.invalidateQueries({ queryKey: SAFETY_HEALTH_KEY_ROOT });
    },
  });
}
