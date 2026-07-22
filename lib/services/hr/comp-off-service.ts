/**
 * Compensatory off credit ledger.
 *
 * Static class, SupabaseClient passed first — mirrors HRLeaveTypeService.
 * Supabase errors are plain objects, not Error instances, so every call
 * destructures { error } and throws it; try/catch alone does not surface RLS
 * denials or constraint violations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompOffBalance } from '@/types/hr-comp-off';

export class CompOffService {
  /**
   * Balance + credit rows. Pass no id for your own ledger; an explicit id is
   * honoured only for approvers, enforced inside the RPC rather than here.
   */
  static async getBalance(
    supabase: SupabaseClient,
    employeeId?: string
  ): Promise<CompOffBalance> {
    const { data, error } = await supabase.rpc('hr_comp_off_balance', {
      p_employee_id: employeeId ?? null,
    });
    if (error) throw error;
    return data as CompOffBalance;
  }

  /**
   * Claim a worked day.
   *
   * Always inserted as source='claim', status='pending' — the RLS INSERT policy
   * requires both, so a claimant cannot write themselves an already-approved
   * credit. `expires_on` is omitted deliberately: a BEFORE trigger sets it to
   * worked_date + 90, keeping the policy in one place.
   *
   * A duplicate worked date violates the (employee_id, worked_date) unique
   * constraint — surfaced as a clear message rather than a raw 23505, since
   * the 1-day-per-day-worked rule makes a second claim always a duplicate.
   */
  static async claimWorkedDay(
    supabase: SupabaseClient,
    input: {
      hr_organization_id: string;
      employee_id: string;
      worked_date: string;
      notes?: string | null;
    }
  ): Promise<void> {
    const { error } = await supabase.from('hr_comp_off_credits').insert({
      hr_organization_id: input.hr_organization_id,
      employee_id: input.employee_id,
      worked_date: input.worked_date,
      source: 'claim',
      status: 'pending',
      notes: input.notes ?? null,
    });
    if (error) {
      if (error.code === '23505') {
        throw new Error(
          'A compensatory off credit already exists for that worked date.'
        );
      }
      throw error;
    }
  }

  /**
   * Approve or reject a claim.
   *
   * The RLS UPDATE policy blocks self-approval, so an approver cannot decide
   * their own claim even though they hold the permission.
   */
  static async decideClaim(
    supabase: SupabaseClient,
    creditId: string,
    decision: 'approved' | 'rejected',
    rejectionReason?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_comp_off_credits')
      .update({
        status: decision,
        approved_at: new Date().toISOString(),
        rejection_reason: decision === 'rejected' ? (rejectionReason ?? null) : null,
      })
      .eq('id', creditId);
    if (error) throw error;
  }
}
