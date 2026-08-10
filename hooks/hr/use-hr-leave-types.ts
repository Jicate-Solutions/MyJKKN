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
 * `hrAcademicYearId` null = "the year containing today". One id covers every
 * institution now that HR years are group-wide.
 */
export function useLeaveBalanceAnalytics(hrAcademicYearId: string | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [ANALYTICS_KEY, hrAcademicYearId],
    queryFn: () =>
      HRLeaveTypeService.getBalanceAnalytics(supabase, hrAcademicYearId),
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
      hrAcademicYearId,
      dryRun,
    }: {
      hrOrgId: string;
      hrAcademicYearId: string;
      dryRun: boolean;
    }) =>
      HRLeaveTypeService.generateBalances(supabase, hrOrgId, hrAcademicYearId, dryRun),
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

/**
 * Provision several institutions at once.
 *
 * `hrOrgIds` null = every organization the caller can access. Invalidates the
 * analytics query on a real run for the same reason the single-org mutation
 * does: coverage has changed, and the tab would otherwise keep showing
 * pre-generation numbers.
 */
export function useGenerateBalancesBulk() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({
      hrAcademicYearId,
      hrOrgIds,
      dryRun,
    }: {
      hrAcademicYearId: string;
      hrOrgIds: string[] | null;
      dryRun: boolean;
    }) =>
      HRLeaveTypeService.generateBalancesBulk(supabase, hrAcademicYearId, hrOrgIds, dryRun),
    onSuccess: (_data, vars) => {
      if (!vars.dryRun) {
        qc.invalidateQueries({ queryKey: ['hr-leave-balance'] });
        qc.invalidateQueries({ queryKey: [ANALYTICS_KEY] });
      }
    },
  });
}

/**
 * Short Time Off usage for one person and type in the current period.
 * Disabled until both ids are known, so the drawer does not fire on open.
 */
export function useStoUsage(
  employeeId: string | undefined,
  leaveTypeId: string | undefined,
  hrAcademicYearId: string | null,
  /** The request date. The period window is computed from it, not from today. */
  onDate?: string
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-sto-usage', employeeId, leaveTypeId, hrAcademicYearId, onDate ?? null],
    queryFn: () =>
      HRLeaveTypeService.getStoUsage(
        supabase, employeeId!, leaveTypeId!, hrAcademicYearId, onDate
      ),
    enabled: !!employeeId && !!leaveTypeId,
  });
}

/**
 * Day-based leave usage for one person and type in the current period — the
 * "2 a month" throttle. Disabled until both ids are known, so the drawer does
 * not fire on open.
 */
export function useLeavePeriodUsage(
  employeeId: string | undefined,
  leaveTypeId: string | undefined,
  hrAcademicYearId: string | null,
  /** The request date. The period window is computed from it, not from today. */
  onDate?: string
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-leave-period-usage', employeeId, leaveTypeId, hrAcademicYearId, onDate ?? null],
    queryFn: () =>
      HRLeaveTypeService.getLeavePeriodUsage(
        supabase, employeeId!, leaveTypeId!, hrAcademicYearId, onDate
      ),
    enabled: !!employeeId && !!leaveTypeId,
  });
}
