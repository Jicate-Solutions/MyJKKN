'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { CompOffService } from '@/lib/services/hr/comp-off-service';
import type { LeaveDocument } from '@/types/hr';

const KEY = 'hr-comp-off-balance';

/**
 * Refresh the credit ledger after something SPENT or RELEASED a credit.
 *
 * The mutations in this file cover how a credit is EARNED. Spending happens in
 * the leave-application lifecycle instead: hr_trig_comp_off_consume flips a
 * credit to 'consumed' when an application reaches 'approved', and back to
 * 'approved' when that application later turns cancelled/rejected/withdrawn.
 * Those mutations live in use-leave.ts and refreshed nothing here, so the
 * comp-off card kept quoting the balance from before the decision.
 */
export function invalidateCompOffViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: [KEY] });
}

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
      documents: LeaveDocument[];
    }) => CompOffService.claimWorkedDay(supabase, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      // A claimant who is also an approver should see their new claim appear
      // in the approvals queue without a reload.
      qc.invalidateQueries({ queryKey: [CLAIMS_KEY] });
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

/** The claimant takes back their own pending claim. */
export function useWithdrawCompOffClaim() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (creditId: string) => CompOffService.withdrawClaim(supabase, creditId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: [CLAIMS_KEY] });
    },
  });
}

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
