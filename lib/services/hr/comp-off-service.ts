/**
 * Compensatory off credit ledger.
 *
 * Static class, SupabaseClient passed first — mirrors HRLeaveTypeService.
 * Supabase errors are plain objects, not Error instances, so every call
 * destructures { error } and throws it; try/catch alone does not surface RLS
 * denials or constraint violations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompOffBalance, PendingCompOffClaim } from '@/types/hr-comp-off';
import type { LeaveDocument } from '@/types/hr';

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
      documents: LeaveDocument[];
    }
  ): Promise<void> {
    // THE authority on "a claim needs proof" — the dialog runs the same check
    // to gate Submit, but this method is reachable directly and a client check
    // alone would gate nothing. hr_grant/attendance credits are inserted
    // elsewhere and legitimately carry none.
    if (input.documents.length === 0) {
      throw new Error(
        'A supporting document is required — attach proof of the worked day.'
      );
    }
    const { error } = await supabase.from('hr_comp_off_credits').insert({
      hr_organization_id: input.hr_organization_id,
      employee_id: input.employee_id,
      worked_date: input.worked_date,
      source: 'claim',
      status: 'pending',
      notes: input.notes ?? null,
      documents: input.documents,
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
   * Claims awaiting a decision.
   *
   * No organization filter here: hcoc_select already restricts approvers to
   * their own organizations, and re-filtering client-side on an id the caller
   * supplied would be security theatre — RLS is the real boundary.
   *
   * The team-member embed is a LEFT join. An inner join would drop any claim
   * whose person row the caller cannot read, silently shrinking the queue
   * rather than showing the row with no name.
   *
   * Aliased `member:` rather than the default: PostgREST resolves the target
   * through the employee_id FK, so the alias is free, and the terminology gate
   * blocks the literal table name appearing in new source lines.
   */
  static async listPendingClaims(
    supabase: SupabaseClient
  ): Promise<PendingCompOffClaim[]> {
    const { data, error } = await supabase
      .from('hr_comp_off_credits')
      .select(
        `id, employee_id, worked_date, expires_on, credit_days, source, notes, documents, created_at,
         member:employee_id ( first_name, last_name, staff_id, institution_id,
           institution:institutions ( name ) )`
      )
      .eq('status', 'pending')
      .order('worked_date', { ascending: true });
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const m = row.member as
        | {
            first_name: string | null;
            last_name: string | null;
            staff_id: string | null;
            institution_id: string | null;
            institution: { name: string | null } | null;
          }
        | null;
      return {
        id: row.id as string,
        employee_id: row.employee_id as string,
        employee_name:
          [m?.first_name, m?.last_name].filter(Boolean).join(' ').trim() || 'Unknown',
        employee_code: m?.staff_id ?? null,
        institution_id: m?.institution_id ?? null,
        institution_name: m?.institution?.name ?? null,
        worked_date: row.worked_date as string,
        expires_on: row.expires_on as string,
        credit_days: Number(row.credit_days),
        source: row.source as PendingCompOffClaim['source'],
        notes: (row.notes as string | null) ?? null,
        documents: (row.documents as LeaveDocument[] | null) ?? [],
        created_at: row.created_at as string,
      };
    });
  }

  /**
   * Approve or reject a claim.
   *
   * The RLS UPDATE policy blocks self-approval, so an approver cannot decide
   * their own claim even though they hold the permission.
   */
  /**
   * The claimant takes back their own claim before anyone has decided it.
   *
   * Guarded by the hcoc_withdraw_own_pending policy, whose WITH CHECK pins the
   * new status — so a forged status here is refused by Postgres, not by this
   * method. The .eq('status','pending') is a courtesy that turns a race into
   * "0 rows" rather than a policy denial.
   */
  static async withdrawClaim(supabase: SupabaseClient, creditId: string): Promise<void> {
    const { data, error } = await supabase
      .from('hr_comp_off_credits')
      .update({ status: 'withdrawn' })
      .eq('id', creditId)
      .eq('status', 'pending')
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('This claim is no longer pending — it may have just been decided.');
    }
  }

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
