'use client';

/**
 * React Query hooks for the TDS bands.
 *
 * Substrate: 20260902100000_hr_tds_slabs_and_allowance.sql
 *
 * Reads go straight to the browser client, like the salary hooks beside them:
 * hr_tds_slabs is RLS-gated, so Postgres is already the enforcement point and a
 * route handler would only re-wrap it.
 *
 * EVERY MUTATION ALSO INVALIDATES THE SALARY DIRECTORY. TDS is derived, never
 * stored on hr_staff_salaries — so changing a band changes the figure shown
 * against all 433 people without touching a single salary row. Nothing in this
 * app self-refreshes (staleTime is 5 minutes and there is no refetch on focus),
 * so an edit here that did not invalidate the directory would leave the salaries
 * screen quoting the old rate until someone reloaded it.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  TdsSlabService,
  type HrTdsSlab,
  type TdsSlabInput,
} from '@/lib/services/hr/payroll/tds-slab-service';
import { STAFF_SALARY_KEYS } from './use-staff-salaries';

export const TDS_SLAB_KEYS = {
  all: ['hr', 'tds-slabs'] as const,
  list: ['hr', 'tds-slabs', 'list'] as const,
};

/**
 * Every band, lowest floor first.
 *
 * A handful of rows, so it is fetched whole and never paginated. Returns [] when
 * TDS is switched off, which is a real answer and renders as "no TDS is being
 * deducted" rather than as an error.
 */
export function useTdsSlabs() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<HrTdsSlab[]>({
    queryKey: TDS_SLAB_KEYS.list,
    queryFn: () => TdsSlabService.list(supabase),
  });
}

/** Shared by all three mutations — see the file header on why the directory goes too. */
function useSlabInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: TDS_SLAB_KEYS.all });
    queryClient.invalidateQueries({ queryKey: STAFF_SALARY_KEYS.directory });
  };
}

/**
 * Accepts one band or several, because a valid SET can contain no individually
 * valid row: the first capped band on an empty table is refused alone and
 * accepted alongside the open-ended band above it. One call is one transaction
 * is one validation — see TdsSlabService.create.
 */
export function useCreateTdsSlab() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const invalidate = useSlabInvalidation();

  return useMutation({
    mutationFn: (input: TdsSlabInput | TdsSlabInput[]) =>
      TdsSlabService.create(supabase, input),
    onSuccess: invalidate,
  });
}

export function useUpdateTdsSlab() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const invalidate = useSlabInvalidation();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TdsSlabInput }) =>
      TdsSlabService.update(supabase, id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteTdsSlab() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const invalidate = useSlabInvalidation();

  return useMutation({
    mutationFn: (id: string) => TdsSlabService.remove(supabase, id),
    onSuccess: invalidate,
  });
}
