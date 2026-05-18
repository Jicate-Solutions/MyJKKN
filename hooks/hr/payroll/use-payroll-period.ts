'use client';

/**
 * HR Payroll — single-period detail hook (T4.3 PR 2)
 *
 * Lazy-loaded by the period detail page. Cache key
 * `['hr-payroll-period', id]` is also written-through by the mutations in
 * use-payroll-periods.ts so the detail screen stays fresh after stage
 * transitions without a refetch round-trip.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { PayrollPeriodsService } from '@/lib/services/hr/payroll/periods-service';
import type { HRPayrollPeriod } from '@/types/hr-payroll';

export function usePayrollPeriod(periodId: string | undefined) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<HRPayrollPeriod | null>({
    queryKey: ['hr-payroll-period', periodId],
    queryFn: () => PayrollPeriodsService.getPeriod(supabase, periodId as string),
    enabled: !!periodId,
    staleTime: 30 * 1000,
  });
}
