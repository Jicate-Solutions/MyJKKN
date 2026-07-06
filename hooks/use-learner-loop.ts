// hooks/use-learner-loop.ts
// SCF self-improving loop · LEARNER LANE hooks (#2 trigger + #3b loop-closure).
// Lives beside hooks/use-session-feedback.ts (orchestrator-owned) but does NOT import it,
// so the two lanes never edit the same file. Calls the learner-scoped RPCs directly via the
// browser supabase client (RLS + SECURITY DEFINER enforce learner-only reads server-side).

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LoopClosureRow, StrugglingNoteRow } from '@/types/scf-learner-loop';

const getSupabase = () => createClientSupabaseClient();

export const scfLearnerLoopKeys = {
  all: ['scf-learner-loop'] as const,
  loopClosure: (from: string, to: string) =>
    [...scfLearnerLoopKeys.all, 'loop-closure', from, to] as const,
  strugglingNote: () => [...scfLearnerLoopKeys.all, 'struggling-note'] as const,
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
 * #2 — the AI-written support note for the calling learner, if one exists.
 * The scf-learner-notes cron drafts a short, warm, PRIVATE note (server-side, on the real
 * API key — a Max/Pro subscription cannot power production AI, see memory
 * feedback_subscription_cannot_power_production_app_ai) for learners on a 3-session downward
 * trend, and persists it to scf_learner_notes. This hook surfaces the learner's most-recent
 * note via fn_scf_my_struggling_note (SECURITY DEFINER, self-scoped). Returns null when no
 * note exists — the UI then shows NOTHING (no template fallback, per Director decision).
 */
export function useStrugglingNote() {
  return useQuery({
    queryKey: scfLearnerLoopKeys.strugglingNote(),
    queryFn: async (): Promise<StrugglingNoteRow | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_my_struggling_note');
      if (error) throw new Error(`Failed to load your note: ${error.message}`);
      const rows = (data || []) as StrugglingNoteRow[];
      return rows.length > 0 ? rows[0] : null;
    },
    staleTime: 60_000,
  });
}
