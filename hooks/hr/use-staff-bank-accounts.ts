'use client';

/**
 * React Query hooks for employee bank accounts.
 *
 * Substrate: 20260821240000_hr_staff_bank_accounts.sql
 *
 * Reads go straight to the browser client: hr_staff_bank_accounts is gated by
 * RLS on hr.payroll.bank.view and the directory RPC checks the same key, so
 * Postgres is already the enforcement point and an API route would only re-wrap
 * it — the same reasoning use-staff-payroll.ts records for the payer directory.
 *
 * Both mutations invalidate the directory AND that person's history: the two
 * read the same supersede chain through different lenses, and refreshing one
 * without the other shows the old account beside the new one until a reload.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  StaffBankAccountService,
  type SetBankAccountInput,
  type StaffBankAccountHistoryRow,
  type StaffBankDirectoryRow,
} from '@/lib/services/hr/payroll/staff-bank-account-service';

export const STAFF_BANK_KEYS = {
  all: ['hr', 'staff-bank-accounts'] as const,
  directory: ['hr', 'staff-bank-accounts', 'directory'] as const,
  history: (staffUuid: string) =>
    ['hr', 'staff-bank-accounts', 'history', staffUuid] as const,
};

/** The whole roster with accounts attached where they exist. */
export function useStaffBankDirectory() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<StaffBankDirectoryRow[]>({
    queryKey: STAFF_BANK_KEYS.directory,
    queryFn: () => StaffBankAccountService.listDirectory(supabase),
    staleTime: 60 * 1000,
  });
}

/** One person's supersede chain — the audit trail for a changed account. */
export function useStaffBankHistory(staffUuid: string | null) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<StaffBankAccountHistoryRow[]>({
    queryKey: STAFF_BANK_KEYS.history(staffUuid ?? ''),
    queryFn: () => StaffBankAccountService.listHistory(supabase, staffUuid as string),
    enabled: Boolean(staffUuid),
    staleTime: 60 * 1000,
  });
}

/** Record or replace one person's account. */
export function useSetStaffBankAccount() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SetBankAccountInput) =>
      StaffBankAccountService.setAccount(supabase, input),
    onSuccess: (_id, input) => {
      queryClient.invalidateQueries({ queryKey: STAFF_BANK_KEYS.directory });
      queryClient.invalidateQueries({ queryKey: STAFF_BANK_KEYS.history(input.staffId) });
    },
  });
}

/**
 * Tick or untick "checked against a passbook".
 *
 * `staffId` is carried alongside the account id purely so the right history
 * query can be invalidated — the RPC itself only needs the account.
 */
export function useVerifyStaffBankAccount() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { accountId: string; staffId: string; verified: boolean }) =>
      StaffBankAccountService.setVerified(supabase, input.accountId, input.verified),
    onSuccess: (_v, input) => {
      queryClient.invalidateQueries({ queryKey: STAFF_BANK_KEYS.directory });
      queryClient.invalidateQueries({ queryKey: STAFF_BANK_KEYS.history(input.staffId) });
    },
  });
}
