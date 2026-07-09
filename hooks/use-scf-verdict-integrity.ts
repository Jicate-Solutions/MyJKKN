// hooks/use-scf-verdict-integrity.ts
// SCF self-improving loop · LEADERSHIP LANE — "what if the facilitator bluffed?"
// (Director interview 2026-07-09: contradiction → alert leadership; repeat
// pattern → leadership-only track record; the facilitator never sees a score
// kept on them.)
//
// A verdict is testimony; the measured outcome_lift (whole-class next-session
// ratings, computed by the outcome measurer) is the independent witness. These
// hooks call the two leadership-gated read fns that surface where they disagree:
//   fn_scf_verdict_track_record   — per facilitator: claims matched numbers N of M
//   fn_scf_verdict_contradictions — row-level: said "helped", numbers stayed flat
// Both raise for non-leadership callers; the consuming card self-hides.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = () => createClientSupabaseClient();

export interface VerdictTrackRecordRow {
  faculty_email: string | null;
  institution_id: string | null;
  verdicts: number;
  measured: number;
  agreed: number;
  contradicted: number;
}

export interface VerdictContradictionRow {
  course_code: string;
  faculty_email: string | null;
  human_verdict: string;
  verdict_on: string;
  input_avg_understood: number | null;
  outcome_lift: number | null;
  window_from: string;
  window_to: string;
}

export const scfVerdictIntegrityKeys = {
  all: ['scf-verdict-integrity'] as const,
  track: (from: string, to: string) => [...scfVerdictIntegrityKeys.all, 'track', from, to] as const,
  contradictions: (from: string, to: string) =>
    [...scfVerdictIntegrityKeys.all, 'contradictions', from, to] as const,
};

export function useVerdictTrackRecord(from: string, to: string) {
  return useQuery({
    queryKey: scfVerdictIntegrityKeys.track(from, to),
    queryFn: async (): Promise<VerdictTrackRecordRow[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_verdict_track_record', {
        p_from: from,
        p_to: to,
      });
      if (error) throw new Error(error.message);
      return (data || []) as VerdictTrackRecordRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: false, // gate-denied callers must not hammer the RPC
  });
}

export function useVerdictContradictions(from: string, to: string) {
  return useQuery({
    queryKey: scfVerdictIntegrityKeys.contradictions(from, to),
    queryFn: async (): Promise<VerdictContradictionRow[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_verdict_contradictions', {
        p_from: from,
        p_to: to,
      });
      if (error) throw new Error(error.message);
      return (data || []) as VerdictContradictionRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
