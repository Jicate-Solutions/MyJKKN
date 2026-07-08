// hooks/use-learner-loop.ts
// SCF self-improving loop · LEARNER LANE hooks (#2 trigger + #3b loop-closure).
// Lives beside hooks/use-session-feedback.ts (orchestrator-owned) but does NOT import it,
// so the two lanes never edit the same file. Calls the learner-scoped RPCs directly via the
// browser supabase client (RLS + SECURITY DEFINER enforce learner-only reads server-side).

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LoopClosureRow, StrugglingNoteRow, MyMentorRow } from '@/types/scf-learner-loop';

const getSupabase = () => createClientSupabaseClient();

export const scfLearnerLoopKeys = {
  all: ['scf-learner-loop'] as const,
  loopClosure: (from: string, to: string) =>
    [...scfLearnerLoopKeys.all, 'loop-closure', from, to] as const,
  strugglingNote: () => [...scfLearnerLoopKeys.all, 'struggling-note'] as const,
  myMentor: () => [...scfLearnerLoopKeys.all, 'my-mentor'] as const,
};

/** The caller's OWN senior peer mentor (mentee side of the induction volunteer
 *  groups). null when the learner has no assigned mentor — consumers self-scope. */
export function useMyMentor() {
  return useQuery({
    queryKey: scfLearnerLoopKeys.myMentor(),
    queryFn: async (): Promise<MyMentorRow | null> => {
      const supabase = getSupabase();
      // Fail-soft null, no retries: this line is decorative — during the
      // deploy→migrate gap the RPC doesn't exist yet, and 3 default retries
      // per learner would be an error storm for nothing (deep-review #1902).
      const { data, error } = await supabase.rpc('fn_induction_my_mentor');
      if (error) return null;
      const rows = (data || []) as MyMentorRow[];
      return rows.length > 0 && rows[0].mentor_name ? rows[0] : null;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** One-tap follow-up on the support note: did the learner reach out? Turns the
 *  note from comfort into a measurable loop (2026-07-09). */
export function useNoteReachedOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { noteId: string; reachedOut: boolean | null }) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('fn_scf_learner_note_reached_out', {
        p_note_id: input.noteId,
        p_reached_out: input.reachedOut,
      });
      if (error) throw new Error(`Failed to save your answer: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scfLearnerLoopKeys.strugglingNote() });
    },
    // A failed tap must be VISIBLE (deep-review #1902 r2 consensus): silently
    // re-enabling the button would quietly drop the note's outcome signal.
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not save your answer — please try again.');
    },
  });
}

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
 * The learner's explicit close of the loop: Better / Same / Worse on the note
 * their own flag fed. fn_scf_cast_resolution_vote is authority-bound server-side
 * (the caller must have a flagged (<=2) session inside the note's window), and
 * upserts — a learner can change their answer. Invalidates loop-closure so the
 * card re-renders with the saved vote.
 */
export function useCastResolutionVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { suggestionId: string; vote: 'better' | 'same' | 'worse' }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_cast_resolution_vote', {
        p_suggestion_id: input.suggestionId,
        p_vote: input.vote,
      });
      if (error) throw new Error(`Failed to save your answer: ${error.message}`);
      return data === true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scfLearnerLoopKeys.all });
    },
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
