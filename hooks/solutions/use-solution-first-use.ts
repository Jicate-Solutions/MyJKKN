'use client';

/**
 * Solutions Hub — the first real user of a solution.
 *
 * ONE ROW PER SOLUTION, EVER. The producing department records, at one
 * checkpoint, the first time somebody outside the team used the thing they
 * built (Director decision #5). The guarantee is the UNIQUE constraint on
 * `sh_solution_first_use.solution_id`, not the code below — `useRecordFirstUse`
 * is a plain insert and a duplicate is expected to come back as a 23505, which
 * is the correct answer to two tabs racing, not an error to design around.
 *
 * WHY THIS READS THE TABLE DIRECTLY instead of going through /api/solutions/*
 * like its siblings in this folder. The row is guarded by RLS on both read and
 * write (`solutions.first_use.view` / `.record`, plus the solution's
 * institution scope), so an API route would add a second place to get the same
 * gate right and nothing else. The read is per-solution and already scoped by
 * the viewer's own access — this is NOT the cluster-wide read that the CAC
 * funnel does, which has to go through a definer RPC precisely because a
 * client-side count returns the viewer's slice.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface SolutionFirstUse {
  id: string;
  solution_id: string;
  used_on: string;
  used_by: string;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface RecordFirstUseInput {
  used_on: string;
  used_by: string;
  note?: string;
}

export const solutionFirstUseKeys = {
  all: ['solutions-hub', 'first-use'] as const,
  bySolution: (solutionId: string) =>
    [...solutionFirstUseKeys.all, 'solution', solutionId] as const,
};

/**
 * The solution's first-use entry, or null when none has been recorded.
 *
 * `null` here means "no entry", NOT "this solution has never been used". The
 * card says so on screen — an unfilled register read as a measured zero is the
 * failure this platform already carries nine times over in its accreditation
 * tables.
 */
export function useSolutionFirstUse(solutionId: string | undefined) {
  return useQuery<SolutionFirstUse | null>({
    queryKey: solutionFirstUseKeys.bySolution(solutionId ?? ''),
    queryFn: async () => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_solution_first_use')
        .select('id, solution_id, used_on, used_by, note, recorded_by, created_at')
        .eq('solution_id', solutionId)
        .maybeSingle();
      if (error) throw error;
      return (data as SolutionFirstUse | null) ?? null;
    },
    enabled: !!solutionId,
    staleTime: 60_000,
    retry: false,
  });
}

export function useRecordFirstUse(solutionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecordFirstUseInput) => {
      const sb = createClientSupabaseClient() as any;
      // profiles.id is auth.users.id 1:1 on this platform, so the session user
      // id is the right value for recorded_by without a second lookup.
      const { data: auth } = await sb.auth.getUser();
      const { data, error } = await sb
        .from('sh_solution_first_use')
        .insert({
          solution_id: solutionId,
          used_on: input.used_on,
          used_by: input.used_by,
          note: input.note?.trim() ? input.note.trim() : null,
          recorded_by: auth?.user?.id ?? null,
        })
        .select('id, solution_id, used_on, used_by, note, recorded_by, created_at')
        .single();
      if (error) throw error;
      return data as SolutionFirstUse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: solutionFirstUseKeys.bySolution(solutionId),
      });
    },
  });
}

/**
 * What to tell someone whose insert was refused.
 *
 * Pulled out because the two refusals mean opposite things and a shared
 * "something went wrong" would hide both. 23505 means somebody already recorded
 * it — the constraint doing its job, and the page simply needs to reload. 42501
 * (and PostgREST's RLS-shaped refusals) mean the viewer may not record here,
 * which is a permission conversation, not a retry.
 */
export function firstUseErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') {
    return 'A first use is already recorded for this solution. Reload to see it.';
  }
  if (code === '42501' || code === 'PGRST301') {
    return 'You do not have permission to record the first use of this solution.';
  }
  const message = (error as Error | null)?.message;
  return message ? `Could not record it: ${message}` : 'Could not record it.';
}
