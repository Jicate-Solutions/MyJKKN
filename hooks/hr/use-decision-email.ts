'use client';

/**
 * What happened to the applicant's approved / rejected email for one decided
 * request (hr_decision_emails, 2026-09-11). Read through the caller's own RLS:
 * whoever can see the request can see its email.
 *
 * Polls every 5 s while the email is still queued, so a sheet opened right
 * after a decision turns from "queued" to "sent" without a reload.
 */

import { useQuery } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { HrDecisionEmail } from '@/types/hr-decision-email';

export type DecisionEmailTarget =
  | { leaveApplicationId: string; compOffCreditId?: never }
  | { compOffCreditId: string; leaveApplicationId?: never };

export function useDecisionEmail(target: DecisionEmailTarget | null) {
  const supabase = createClientSupabaseClient();
  const column = target?.leaveApplicationId ? 'leave_application_id' : 'comp_off_credit_id';
  const id = target?.leaveApplicationId ?? target?.compOffCreditId ?? null;

  return useQuery({
    queryKey: ['hr-decision-email', column, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<HrDecisionEmail | null> => {
      const { data, error } = await supabase
        .from('hr_decision_emails')
        .select(
          'id, leave_application_id, comp_off_credit_id, decision, to_email, status, attempts, next_attempt_at, last_error, created_at, sent_at'
        )
        .eq(column, id as string)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as HrDecisionEmail | null) ?? null;
    },
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 5000 : false),
  });
}
