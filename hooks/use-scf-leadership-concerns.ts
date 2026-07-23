// hooks/use-scf-leadership-concerns.ts
// SCF self-improving loop · LEADERSHIP LANE — the "one voice asked for help" signal.
// Calls fn_scf_leadership_concerns (SECURITY DEFINER, gated to leadership —
// super_admin/administrator/institution_admin/dean/hod/principal/coordinator, the SAME
// gate as fn_scf_escalation_followups). Returns courses where a GOOD-average class
// (3 <= avg < 4.5) had exactly ONE genuine help-ask — the teacher intentionally gets
// no tip (n=1 would over-react; the struggling-note routine already supports that
// learner), but leadership sees the single voice here. concern_summary is an AI
// aggregate line — never a verbatim quote, never a student identity.
// On a non-authorized caller the RPC raises; the consuming card self-hides.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = () => createClientSupabaseClient();

/** fn_scf_leadership_concerns — one row per (course, faculty, window) flagged as a
 *  lone-voice concern in the window. Aggregate signal only. */
export interface LeadershipConcernRow {
  institution_id: string | null;
  course_code: string;
  faculty_email: string | null;
  window_from: string;
  window_to: string;
  responses: number | null;
  avg_understood: number | null;
  concern_summary: string | null;
  created_at: string; // ISO timestamp
}

export const scfLeadershipConcernKeys = {
  all: ['scf-leadership-concerns'] as const,
  range: (from: string, to: string) =>
    [...scfLeadershipConcernKeys.all, from, to] as const,
};

export function useScfLeadershipConcerns(from: string, to: string) {
  return useQuery({
    queryKey: scfLeadershipConcernKeys.range(from, to),
    queryFn: async (): Promise<LeadershipConcernRow[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_leadership_concerns', {
        p_from: from,
        p_to: to,
      });
      if (error) throw new Error(error.message);
      return (data || []) as LeadershipConcernRow[];
    },
    staleTime: 60_000,
    retry: false, // a 'not authorized' raise is terminal — don't retry the gate
  });
}
