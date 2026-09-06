/**
 * HR Payroll Approvals Service (T4.3 PR 2)
 *
 * Spec: specs/t4-payroll-design-lock-2026-05-15.md (Decisions #9, #17, #20)
 * Table: hr_payroll_period_approvals (substrate migration 20260628000000)
 *
 * Append-only audit table. The 4 stage-transition RPCs in periods-service
 * insert into this table; this service is read-only for the UI surface
 * (timeline view on the period detail page).
 *
 * Static class — SupabaseClient passed as first argument.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HRPayrollPeriodApproval } from '@/types/hr-payroll';

// =====================================================================================
// Payroll Approvals Service (read-only)
// =====================================================================================

export class PayrollApprovalsService {
  /**
   * List all approval audit rows for a given period, newest first.
   * RLS: caller must be allowed to read the parent period (enforced by the
   * hr_payroll_period_approvals_select policy joining to hr_payroll_periods).
   */
  static async listApprovalsForPeriod(
    supabase: SupabaseClient,
    periodId: string,
  ): Promise<HRPayrollPeriodApproval[]> {
    const { data, error } = await supabase
      .from('hr_payroll_period_approvals')
      .select('*')
      .eq('period_id', periodId)
      .order('acted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as HRPayrollPeriodApproval[];
  }
}
