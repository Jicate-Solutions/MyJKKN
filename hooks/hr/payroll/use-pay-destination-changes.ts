'use client';

/**
 * The bank and paying-trust change list, for the Director list only
 * (ruling 1 Oct 2026). Both answers come from the database: whether the
 * caller is on the Director list (fn_is_the_director, fails closed) and the
 * list itself (fn_hr_pay_destination_changes, which refuses anyone else).
 * Both cache keys carry the signed-in profile id, so a second account opened
 * in the same tab never sees the first account's cached answer.
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { PayDestinationChange } from '@/lib/hr/payroll/pay-destination-changes';
import { logger } from '@/lib/utils/enhanced-logger';

export function useIsTheDirector() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  return useQuery({
    queryKey: ['auth', 'is-the-director', userId ?? 'anonymous'],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (createClientSupabaseClient() as any).rpc('fn_is_the_director');
      if (error) {
        // Fails closed: the panel stays hidden. Logged so a broken check is
        // not mistaken for "not on the Director list".
        logger.warn('hr/payroll/pay-destination', 'fn_is_the_director check failed; panel hidden', error);
        return false;
      }
      return data === true;
    },
  });
}

export function usePayDestinationChanges(days: number, enabled: boolean) {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  return useQuery({
    queryKey: ['hr', 'pay-destination-changes', userId ?? 'anonymous', days],
    enabled: enabled && !!userId,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await (createClientSupabaseClient() as any).rpc('fn_hr_pay_destination_changes', {
        p_since: since,
      });
      if (error) {
        logger.warn('hr/payroll/pay-destination', 'change list could not be read', error);
        throw new Error(error.message);
      }
      return (data ?? []) as PayDestinationChange[];
    },
  });
}
