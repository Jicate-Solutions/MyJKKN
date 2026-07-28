'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { CompOffService } from '@/lib/services/hr/comp-off-service';

const KEY = 'hr-comp-off-balance';

export function useCompOffBalance(employeeId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, employeeId ?? 'me'],
    queryFn: () => CompOffService.getBalance(supabase, employeeId),
    enabled: employeeId !== '',
  });
}

export function useClaimWorkedDay() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (input: {
      hr_organization_id: string;
      employee_id: string;
      worked_date: string;
      notes?: string | null;
    }) => CompOffService.claimWorkedDay(supabase, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export function useDecideCompOffClaim() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({
      creditId,
      decision,
      rejectionReason,
    }: {
      creditId: string;
      decision: 'approved' | 'rejected';
      rejectionReason?: string;
    }) => CompOffService.decideClaim(supabase, creditId, decision, rejectionReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: [CLAIMS_KEY] });
      // Approving a claim changes what can be booked, so the applications
      // list must refetch too.
      qc.invalidateQueries({ queryKey: ['hr-leave-applications'] });
    },
  });
}

const CLAIMS_KEY = 'hr-comp-off-pending-claims';

/**
 * Claims awaiting decision. Scoped by RLS to the approver's organizations,
 * so no org argument is threaded through the client.
 */
export function usePendingCompOffClaims(enabled = true) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [CLAIMS_KEY],
    queryFn: () => CompOffService.listPendingClaims(supabase),
    enabled,
  });
}
