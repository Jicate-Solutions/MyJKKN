'use client';

/**
 * HR Payroll Periods Hooks (T4.3 PR 2)
 *
 * Spec: specs/t4-payroll-design-lock-2026-05-15.md
 * Service: lib/services/hr/payroll/periods-service.ts
 *
 * Pattern: combines @tanstack/react-query with direct Supabase browser client
 * via `createClientSupabaseClient`. Service methods take the SupabaseClient as
 * first argument so the hook layer stays thin (no API route hop required for
 * Phase-1 substrate; admin UI in a later sprint may introduce API routes).
 *
 * Mutations invalidate ['hr-payroll-periods'] (list cache) AND the per-period
 * detail cache on success.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { PayrollPeriodsService } from '@/lib/services/hr/payroll/periods-service';
import type {
  HRPayrollPeriod,
  HRPayrollPeriodInsert,
  PayrollPeriodFilters,
  PayrollPeriodListResponse,
} from '@/types/hr-payroll';

// =====================================================================================
// Queries
// =====================================================================================

/**
 * Paginated list of payroll periods. Pass `filters` to constrain by
 * institution / engine_type / period / status / backdated flag.
 *
 * PR 3 amendment (2026-05-19): removed `enabled: !!hr_organization_id` gate
 * so super-admin / Director list pages can render "all institutions" scope
 * (per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md Q7). RLS
 * still scopes server-side — Director sees all 11 orgs they have access to,
 * HR Officer sees only their own org. Caller can pass `enabled: false` via
 * the React Query layer if they need to defer a fetch.
 */
export function usePayrollPeriods(
  filters: PayrollPeriodFilters = {},
  options: { enabled?: boolean } = {},
) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<PayrollPeriodListResponse>({
    queryKey: ['hr-payroll-periods', filters],
    queryFn: () => PayrollPeriodsService.listPeriods(supabase, filters),
    enabled: options.enabled ?? true,
    staleTime: 30 * 1000, // 30s — period rows change on every stage transition
  });
}

// =====================================================================================
// Mutations
// =====================================================================================

/**
 * Create a new period row in 'draft' state. Stage transitions happen via the
 * RPC mutations below (preparePeriod, advancePeriod, ...).
 */
export function useCreatePayrollPeriod() {
  const qc = useQueryClient();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useMutation<HRPayrollPeriod, Error, HRPayrollPeriodInsert>({
    mutationFn: (payload) => PayrollPeriodsService.createPeriod(supabase, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-payroll-periods'] });
      qc.setQueryData(['hr-payroll-period', data.id], data);
    },
  });
}

/**
 * Decision #9 stage 1: HR Officer flips draft → prepared.
 * Server-side snapshots pay_matrix + deduction_rates + working_days.
 */
export function usePreparePayrollPeriod() {
  const qc = useQueryClient();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useMutation<
    HRPayrollPeriod,
    Error,
    { periodId: string; comment?: string }
  >({
    mutationFn: ({ periodId, comment }) =>
      PayrollPeriodsService.preparePeriod(supabase, periodId, comment),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-payroll-periods'] });
      qc.invalidateQueries({ queryKey: ['hr-payroll-approvals', data.id] });
      qc.setQueryData(['hr-payroll-period', data.id], data);
    },
  });
}

/**
 * Generic stage advance: prepared → cao_reviewed → accounts_verified
 *                       → chairperson_approved → distributed → locked.
 *
 * Caller doesn't pick the target — server derives it from current status.
 * The role guard on the RPC will throw 42501 if the caller doesn't own the
 * target-stage role (or Director/admin).
 */
export function useAdvancePayrollPeriod() {
  const qc = useQueryClient();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useMutation<
    HRPayrollPeriod,
    Error,
    { periodId: string; comment?: string }
  >({
    mutationFn: ({ periodId, comment }) =>
      PayrollPeriodsService.advancePeriod(supabase, periodId, comment),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-payroll-periods'] });
      qc.invalidateQueries({ queryKey: ['hr-payroll-approvals', data.id] });
      qc.setQueryData(['hr-payroll-period', data.id], data);
    },
  });
}

/**
 * Drop the period one stage back. Comment REQUIRED.
 */
export function useRejectPayrollPeriod() {
  const qc = useQueryClient();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useMutation<
    HRPayrollPeriod,
    Error,
    { periodId: string; comment: string }
  >({
    mutationFn: ({ periodId, comment }) =>
      PayrollPeriodsService.rejectPeriod(supabase, periodId, comment),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-payroll-periods'] });
      qc.invalidateQueries({ queryKey: ['hr-payroll-approvals', data.id] });
      qc.setQueryData(['hr-payroll-period', data.id], data);
    },
  });
}

/**
 * Decision #20 Director-only retroactive backdate. Reason REQUIRED.
 * Does NOT change status — only sets is_backdated=true + audit row.
 */
export function useBackdatePayrollPeriod() {
  const qc = useQueryClient();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useMutation<
    HRPayrollPeriod,
    Error,
    { periodId: string; reason: string }
  >({
    mutationFn: ({ periodId, reason }) =>
      PayrollPeriodsService.backdatePeriod(supabase, periodId, reason),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-payroll-periods'] });
      qc.invalidateQueries({ queryKey: ['hr-payroll-approvals', data.id] });
      qc.setQueryData(['hr-payroll-period', data.id], data);
    },
  });
}
