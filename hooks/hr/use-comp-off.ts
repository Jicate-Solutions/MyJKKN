'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { CompOffService } from '@/lib/services/hr/comp-off-service';
import type { LeaveDocument } from '@/types/hr';
import type { CompOffWorkLocation } from '@/types/hr-comp-off';

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
      work_location: CompOffWorkLocation | null;
      work_place?: string | null;
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
    onSuccess: (_data, { creditId }) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: [CLAIMS_KEY] });
      // Approving a claim changes what can be booked, so the applications
      // list must refetch too.
      qc.invalidateQueries({ queryKey: ['hr-leave-applications'] });
      // The decision queued the claimant's email in the database; ask the
      // server to send it now. Not awaited and never surfaced — the 5-minute
      // cron sends it anyway if this call is lost.
      void fetch(`/api/hr/comp-off/claims/${creditId}/decision-email`, { method: 'POST' }).catch(
        () => undefined
      );
    },
  });
}

/**
 * Take an APPROVED claim back. Same invalidations as a decision — a released
 * credit changes what can be booked — plus the decision-email ping, because the
 * revocation queues a 'revoked' row in hr_decision_emails by trigger.
 */
export function useRevokeCompOffClaim() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ creditId, reason }: { creditId: string; reason: string }) =>
      CompOffService.revokeClaim(supabase, creditId, reason),
    onSuccess: (_data, { creditId }) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: [CLAIMS_KEY] });
      qc.invalidateQueries({ queryKey: ['hr-leave-applications'] });
      void fetch(`/api/hr/comp-off/claims/${creditId}/decision-email`, { method: 'POST' }).catch(
        () => undefined
      );
    },
  });
}

/**
 * Why may this caller NOT revoke this approved claim? null = they may.
 *
 * Asked of Postgres, not answered here: the one rule a client cannot see is that
 * a credit already SPENT by a booked leave must not be taken back on its own, and
 * the message has to name the leave to revoke first.
 */
export function useCompOffRevokeBlockReason(creditId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-comp-off-revoke-block-reason', creditId ?? null],
    enabled: Boolean(creditId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fn_hr_comp_off_revoke_block_reason', {
        p_credit_id: creditId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    staleTime: 0,
  });
}

const CLAIMS_KEY = 'hr-comp-off-pending-claims';

/**
 * The punch check for a set of claims (see CompOffService.claimsBiometric).
 * Keyed on the sorted ids, so a decided claim leaving the queue refetches for
 * the rows that remain rather than serving a stale list.
 */
export function useCompOffClaimsBiometric(claimIds: string[]) {
  const supabase = createClientSupabaseClient();
  const ids = [...claimIds].sort();
  return useQuery({
    queryKey: ['hr-comp-off-claims-biometric', ids],
    queryFn: () => CompOffService.claimsBiometric(supabase, ids),
    enabled: ids.length > 0,
  });
}

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

/**
 * The approvals table: pending claims plus 12 months of decided history. Under
 * the CLAIMS_KEY prefix, so every mutation that already invalidates
 * [CLAIMS_KEY] (decide, claim) refreshes it too.
 */
export function useCompOffClaimsQueue(enabled = true) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [CLAIMS_KEY, 'queue'],
    queryFn: () => CompOffService.listClaimsForApproval(supabase),
    enabled,
  });
}
