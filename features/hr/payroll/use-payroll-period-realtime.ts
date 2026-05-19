'use client';

/**
 * usePayrollPeriodRealtime — subscribe to UPDATEs on a single payroll period
 * and invalidate caches when other actors transition stages.
 *
 * Per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md E7:
 *   - Channel: 'hr_payroll_periods:id=eq.{id}'
 *   - On postgres_changes UPDATE event, invalidate:
 *     - ['hr-payroll-period', periodId]   — detail
 *     - ['hr-payroll-periods']            — list
 *     - ['hr-payroll-approvals', periodId] — audit timeline (advance/reject
 *       writes an audit row alongside the period update)
 *   - Cleans up subscription on unmount or periodId change.
 */

import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';

export function usePayrollPeriodRealtime(periodId: string | undefined) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const qc = useQueryClient();

  useEffect(() => {
    if (!periodId) return;

    const channel = supabase
      .channel(`hr_payroll_periods:${periodId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'hr_payroll_periods',
          filter: `id=eq.${periodId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['hr-payroll-period', periodId] });
          qc.invalidateQueries({ queryKey: ['hr-payroll-periods'] });
          qc.invalidateQueries({ queryKey: ['hr-payroll-approvals', periodId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [periodId, supabase, qc]);
}
