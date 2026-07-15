// hooks/use-struggling-notes-sent.ts
// SCF self-improving loop · LEADERSHIP LANE — the "a support note went out" signal.
// Calls fn_scf_struggling_notes_sent (SECURITY DEFINER, gated to narrowest leadership —
// principal/dean/institution-admin/super, the SAME gate as the learner-trajectory card).
// Returns WHICH learners received a note + how many + when — NEVER the note's wording.
// On a non-authorized caller the RPC raises; the consuming card self-hides (the sibling
// trajectory card already surfaces the explicit access-denied for this audience).

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = () => createClientSupabaseClient();

/** fn_scf_struggling_notes_sent — one row per (learner, course) that received >=1 note in
 *  the window. Existence + count + timing only; the note text is never returned here. */
export interface NoteSentRow {
  student_id: string;
  learner_name: string | null;
  register_number: string | null;
  department_name: string | null;
  course_code: string;
  notes_count: number;
  last_note_at: string; // ISO timestamp of the most-recent note
}

export const strugglingNotesSentKeys = {
  all: ['scf-struggling-notes-sent'] as const,
  // institutionId is part of the key: without it, picking a college would show
  // the previously cached all-colleges rows.
  range: (from: string, to: string, institutionId?: string | null) =>
    [...strugglingNotesSentKeys.all, from, to, institutionId ?? 'all'] as const,
};

/** `institutionId` narrows to one college server-side via the 3-arg overload
 *  (this RPC returns no institution column, so it cannot be filtered client-side
 *  like the sibling cards). Omit for every college in scope. */
export function useStrugglingNotesSent(
  from: string,
  to: string,
  institutionId?: string | null,
) {
  return useQuery({
    queryKey: strugglingNotesSentKeys.range(from, to, institutionId),
    queryFn: async (): Promise<NoteSentRow[]> => {
      const supabase = getSupabase();
      // The 3-arg overload has NO default on p_institution_id (a default would
      // make 2-arg calls ambiguous), so pick the overload by argument shape.
      const { data, error } = await supabase.rpc(
        'fn_scf_struggling_notes_sent',
        institutionId
          ? { p_from: from, p_to: to, p_institution_id: institutionId }
          : { p_from: from, p_to: to },
      );
      if (error) throw new Error(error.message);
      return (data || []) as NoteSentRow[];
    },
    staleTime: 60_000,
    retry: false, // a 'not authorized' raise is terminal — don't retry the gate
  });
}
