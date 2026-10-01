'use client';

/**
 * The bank and paying-trust change list, for the Director list only
 * (ruling 1 Oct 2026). Both answers come from the database: whether the
 * caller is on the Director list (fn_is_the_director, fails closed) and the
 * list itself (fn_hr_pay_destination_changes, which refuses anyone else).
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { PayDestinationChange } from '@/lib/hr/payroll/pay-destination-changes';

export function useIsTheDirector() {
  return useQuery({
    queryKey: ['auth', 'is-the-director'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (createClientSupabaseClient() as any).rpc('fn_is_the_director');
      return !error && data === true;
    },
  });
}

export function usePayDestinationChanges(days: number, enabled: boolean) {
  return useQuery({
    queryKey: ['hr', 'pay-destination-changes', days],
    enabled,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await (createClientSupabaseClient() as any).rpc('fn_hr_pay_destination_changes', {
        p_since: since,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as PayDestinationChange[];
    },
  });
}
