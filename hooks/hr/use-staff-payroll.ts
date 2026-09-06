'use client';

/**
 * React Query hooks for the payroll organisation — WHO PAYS each staff member.
 *
 * Substrate: 20260731071358_staff_working_institution_hr_payroll.sql
 *            20260731090000_hr_staff_without_payer_rpc.sql
 *            20260804090000_hr_staff_payroll_directory_rpc.sql
 *
 * Reads go straight to the browser client rather than through an API route:
 * hr_staff_payroll is gated by RLS on hr.payroll.institution.view, so the
 * database is already the enforcement point and a route would only re-wrap it.
 *
 * Every mutation invalidates the queue AND the directory. The two RPCs read the
 * same underlying rows through different lenses, so refreshing one and not the
 * other would show the same person as both assigned and outstanding until a
 * reload.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  StaffPayrollService,
  type PayrollOrganization,
  type StaffAwaitingPayer,
  type StaffPayerRow,
} from '@/lib/services/hr/payroll/staff-payroll-service';

export const STAFF_PAYROLL_KEYS = {
  awaitingPayer: ['hr', 'staff-payroll', 'awaiting-payer'] as const,
  organizations: ['hr', 'staff-payroll', 'organizations'] as const,
  payer: (staffId: string) => ['hr', 'staff-payroll', 'payer', staffId] as const,
  directory: ['hr', 'staff-payroll', 'directory'] as const,
};

/**
 * Active staff nobody has recorded a payer for.
 *
 * Expected to be non-empty by design — the shared campus-services team works at
 * JKKN Main Office, which runs no payroll. The underlying RPC RAISES rather
 * than returning [] when the caller lacks the permission key, so an empty list
 * here genuinely means "nothing outstanding".
 */
export function useStaffAwaitingPayer() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<StaffAwaitingPayer[]>({
    queryKey: STAFF_PAYROLL_KEYS.awaitingPayer,
    queryFn: () => StaffPayrollService.listWithoutPayer(supabase),
    staleTime: 60 * 1000,
  });
}

/** Organisations that actually run a payroll, for the picker. */
export function usePayrollOrganizations() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<PayrollOrganization[]>({
    queryKey: STAFF_PAYROLL_KEYS.organizations,
    queryFn: () => StaffPayrollService.listPayrollOrganizations(supabase),
    // Fourteen rows that change when an institution is added. Effectively static.
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Every active staff member with their payer, assigned or not — what the
 * Payroll Organisation screen lists.
 *
 * Also the single source for the coverage cards: recorded and awaiting are
 * counted from these rows rather than fetched separately, so the cards and the
 * table can never disagree about how many people are outstanding.
 */
export function useStaffPayerDirectory() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<StaffPayerRow[]>({
    queryKey: STAFF_PAYROLL_KEYS.directory,
    queryFn: () => StaffPayrollService.listDirectory(supabase),
    staleTime: 60 * 1000,
  });
}

export function useSetStaffPayer() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      staffId,
      hrOrganizationId,
      notes,
    }: {
      staffId: string;
      hrOrganizationId: string;
      notes?: string | null;
    }) => StaffPayrollService.setPayer(supabase, staffId, hrOrganizationId, notes),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: STAFF_PAYROLL_KEYS.awaitingPayer });
      queryClient.invalidateQueries({ queryKey: STAFF_PAYROLL_KEYS.directory });
      queryClient.invalidateQueries({
        queryKey: STAFF_PAYROLL_KEYS.payer(variables.staffId),
      });
    },
  });
}

/**
 * Record one payer for every selected person in a single statement.
 *
 * Invalidates the same keys as the single-row mutation so the queue, the
 * coverage cards and any open per-person query all move together — a partial
 * refresh here would leave the cards claiming work that the table shows as
 * already done.
 */
export function useSetStaffPayersBulk() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      staffIds,
      hrOrganizationId,
    }: {
      staffIds: string[];
      hrOrganizationId: string;
    }) => StaffPayrollService.setPayersBulk(supabase, staffIds, hrOrganizationId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: STAFF_PAYROLL_KEYS.awaitingPayer });
      queryClient.invalidateQueries({ queryKey: STAFF_PAYROLL_KEYS.directory });
      for (const staffId of variables.staffIds) {
        queryClient.invalidateQueries({
          queryKey: STAFF_PAYROLL_KEYS.payer(staffId),
        });
      }
    },
  });
}

export function useClearStaffPayer() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ staffId }: { staffId: string }) =>
      StaffPayrollService.clearPayer(supabase, staffId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: STAFF_PAYROLL_KEYS.awaitingPayer });
      queryClient.invalidateQueries({ queryKey: STAFF_PAYROLL_KEYS.directory });
      queryClient.invalidateQueries({
        queryKey: STAFF_PAYROLL_KEYS.payer(variables.staffId),
      });
    },
  });
}
