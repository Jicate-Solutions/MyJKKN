'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HRLeaveTypeService } from '@/lib/services/hr/leave-type-service';
import type {
  HRLeaveTypeFilters,
  HRLeaveTypeInsert,
  HRLeaveTypeUpdate,
} from '@/types/hr-leave-types';

const KEY = 'hr-leave-types';
const ANALYTICS_KEY = 'hr-leave-balance-analytics';
const CAN_APPROVE_KEY = 'hr-can-approve-leave';

/**
 * Whether the Approvals tab should render. Mirrors the hla_update RLS policy
 * server-side rather than checking a permission key on the client.
 */
export function useCanApproveLeave() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [CAN_APPROVE_KEY],
    queryFn: () => HRLeaveTypeService.canApproveLeave(supabase),
    // Capability is role-derived and does not change mid-session.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Institution-wise leave provisioning analytics.
 *
 * `academicYearName` null = "the year containing today", resolved per
 * institution inside the RPC.
 */
export function useLeaveBalanceAnalytics(academicYearName: string | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [ANALYTICS_KEY, academicYearName],
    queryFn: () =>
      HRLeaveTypeService.getBalanceAnalytics(supabase, academicYearName),
  });
}

export function useHRLeaveTypes(filters: HRLeaveTypeFilters = {}) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => HRLeaveTypeService.list(supabase, filters),
  });
}

export function useCreateHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (payload: HRLeaveTypeInsert) =>
      HRLeaveTypeService.create(supabase, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HRLeaveTypeUpdate }) =>
      HRLeaveTypeService.update(supabase, id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => HRLeaveTypeService.remove(supabase, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useGenerateBalances() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({
      hrOrgId,
      academicYearId,
      dryRun,
    }: {
      hrOrgId: string;
      academicYearId: string;
      dryRun: boolean;
    }) =>
      HRLeaveTypeService.generateBalances(supabase, hrOrgId, academicYearId, dryRun),
    onSuccess: (_data, vars) => {
      if (!vars.dryRun) {
        qc.invalidateQueries({ queryKey: ['hr-leave-balance'] });
        // A real run changes coverage — refresh the analytics tab too,
        // otherwise it keeps showing pre-generation numbers.
        qc.invalidateQueries({ queryKey: [ANALYTICS_KEY] });
      }
    },
  });
}
