/**
 * Staff Payroll Organisation Service (2026-07-31)
 *
 * Substrate: 20260731071358_staff_working_institution_hr_payroll.sql
 *            20260731090000_hr_staff_without_payer_rpc.sql
 *
 * WHO PAYS each staff member. This is deliberately NOT staff.institution_id —
 * that column means WHERE SOMEONE WORKS, and the two diverge for the people who
 * matter most: the CEO is paid by Engineering but works at Main Office, and the
 * shared campus-services team works at Main Office, which pays nobody.
 *
 * Everything here reads or writes hr_staff_payroll, which is gated on
 * hr.payroll.institution.view / .manage. Callers without those keys get zero
 * rows and NO error — that is why listWithoutPayer() goes through a
 * self-authorizing RPC that raises instead of returning an empty list.
 *
 * Static class — SupabaseClient passed as first argument (mirrors
 * PayrollPeriodsService conventions in this codebase).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/utils';

/** A staff member nobody has recorded a payer for. Shape of hr_staff_without_payer(). */
export interface StaffAwaitingPayer {
  staff_uuid: string;
  staff_code: string | null;
  person_name: string;
  role_title: string | null;
  works_at_id: string;
  works_at_name: string;
}

/**
 * One active staff member and their recorded payer. Shape of
 * hr_staff_payroll_directory().
 *
 * `payer_org_id` is NULL when nobody has recorded a payer — the same
 * "not yet decided" state that absence of an hr_staff_payroll row carries, kept
 * as null rather than defaulted to the work location so the UI never presents a
 * guess as a recorded fact.
 */
export interface StaffPayerRow {
  staff_uuid: string;
  staff_code: string | null;
  person_name: string;
  role_title: string | null;
  works_at_id: string;
  works_at_name: string;
  payer_org_id: string | null;
  payer_org_name: string | null;
}

export interface StaffPayerAssignment {
  staff_id: string;
  hr_organization_id: string;
  organization_name?: string;
  notes?: string | null;
}

/** An organisation that actually runs a payroll and may therefore be picked. */
export interface PayrollOrganization {
  id: string;
  name: string;
  institution_id: string | null;
}

export class StaffPayrollService {
  /**
   * Active staff with no recorded payer — the HR work queue.
   *
   * Expected to be NON-EMPTY by design: the shared campus-services team works at
   * JKKN Main Office, which runs no payroll, so their payer is a genuine open
   * question rather than a data-entry oversight.
   *
   * Goes through the RPC rather than a client-side anti-join for two reasons:
   * PostgREST cannot express "rows of A with no match in B" in one request, and
   * the RPC raises 42501 when the caller lacks the permission key instead of
   * quietly returning [] — an empty queue must mean "nothing to do", never
   * "you cannot see it".
   */
  static async listWithoutPayer(
    supabase: SupabaseClient
  ): Promise<StaffAwaitingPayer[]> {
    const { data, error } = await (supabase as any).rpc('hr_staff_without_payer');

    if (error) {
      throw new Error(
        `Failed to load team members awaiting a payroll organisation: ${getErrorMessage(error)}`
      );
    }

    return (data ?? []) as StaffAwaitingPayer[];
  }

  /**
   * The organisations that may be chosen as a payer.
   *
   * Filtered on is_payroll_entity so a work-location-only organisation (JKKN
   * Main Office) never appears in the picker. The database enforces the same
   * rule through a composite foreign key, so a stale client cannot write one
   * anyway — this just keeps it out of the list.
   */
  static async listPayrollOrganizations(
    supabase: SupabaseClient
  ): Promise<PayrollOrganization[]> {
    const { data, error } = await (supabase as any)
      .from('hr_organizations')
      .select('id, name, institution_id')
      .eq('is_payroll_entity', true)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(
        `Failed to load payroll organisations: ${getErrorMessage(error)}`
      );
    }

    return (data ?? []) as PayrollOrganization[];
  }

  /** The recorded payer for one person, or null when nobody has recorded it. */
  static async getPayer(
    supabase: SupabaseClient,
    staffId: string
  ): Promise<StaffPayerAssignment | null> {
    const { data, error } = await (supabase as any)
      .from('hr_staff_payroll')
      .select('staff_id, hr_organization_id, notes, organization:hr_organizations(name)')
      .eq('staff_id', staffId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load payroll organisation: ${getErrorMessage(error)}`);
    }
    if (!data) return null;

    return {
      staff_id: data.staff_id,
      hr_organization_id: data.hr_organization_id,
      organization_name: data.organization?.name,
      notes: data.notes ?? null,
    };
  }

  /**
   * Record (or change) who pays this person.
   *
   * onConflict is 'staff_id', which is a real UNIQUE constraint on the table —
   * an upsert naming a constraint that does not exist fails at runtime. The
   * write policy is FOR ALL, so the UPDATE half of the upsert is covered too.
   *
   * Passing a non-payroll organisation is rejected by the composite FK
   * (hr_staff_payroll_org_must_run_payroll) rather than by a check here.
   */
  static async setPayer(
    supabase: SupabaseClient,
    staffId: string,
    hrOrganizationId: string,
    notes?: string | null
  ): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await (supabase as any)
      .from('hr_staff_payroll')
      .upsert(
        {
          staff_id: staffId,
          hr_organization_id: hrOrganizationId,
          notes: notes ?? null,
          updated_by: userData?.user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'staff_id' }
      );

    // Never fire-and-forget: an RLS denial or the payroll-entity FK violation
    // comes back in `error`, not as a thrown exception.
    if (error) {
      throw new Error(
        `Failed to record the payroll organisation: ${getErrorMessage(error)}`
      );
    }
  }

  /**
   * EVERY active staff member with their recorded payer, assigned or not.
   *
   * This is what the screen lists. listWithoutPayer() above answers the
   * narrower "who is missing a payer" and stays as the payslip-gap signal, but
   * it cannot reach the 638 people who already have one — and because the
   * backfill set payer = work institution for all of them, every one of those
   * is an assumption that may need correcting. Listing only the gap made the
   * assignment unreachable and therefore uncorrectable.
   *
   * Goes through an RPC for the same two reasons as the queue: PostgREST cannot
   * express this LEFT JOIN across two tables in one request, and the RPC raises
   * 42501 when the caller lacks the permission key instead of quietly returning
   * [] — an empty directory must mean "no staff", never "you cannot see them".
   *
   * Returns the whole set unpaginated (744 rows on live data). The screen
   * filters, sorts and pages it in memory; if this ever approaches a few
   * thousand, parameterise the RPC rather than growing the payload.
   */
  static async listDirectory(supabase: SupabaseClient): Promise<StaffPayerRow[]> {
    const { data, error } = await (supabase as any).rpc(
      'hr_staff_payroll_directory'
    );

    if (error) {
      throw new Error(
        `Failed to load payroll organisations: ${getErrorMessage(error)}`
      );
    }

    return (data ?? []) as StaffPayerRow[];
  }

  /**
   * Record ONE payer for many people at once.
   *
   * The queue is dominated by groups who share a payer by construction — 30 bus
   * drivers, 16 hostel scavengers — so assigning them one row at a time is 30
   * round trips and 30 chances to stop half way. A single upsert is one
   * statement: either every row lands or none does.
   *
   * Same onConflict as setPayer ('staff_id' is a real UNIQUE constraint), so
   * re-assigning someone who already has a payer updates rather than throwing.
   */
  static async setPayersBulk(
    supabase: SupabaseClient,
    staffIds: string[],
    hrOrganizationId: string
  ): Promise<void> {
    if (staffIds.length === 0) return;

    const { data: userData } = await supabase.auth.getUser();
    const updatedBy = userData?.user?.id ?? null;
    const updatedAt = new Date().toISOString();

    const { error } = await (supabase as any).from('hr_staff_payroll').upsert(
      staffIds.map((staffId) => ({
        staff_id: staffId,
        hr_organization_id: hrOrganizationId,
        updated_by: updatedBy,
        updated_at: updatedAt,
      })),
      { onConflict: 'staff_id' }
    );

    if (error) {
      throw new Error(
        `Failed to record the payroll organisation for ${staffIds.length} team members: ${getErrorMessage(error)}`
      );
    }
  }

  /**
   * Remove the recorded payer, returning this person to the queue.
   *
   * Deliberately not a soft "set to null": absence of a row IS the "not yet
   * recorded" state, and the payslip generator excludes them on that basis.
   */
  static async clearPayer(
    supabase: SupabaseClient,
    staffId: string
  ): Promise<void> {
    const { error } = await (supabase as any)
      .from('hr_staff_payroll')
      .delete()
      .eq('staff_id', staffId);

    if (error) {
      throw new Error(
        `Failed to clear the payroll organisation: ${getErrorMessage(error)}`
      );
    }
  }
}
