'use client';

/**
 * HR Payroll Approvals (audit) hook (T4.3 PR 2)
 *
 * Read-only. Powers the timeline view on the period detail page.
 * Cache key `['hr-payroll-approvals', periodId]` is invalidated by every
 * stage-transition mutation in use-payroll-periods.ts.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { PayrollApprovalsService } from '@/lib/services/hr/payroll/approvals-service';
import type { HRPayrollPeriodApproval } from '@/types/hr-payroll';

export function usePayrollApprovals(periodId: string | undefined) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<HRPayrollPeriodApproval[]>({
    queryKey: ['hr-payroll-approvals', periodId],
    queryFn: () =>
      PayrollApprovalsService.listApprovalsForPeriod(supabase, periodId as string),
    enabled: !!periodId,
    staleTime: 30 * 1000,
  });
}
