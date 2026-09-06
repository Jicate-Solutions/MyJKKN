'use client';

// lib/services/ai-pulse/shared-library-service.ts
// ============================================================================
// AI Pulse — Shared Prompt Library (learner-facing peer graduated prompts)
// ============================================================================
// Read + report surface for graduated peer prompt-builds, over SECURITY
// DEFINER, anon-locked RPCs (browser/authenticated client is all that's needed):
//
//   * fn_ai_pulse_my_topics()
//       returns the CURRENT learner's finest course/programme topics
//       (topic_type, topic_id, topic_label), self-scoped from
//       auth.uid() -> profiles.learner_id (never a caller-supplied id). A thin
//       wrapper over the service-role-only fn_ai_pulse_learner_topics, added in
//       20260803030000_ai_pulse_my_topics_wrapper.sql. Every learner resolves
//       at least their programme topic, so the library works even for a learner
//       who has never built a prompt of their own.
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
//       champion later decides). Refuses self-report. It ALSO refused
//       cross-institution reports until 20260804150000 removed that guard so the
//       cross-college classmates feed could be reported too — see that migration.
//       Used by BOTH learner surfaces: the graduated library card and (since
//       2026-07-30, Director: "add a report button to the feed") the classmates
//       feed card.
//
// Topic sourcing: the graduated read is per-topic, so we first resolve the
// learner's OWN topics via fn_ai_pulse_my_topics (their subject(s) + programme),
// then fetch the best peer prompts for those same topics. The topics feed is
// live for every learner; the graduated feed is dark today, so the library is
// still empty and the card renders nothing (byte-identical to the current page)
// until prompt graduation is switched on.
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

interface MyTopic {
  topic_type: string;
  topic_id: string;
}

// ---------------------------------------------------------------------------
// Read: graduated peer prompts for the learner's course/programme topics
// ---------------------------------------------------------------------------

async function fetchSharedLibrary(cycleId?: string | null): Promise<GraduatedPromptRow[]> {
  const supabase = createClientSupabaseClient() as any;
  void cycleId; // topics + graduated reads are not cycle-scoped; kept for the hook's queryKey only.

  // 1) resolve the learner's OWN topics (their subject(s) + programme). Sourced
  //    from fn_ai_pulse_my_topics so EVERY learner resolves at least their
  //    programme topic — not only those who have built a prompt themselves.
  const { data: topicRows, error: topicsErr } = await supabase.rpc('fn_ai_pulse_my_topics');
  if (topicsErr) {
    logger.error(MODULE, 'fn_ai_pulse_my_topics failed', topicsErr);
    throw new Error(topicsErr.message ?? 'Failed to load your topics');
  }

  const seen = new Set<string>();
  const topics: MyTopic[] = [];
  for (const t of (topicRows ?? []) as Array<{ topic_type: string | null; topic_id: string | null }>) {
    if (!t.topic_type || !t.topic_id) continue;
    const key = `${t.topic_type}:${t.topic_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push({ topic_type: t.topic_type, topic_id: t.topic_id });
    if (topics.length >= MAX_TOPICS) break;
  }
  if (topics.length === 0) return []; // no topics → empty → card hides

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
  // RETAINED ON PURPOSE even though 20260804150000 removes the RPC's
  // cross-institution refusal: that migration is not applied everywhere yet, so
  // until it is, a cross-college report still raises this and the learner must
  // see a sentence rather than the generic fallback. Safe to delete once the
  // migration is live in every environment.
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

// ---------------------------------------------------------------------------
// Read: classmates' NON-star prompts (score 60–79) for the learner's topics
// ---------------------------------------------------------------------------
// The "classmates' prompts" feed (v2 PR B, decision #5). Same topic-fan-out as
// the graduated library, but over fn_ai_pulse_topic_peer_prompts, which returns
// decent-but-not-yet-star peer builds (matched by subject NAME across all
// colleges). Copying one of these is what lets popularity promote a not-yet-star
// prompt — the copy recorder now accepts non-graduated, cross-college targets.

const PEER_PER_TOPIC_LIMIT = 6;

export interface PeerPromptRow {
  id: string; // ai_pulse_prompt_builds.id — the non-star build being shown
  assembled_prompt: string;
  score: number | null;
  used_count: number;
  topic_type: string; // carried from the topic we queried, for grouping
  // Director decision #4 (2026-07-30): the author's real display name. Null when
  // the author's learner row is missing or its name is blank — the feed still
  // shows the prompt (the RPC LEFT-joins), and the card renders "A classmate".
  author_name: string | null;
}

async function fetchPeerPrompts(cycleId?: string | null): Promise<PeerPromptRow[]> {
  const supabase = createClientSupabaseClient() as any;
  void cycleId; // topics + peer reads are not cycle-scoped; kept for the queryKey only.

  // 1) resolve the learner's OWN topics (their subject(s) + programme).
  const { data: topicRows, error: topicsErr } = await supabase.rpc('fn_ai_pulse_my_topics');
  if (topicsErr) {
    logger.error(MODULE, 'fn_ai_pulse_my_topics failed (peer)', topicsErr);
    throw new Error(topicsErr.message ?? 'Failed to load your topics');
  }

  const seen = new Set<string>();
  const topics: MyTopic[] = [];
  for (const t of (topicRows ?? []) as Array<{ topic_type: string | null; topic_id: string | null }>) {
    if (!t.topic_type || !t.topic_id) continue;
    const key = `${t.topic_type}:${t.topic_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push({ topic_type: t.topic_type, topic_id: t.topic_id });
    if (topics.length >= MAX_TOPICS) break;
  }
  if (topics.length === 0) return []; // no topics → empty → card hides

  // 2) fetch the top peer prompts for each topic, in parallel.
  const perTopic = await Promise.all(
    topics.map(async (t) => {
      const { data, error } = await supabase.rpc('fn_ai_pulse_topic_peer_prompts', {
        p_topic_type: t.topic_type,
        p_topic_id: t.topic_id,
        p_limit: PEER_PER_TOPIC_LIMIT,
      });
      if (error) {
        logger.error(MODULE, 'fn_ai_pulse_topic_peer_prompts failed', error);
        return [] as PeerPromptRow[];
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        assembled_prompt: String(row.assembled_prompt ?? ''),
        // PostgREST returns numeric/bigint as strings — coerce here.
        score: row.score == null ? null : Number(row.score),
        used_count: Number(row.used_count ?? 0),
        topic_type: t.topic_type,
        // Keep null null (never the string "null") so the card falls back cleanly.
        author_name:
          row.author_name == null || String(row.author_name).trim() === ''
            ? null
            : String(row.author_name),
      }));
    }),
  );

  // 3) flatten + dedup by build id, best score first.
  const byId = new Map<string, PeerPromptRow>();
  for (const row of perTopic.flat()) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort(
    (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity),
  );
}

export function usePeerPrompts(cycleId?: string | null): UseQueryResult<PeerPromptRow[], Error> {
  return useQuery<PeerPromptRow[], Error>({
    queryKey: ['ai-pulse', 'peer-prompts', cycleId ?? 'latest'],
    queryFn: () => fetchPeerPrompts(cycleId),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Write: record a copy of a peer/graduated build (best-effort popularity ping)
// ---------------------------------------------------------------------------
// Returns the new distinct-copier count, or null if the ping was a no-op (dark
// gate off, self-copy, below the score floor, not a learner). Never throws into
// the UI — a copy to the clipboard must succeed even if the ping is refused.

export async function recordPromptCopy(buildId: string): Promise<number | null> {
  try {
    const supabase = createClientSupabaseClient() as any;
    const { data, error } = await supabase.rpc('fn_ai_pulse_record_prompt_build_use', {
      p_build_id: buildId,
      p_action: 'copy',
    });
    if (error) {
      logger.dev(MODULE, 'record copy ping failed', error);
      return null;
    }
    return data == null ? null : Number(data);
  } catch (e) {
    logger.dev(MODULE, 'record copy ping threw', e);
    return null;
  }
}
