'use client';

/**
 * React Query hooks for the payroll organisation — WHO PAYS each staff member.
 *
 * Substrate: 20260731071358_staff_working_institution_hr_payroll.sql
 *            20260731090000_hr_staff_without_payer_rpc.sql
 *
 * Reads go straight to the browser client rather than through an API route:
 * hr_staff_payroll is gated by RLS on hr.payroll.institution.view, so the
 * database is already the enforcement point and a route would only re-wrap it.
 *
 * The queue and the assignment list share these query keys so recording a payer
 * refreshes BOTH — a person leaves the queue at the same moment they gain an
 * assignment, and two independent caches would show the row in both places
 * until a reload.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  StaffPayrollService,
  type PayrollOrganization,
  type StaffAwaitingPayer,
} from '@/lib/services/hr/payroll/staff-payroll-service';

export const STAFF_PAYROLL_KEYS = {
  awaitingPayer: ['hr', 'staff-payroll', 'awaiting-payer'] as const,
  organizations: ['hr', 'staff-payroll', 'organizations'] as const,
  payer: (staffId: string) => ['hr', 'staff-payroll', 'payer', staffId] as const,
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
      queryClient.invalidateQueries({
        queryKey: STAFF_PAYROLL_KEYS.payer(variables.staffId),
      });
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
      queryClient.invalidateQueries({
        queryKey: STAFF_PAYROLL_KEYS.payer(variables.staffId),
      });
    },
  });
}
