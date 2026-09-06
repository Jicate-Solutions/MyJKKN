'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HRLeaveTypeService } from '@/lib/services/hr/leave-type-service';
import type {
  HRLeaveTypeFilters,
  HRLeaveTypeInsert,
  HRLeaveTypeUpdate,
} from '@/types/hr-leave-types';
import type { HRBalanceAdjustPayload } from '@/types/hr-leave-staff-balances';

const KEY = 'hr-leave-types';
const ANALYTICS_KEY = 'hr-leave-balance-analytics';
const STAFF_BALANCES_KEY = 'hr-leave-staff-balances';
const CAN_APPROVE_KEY = 'hr-can-approve-leave';
const STO_USAGE_KEY = 'hr-sto-usage';
const LEAVE_PERIOD_USAGE_KEY = 'hr-leave-period-usage';

/**
 * Refresh the per-period allowance figures the apply drawers quote.
 *
 * BOTH RPCs behind these keys already count 'pending' and 'escalated' beside
 * 'approved' — an undecided request is held against the allowance exactly as
 * hr_trig_sto_enforce_limits and hr_leave_period_usage hold it, so the server
 * has never been wrong here. The number on screen was, because nothing
 * invalidated these keys: with staleTime 5 min and focus refetch off, the
 * drawer re-served the answer it cached BEFORE the request existed. Applying
 * did not reduce the remaining hours, and rejecting, cancelling or
 * withdrawing did not give them back until the entry aged out.
 *
 * Every mutation that moves an application into or out of
 * ('pending','approved','escalated') must call this.
 */
export function invalidateAllowanceViews(qc: QueryClient) {
  for (const key of [STO_USAGE_KEY, LEAVE_PERIOD_USAGE_KEY]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

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

/**
 * One institution's staff-wise balances for the selected year.
 *
 * Disabled until an institution is chosen — the RPC requires an org id, and
 * firing it with null would surface a "p_hr_org_id is required" error as the
 * tab's empty state.
 */
export function useStaffLeaveBalances(
  hrOrgId: string | null,
  hrAcademicYearId: string | null
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [STAFF_BALANCES_KEY, hrOrgId, hrAcademicYearId],
    queryFn: () =>
      HRLeaveTypeService.getStaffBalances(supabase, hrOrgId as string, hrAcademicYearId),
    enabled: !!hrOrgId,
  });
}

/**
 * Correct one staff member's balance.
 *
 * Invalidates the analytics key as well as the staff key: an adjustment moves
 * the used/entitled totals and the covered-staff count that the Analytics tab
 * renders, so leaving it stale would show two different numbers for the same
 * year on two tabs of one page.
 */
export function useAdjustLeaveBalance() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (payload: HRBalanceAdjustPayload) =>
      HRLeaveTypeService.adjustBalance(supabase, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [STAFF_BALANCES_KEY] });
      qc.invalidateQueries({ queryKey: [ANALYTICS_KEY] });
    },
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

/** Archive (soft): the type stops being offered. Reversible with useRestoreHRLeaveType. */
export function useDeleteHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => HRLeaveTypeService.remove(supabase, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/** Un-archive. */
export function useRestoreHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => HRLeaveTypeService.restore(supabase, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/**
 * Hard delete, via the guarded RPC.
 *
 * Also invalidates the balance keys: a successful delete removes the type's
 * placeholder ledger rows, which the analytics tab and the staff-balances tab
 * both count. Leaving them stale would show a leave type that no longer exists
 * on a page one click away.
 */
export function useHardDeleteHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ id, dryRun }: { id: string; dryRun: boolean }) =>
      HRLeaveTypeService.hardDelete(supabase, id, dryRun),
    onSuccess: (result, variables) => {
      // GUARD ON WHAT WAS REQUESTED, NOT ON WHAT CAME BACK.
      //
      // This read `result?.dry_run`, which is only present in the RPC's SUCCESS
      // payloads. Every refusal — in_use, still_active, permission_denied, and
      // the EXCEPTION catch — returns {ok:false, error:…} with NO dry_run key,
      // so the check was undefined, the guard fell through, and merely OPENING
      // the confirmation dialog on a leave type that cannot be deleted
      // invalidated the table. useDataTableRefreshOnInvalidate turns that into a
      // refetch, which reads on screen as the page reloading and takes the open
      // dialog with it — reported as "it refreshes and I cannot delete it".
      //
      // It misfired only on types that ARE refused, which is exactly when
      // somebody is trying hardest to delete one.
      //
      // `variables.dryRun` cannot lie: a dry run writes nothing whatever it
      // returns. `!result.ok` covers the other half — a refused commit wrote
      // nothing either, so there is nothing to invalidate. Same shape as
      // useGenerateBalances below.
      if (variables.dryRun || !result?.ok) return;
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: [ANALYTICS_KEY] });
      qc.invalidateQueries({ queryKey: [STAFF_BALANCES_KEY] });
    },
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
    queryKey: [STO_USAGE_KEY, employeeId, leaveTypeId, hrAcademicYearId, onDate ?? null],
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
    queryKey: [LEAVE_PERIOD_USAGE_KEY, employeeId, leaveTypeId, hrAcademicYearId, onDate ?? null],
    queryFn: () =>
      HRLeaveTypeService.getLeavePeriodUsage(
        supabase, employeeId!, leaveTypeId!, hrAcademicYearId, onDate
      ),
    enabled: !!employeeId && !!leaveTypeId,
  });
}
