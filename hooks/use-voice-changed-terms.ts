// hooks/use-voice-changed-terms.ts
// SCF learner lane · "You said → this changed", the TERMLY ledger.
//
// Deliberately a separate file from hooks/use-learner-loop.ts (the live #3b lane)
// so the two surfaces never edit the same file. Nothing new is invented here —
// every read below goes through substrate that already exists in production:
//
//   * fn_scf_loop_closure_for_learner(p_from, p_to) — the chain itself
//     (20260630181000, hardened 20260709021500). SECURITY DEFINER, STABLE,
//     scoped to the caller internally via auth.uid() -> learners_profiles, and
//     already REVOKEd from anon. It returns the learner's own flagged session,
//     the real recorded change, and the learner's own better/same/worse vote.
//     The live card calls it over a rolling 120 days; the ledger calls the same
//     function over a multi-year window. No new RPC was needed.
//   * AcademicYearService.getAcademicYearsByInstitution — the ONLY period in the
//     schema with real DATE boundaries. `semesters` carries semester_code /
//     semester_name / semester_order but NO start_date or end_date, so true
//     per-semester boundaries are not derivable; semester_order cannot stand in
//     for them either (it means YEAR in some institutions and SEMESTER in
//     others). Grouping is therefore by academic year, labelled with the real
//     academic_year_name, and never by a guessed term number.
//   * RecognitionService.getMyRecognition — the campus_living_recognition read
//     layer. The 'voice_confirmed_better' confer (fired by
//     fn_recognition_from_scf_resolution_vote, 20260725123000 / hardened
//     20260725191500) is PRIVATE (is_public = false) for the SCF anonymity
//     contract, so it reaches its own learner through RLS and appears on no
//     other surface today.
//
// Every read fails soft to empty: the ledger is history, never the page's job.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import {
  RecognitionService,
  type MyRecognitionRow,
} from '@/lib/services/campus-living/recognition-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { LoopClosureRow } from '@/types/scf-learner-loop';

const MODULE = 'academic/scf-voice-ledger';

/** The recognition event_type this ledger lines up against each change. */
export const VOICE_CONFIRMED_BETTER = 'voice_confirmed_better';

/** One academic year reduced to what the ledger needs: a label and a real window. */
export interface TermWindow {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
}

/**
 * The full change history for the calling learner over [from, to].
 *
 * Same RPC the live loop-closure card uses — only the window differs, so the
 * two share the server-side honesty rules (a row exists only when a REAL
 * recorded change is on file) and cost nothing extra to maintain. Gated by
 * `enabled` so opening the page does not pay for history nobody expanded.
 */
export function useVoiceChangeHistory(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['scf-voice-ledger', 'changes', from, to],
    queryFn: async (): Promise<LoopClosureRow[]> => {
      const supabase = createClientSupabaseClient();
      // RPC not in the generated types yet — untyped-client cast, the same guard
      // recognition-service.ts uses. Keeps this file free of the stale-types
      // errors the older learner-loop hooks carry.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_scf_loop_closure_for_learner', {
        p_from: from,
        p_to: to,
      });
      if (error) throw new Error(`Failed to load your change history: ${error.message}`);
      return (data || []) as LoopClosureRow[];
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * The learner's institution's academic years, newest first — the ledger's
 * grouping windows. Inactive years are INCLUDED on purpose: a closed year is
 * exactly the history bucket this view exists to show.
 *
 * Fails soft to []: with no windows the ledger still renders every change in
 * one reverse-chronological list rather than showing the learner an error for
 * a grouping detail.
 */
export function useMyTermWindows(institutionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['scf-voice-ledger', 'term-windows', institutionId],
    queryFn: async (): Promise<TermWindow[]> => {
      if (!institutionId) return [];
      try {
        const years = await AcademicYearService.getAcademicYearsByInstitution(
          institutionId,
          true // include closed years — they are the history buckets
        );
        return years
          .filter((y) => y.start_date && y.end_date)
          .map((y) => ({
            id: y.id,
            label: y.academic_year_name,
            start_date: y.start_date,
            end_date: y.end_date,
          }))
          .sort((a, b) => b.start_date.localeCompare(a.start_date));
      } catch (e) {
        logger.warn(MODULE, 'term windows unavailable — falling back to one list', e);
        return [];
      }
    },
    enabled: enabled && !!institutionId,
    staleTime: 30 * 60_000,
  });
}

/**
 * The calling learner's own conferred 'voice_confirmed_better' acts.
 *
 * Read through the existing recognition service (no parallel feed). These rows
 * are private by design, so this is the first surface on which the learner can
 * see the act that was conferred to them for closing their own loop.
 */
export function useMyVoiceRecognitions(learnerId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['scf-voice-ledger', 'recognitions', learnerId],
    queryFn: (): Promise<MyRecognitionRow[]> =>
      RecognitionService.getMyRecognition(learnerId!, 'academic', 200, VOICE_CONFIRMED_BETTER),
    enabled: enabled && !!learnerId,
    staleTime: 5 * 60_000,
  });
}
