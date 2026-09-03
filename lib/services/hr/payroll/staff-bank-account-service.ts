/**
 * Employee Bank Account Service (2026-08-21)
 *
 * Substrate: 20260821240000_hr_staff_bank_accounts.sql
 *            20260821250000_fn_hr_set_staff_bank_account_and_directory.sql
 *
 * WHERE THE MONEY LANDS. A third concern alongside StaffPayrollService (who
 * pays) and StaffSalaryService (how much) — on its own permission pair,
 * hr.payroll.bank.*, because the destination is a tighter decision than the
 * amount.
 *
 * READS GO THROUGH hr_staff_bank_directory(), which drives from the roster and
 * LEFT JOINs the account. The gap is the work: most people have no account on
 * file yet, and a table that could only show the ones already done would hide
 * the entire job.
 *
 * Static class, SupabaseClient passed in — same convention as its two siblings.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/utils';

/** One person on the roster, with their account if one is on file. */
export interface StaffBankDirectoryRow {
  staff_uuid: string;
  staff_code: string | null;
  person_name: string;
  role_title: string | null;
  is_active: boolean;
  works_at_id: string;
  works_at_name: string;
  payer_org_id: string | null;
  payer_org_name: string | null;
  /** null = nothing recorded. The interesting state, not an edge case. */
  account_id: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  bank_name: string | null;
  branch_name: string | null;
  account_type: string | null;
  /** null = entered but never checked against a passbook. */
  verified_at: string | null;
  effective_from: string | null;
  notes: string | null;
}

/** One row of the supersede chain, for the history sheet. */
export interface StaffBankAccountHistoryRow {
  id: string;
  account_holder_name: string;
  account_number: string;
  /** Nullable since 2026-09-02 — an account may be recorded without one. */
  ifsc_code: string | null;
  bank_name: string | null;
  branch_name: string | null;
  account_type: string;
  verified_at: string | null;
  effective_from: string;
  superseded_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface SetBankAccountInput {
  staffId: string;
  accountHolderName: string;
  accountNumber: string;
  /**
   * Optional since 2026-09-02. Omitting it records the account but leaves it
   * UNPAYABLE — see isPayable() in lib/hr/payroll/bank-account-validation.
   */
  ifscCode?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  accountType?: string;
  effectiveFrom?: string;
  notes?: string | null;
}

export class StaffBankAccountService {
  /**
   * The whole roster, with an account where one exists.
   *
   * The RPC RAISES for a caller without hr.payroll.bank.view rather than
   * returning [], so an empty list here means "no staff in scope", never
   * "you are not allowed to see this".
   */
  static async listDirectory(
    supabase: SupabaseClient
  ): Promise<StaffBankDirectoryRow[]> {
    const { data, error } = await (supabase as any).rpc('hr_staff_bank_directory');

    if (error) {
      throw new Error(`Failed to load bank accounts: ${getErrorMessage(error)}`);
    }

    return (data ?? []) as StaffBankDirectoryRow[];
  }

  /**
   * Every account this person has ever been paid into, newest first.
   *
   * This is the audit trail that makes the supersede design worth having: an
   * account number changed shortly before a payout run is the thing someone
   * will eventually need to look up.
   */
  static async listHistory(
    supabase: SupabaseClient,
    staffUuid: string
  ): Promise<StaffBankAccountHistoryRow[]> {
    const { data, error } = await (supabase as any)
      .from('hr_staff_bank_accounts')
      .select(
        'id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, ' +
          'account_type, verified_at, effective_from, superseded_by, notes, created_at'
      )
      .eq('staff_id', staffUuid)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load bank account history: ${getErrorMessage(error)}`);
    }

    return (data ?? []) as StaffBankAccountHistoryRow[];
  }

  /**
   * Record an account, superseding whatever was in use.
   *
   * Goes through the RPC rather than an insert + update pair: the partial
   * unique index on (staff_id) WHERE superseded_by IS NULL cannot be satisfied
   * by two separate PostgREST calls in either order.
   */
  static async setAccount(
    supabase: SupabaseClient,
    input: SetBankAccountInput
  ): Promise<string> {
    const { data, error } = await (supabase as any).rpc('fn_hr_set_staff_bank_account', {
      p_staff_id: input.staffId,
      p_account_holder_name: input.accountHolderName,
      p_account_number: input.accountNumber,
      p_ifsc_code: input.ifscCode ?? null,
      p_bank_name: input.bankName ?? null,
      p_branch_name: input.branchName ?? null,
      p_account_type: input.accountType ?? 'savings',
      p_effective_from: input.effectiveFrom ?? null,
      p_notes: input.notes ?? null,
    });

    if (error) {
      throw new Error(`Failed to save the bank account: ${getErrorMessage(error)}`);
    }

    return data as string;
  }

  /**
   * Mark the account in use as checked against a passbook or cancelled cheque.
   * Separate from saving it on purpose — see the migration header.
   */
  static async setVerified(
    supabase: SupabaseClient,
    accountId: string,
    verified: boolean
  ): Promise<void> {
    const { error } = await (supabase as any).rpc('fn_hr_verify_staff_bank_account', {
      p_account_id: accountId,
      p_verified: verified,
    });

    if (error) {
      throw new Error(`Failed to update verification: ${getErrorMessage(error)}`);
    }
  }
}
