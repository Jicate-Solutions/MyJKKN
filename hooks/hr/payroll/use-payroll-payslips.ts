'use client';

/**
 * HR Payroll Payslips Hook (B3 — payslip table + export)
 *
 * Queries hr_payslips for a given period_id, joined to staff for display name.
 * Returns non-superseded slips only (active slip chain).
 *
 * Pattern: matches use-payroll-period.ts (direct Supabase client, no API hop).
 * Cache key `['hr-payroll-payslips', periodId]` is invalidated by the
 * generate-payslips mutation.
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { HRPayslip } from '@/types/hr-payroll';

// =====================================================================================
// Types
// =====================================================================================

/** Payslip row with joined staff info for table display. */
export interface PayslipWithStaff extends HRPayslip {
  staff: {
    id: string;
    first_name: string;
    last_name: string;
    designation: string | null;
  } | null;
}

// =====================================================================================
// Query — list payslips for a period
// =====================================================================================

export function usePayrollPayslips(periodId: string | undefined) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<PayslipWithStaff[]>({
    queryKey: ['hr-payroll-payslips', periodId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_payslips')
        .select(
          `
          *,
          staff:staff!inner(id, first_name, last_name, designation)
          `,
        )
        .eq('period_id', periodId as string)
        .is('superseded_by', null)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as PayslipWithStaff[];
    },
    enabled: !!periodId,
    staleTime: 60 * 1000, // 1 min — payslips change less often than periods
  });
}

// =====================================================================================
// Mutation — generate payslips (T4.4 stub — calls API route)
// =====================================================================================

/**
 * Triggers payslip generation via the API route (T4.4 live).
 * Uses API route because generation is a multi-step server operation.
 */
export function useGeneratePayslips() {
  const qc = useQueryClient();

  return useMutation<
    { message: string },
    Error,
    { periodId: string }
  >({
    mutationFn: async ({ periodId }) => {
      const res = await fetch(`/api/hr/payroll/periods/${periodId}/payslips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `Generation failed: ${res.status}`);
      }
      return json;
    },
    onSuccess: (_data, { periodId }) => {
      qc.invalidateQueries({ queryKey: ['hr-payroll-payslips', periodId] });
      qc.invalidateQueries({ queryKey: ['hr-payroll-period', periodId] });
    },
  });
}

// =====================================================================================
// Mutation — override individual payslip deductions (T4.4)
// =====================================================================================

export interface OverrideDeductionsInput {
  periodId: string;
  slipId: string;
  pf?: number;
  esi?: number;
  tds?: number;
  pt?: number;
  reason: string;
}

export function useOverridePayslipDeductions() {
  const qc = useQueryClient();

  return useMutation<
    { data: { newSlipId: string }; message: string },
    Error,
    OverrideDeductionsInput
  >({
    mutationFn: async ({ periodId, slipId, ...overrides }) => {
      const res = await fetch(
        `/api/hr/payroll/periods/${periodId}/payslips/${slipId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(overrides),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Override failed: ${res.status}`);
      return json;
    },
    onSuccess: (_data, { periodId }) => {
      qc.invalidateQueries({ queryKey: ['hr-payroll-payslips', periodId] });
      qc.invalidateQueries({ queryKey: ['hr-payroll-period', periodId] });
    },
  });
}
