'use client';

// lib/services/ai-pulse/shared-library-service.ts
// ============================================================================
// AI Pulse — Shared Prompt Library (learner-facing peer graduated prompts)
// ============================================================================
// Read + report surface for graduated peer prompt-builds, over two SECURITY
// DEFINER, anon-locked RPCs (browser/authenticated client is all that's needed):
//
//   * fn_ai_pulse_topic_graduated_prompts(p_topic_type, p_topic_id, p_limit)
//       returns the top graduated peer prompts for ONE topic, anonymised
//       (prompt + score + used_count, no author PII), same-institution scoped.
//       Added dark in 20260723090000_ai_pulse_prompt_graduation.sql; returns
//       ZERO rows until prompt graduation is switched on.
//
//   * fn_ai_pulse_report_prompt_build(p_build_id, p_reason)
//       the learner "report this prompt" safety valve added in
//       20260726034212_ai_pulse_prompt_build_reports.sql (learner flags, a
//       champion later disqualifies). Refuses self-report + cross-institution.
//
// Topic sourcing: the graduated read is per-topic, so we first read the
// learner's OWN builds (fn_ai_pulse_my_prompt_builds — returns topic_type +
// topic_id) to discover the topics they've practised, then fetch the best peer
// prompts for those same topics. Both feeds are dark today, so the library is
// empty and the card renders nothing (byte-identical to the current page).
//
// Type note: none of these ai_pulse_* RPCs are in the generated Supabase types,
// so the client is cast to `any` — the same convention as leaderboard-service /
// participation-service / prompt-builder-card.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'ai-pulse/shared-library';

// Cap the number of distinct topics we fan out over — a learner realistically
// has 1–3 (their subject(s) + programme). Guards against an unbounded loop.
const MAX_TOPICS = 4;
const PER_TOPIC_LIMIT = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraduatedPromptRow {
  id: string; // ai_pulse_prompt_builds.id — the build being shown / reported
  assembled_prompt: string;
  score: number | null;
  graduated_at: string | null;
  used_count: number;
  topic_type: string; // carried from the topic we queried, for grouping
}

interface MyBuildTopic {
  topic_type: string;
  topic_id: string;
}

// ---------------------------------------------------------------------------
// Read: graduated peer prompts for the learner's own build-topics
// ---------------------------------------------------------------------------

async function fetchSharedLibrary(cycleId?: string | null): Promise<GraduatedPromptRow[]> {
  const supabase = createClientSupabaseClient() as any;

  // 1) discover the learner's topics from their own builds.
  const { data: builds, error: buildsErr } = await supabase.rpc(
    'fn_ai_pulse_my_prompt_builds',
    { p_cycle_id: cycleId ?? null },
  );
  if (buildsErr) {
    logger.error(MODULE, 'fn_ai_pulse_my_prompt_builds failed', buildsErr);
    throw new Error(buildsErr.message ?? 'Failed to load your builds');
  }

  const seen = new Set<string>();
  const topics: MyBuildTopic[] = [];
  for (const b of (builds ?? []) as Array<{ topic_type: string | null; topic_id: string | null }>) {
    if (!b.topic_type || !b.topic_id) continue;
    const key = `${b.topic_type}:${b.topic_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push({ topic_type: b.topic_type, topic_id: b.topic_id });
    if (topics.length >= MAX_TOPICS) break;
  }
  if (topics.length === 0) return []; // dark today → empty → card hides

  // 2) fetch the top graduated peer prompts for each topic, in parallel.
  const perTopic = await Promise.all(
    topics.map(async (t) => {
      const { data, error } = await supabase.rpc('fn_ai_pulse_topic_graduated_prompts', {
        p_topic_type: t.topic_type,
        p_topic_id: t.topic_id,
        p_limit: PER_TOPIC_LIMIT,
      });
      if (error) {
        logger.error(MODULE, 'fn_ai_pulse_topic_graduated_prompts failed', error);
        return [] as GraduatedPromptRow[];
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        assembled_prompt: String(row.assembled_prompt ?? ''),
        // PostgREST returns numeric/bigint as strings — coerce here so the UI
        // never has to.
        score: row.score == null ? null : Number(row.score),
        graduated_at: (row.graduated_at as string | null) ?? null,
        used_count: Number(row.used_count ?? 0),
        topic_type: t.topic_type,
      }));
    }),
  );

  // 3) flatten + dedup by build id, best score first.
  const byId = new Map<string, GraduatedPromptRow>();
  for (const row of perTopic.flat()) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort(
    (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity),
  );
}

export function useSharedLibrary(cycleId?: string | null): UseQueryResult<GraduatedPromptRow[], Error> {
  return useQuery<GraduatedPromptRow[], Error>({
    queryKey: ['ai-pulse', 'shared-library', cycleId ?? 'latest'],
    queryFn: () => fetchSharedLibrary(cycleId),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Write: learner reports a peer build (maps RPC exceptions to plain language)
// ---------------------------------------------------------------------------

export function reportErrorMessage(e: Error): string {
  const m = e?.message ?? '';
  if (m.includes('cannot_report_own_build')) return 'You can’t report your own prompt.';
  if (m.includes('cross_institution')) return 'That prompt isn’t from your institution.';
  if (m.includes('not_a_learner')) return 'Reporting is for learners — open it from a learner account.';
  if (m.includes('build_not_found')) return 'That prompt is no longer available.';
  if (m.includes('not authenticated')) return 'Please sign in again to report.';
  return 'Could not send your report. Please try again.';
}

export async function reportPromptBuild(buildId: string, reason: string): Promise<void> {
  const supabase = createClientSupabaseClient() as any;
  const { error } = await supabase.rpc('fn_ai_pulse_report_prompt_build', {
    p_build_id: buildId,
    p_reason: reason,
  });
  if (error) throw error;
}
