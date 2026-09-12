/**
 * Compensatory off credit ledger.
 *
 * Static class, SupabaseClient passed first — mirrors HRLeaveTypeService.
 * Supabase errors are plain objects, not Error instances, so every call
 * destructures { error } and throws it; try/catch alone does not surface RLS
 * denials or constraint violations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CompOffBalance,
  CompOffClaimBiometric,
  CompOffClaimQueueRow,
  CompOffWorkLocation,
  PendingCompOffClaim,
} from '@/types/hr-comp-off';
import type { LeaveDocument } from '@/types/hr';

/**
 * The claim columns plus the claimant embed. A LEFT join: an inner join would
 * drop any claim whose person row the caller cannot read, silently shrinking
 * the queue rather than showing the row with no name. Aliased `member:` — the
 * terminology gate blocks the literal table name in new source lines.
 */
const CLAIM_SELECT =
  `id, employee_id, worked_date, expires_on, credit_days, source, notes, documents, created_at,
   work_location, work_place,
   member:employee_id ( first_name, last_name, staff_id, institution_id,
     institution:institutions ( name ) )`;

function toClaim(row: Record<string, unknown>): PendingCompOffClaim {
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
    employee_name: [m?.first_name, m?.last_name].filter(Boolean).join(' ').trim() || 'Unknown',
    employee_code: m?.staff_id ?? null,
    institution_id: m?.institution_id ?? null,
    institution_name: m?.institution?.name ?? null,
    worked_date: row.worked_date as string,
    expires_on: row.expires_on as string,
    credit_days: Number(row.credit_days),
    source: row.source as PendingCompOffClaim['source'],
    notes: (row.notes as string | null) ?? null,
    work_location: (row.work_location as CompOffWorkLocation | null) ?? null,
    work_place: (row.work_place as string | null) ?? null,
    documents: (row.documents as LeaveDocument[] | null) ?? [],
    created_at: row.created_at as string,
  };
}

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
   * worked_date + 1 calendar month, keeping the policy in one place.
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
      work_location: CompOffWorkLocation | null;
      /** Required for outside_campus; ignored for inside_campus. */
      work_place?: string | null;
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
    // Same rule, same reason. trg_hcoc_require_work_location and the table's
    // CHECKs refuse these too; saying it here names the fix before any upload
    // round trip, and a place typed before switching back to "inside" is
    // dropped rather than refused by hr_comp_off_credits_place_only_outside.
    if (!input.work_location) {
      throw new Error('Say where you worked that day — inside or outside the campus.');
    }
    const place =
      input.work_location === 'outside_campus' ? input.work_place?.trim() || null : null;
    if (input.work_location === 'outside_campus' && !place) {
      throw new Error('Enter the place you worked at when it was outside the campus.');
    }
    const { error } = await supabase.from('hr_comp_off_credits').insert({
      hr_organization_id: input.hr_organization_id,
      employee_id: input.employee_id,
      worked_date: input.worked_date,
      source: 'claim',
      status: 'pending',
      notes: input.notes ?? null,
      documents: input.documents,
      work_location: input.work_location,
      work_place: place,
    });
    if (error) {
      // 23505 now has TWO sources on this table and they say different things:
      //   * trg_hcoc_day_occupancy, whose message NAMES the request already
      //     holding that day ("...clashes with Casual Leave on 28/08/2026");
      //   * hr_comp_off_credits_employee_date_live_unique, the race backstop,
      //     whose message is raw Postgres and useless to a person.
      // The unconditional string this replaces swallowed the first one, so the
      // most informative refusal in the module was being thrown away.
      if (error.code === '23505') {
        throw new Error(
          /only one request is allowed per day/i.test(error.message ?? '')
            ? error.message
            : 'A compensatory off credit already exists for that worked date.'
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
      .select(CLAIM_SELECT)
      .eq('status', 'pending')
      .order('worked_date', { ascending: true });
    if (error) throw error;

    return (data ?? []).map((row) => toClaim(row as Record<string, unknown>));
  }

  /**
   * The approvals queue: every pending claim, plus anything created in the last
   * 12 months so decided history (approved, used, rejected, withdrawn) is one
   * Status filter away — the Leave tab's window. Scoped by RLS like
   * listPendingClaims; there are a few dozen claims in all.
   */
  static async listClaimsForApproval(
    supabase: SupabaseClient
  ): Promise<CompOffClaimQueueRow[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const { data, error } = await supabase
      .from('hr_comp_off_credits')
      .select(`${CLAIM_SELECT}, status, approved_at, rejection_reason`)
      .or(`status.eq.pending,created_at.gte.${since.toISOString().slice(0, 10)}`)
      .order('worked_date', { ascending: true });
    if (error) throw error;

    return (data ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        ...toClaim(row),
        status: row.status as CompOffClaimQueueRow['status'],
        decided_at: (row.approved_at as string | null) ?? null,
        rejection_reason: (row.rejection_reason as string | null) ?? null,
      };
    });
  }

  /**
   * The punch check for each claim — whether an inside-campus claim's worked
   * day shows a biometric punch. An RPC, not a query: attendance rows are
   * RLS-hidden from approvers who hold only hr.leave.approve, and the RPC
   * authorises each claim the way hcoc_select does. It runs the same check
   * trg_hcoc_require_biometric enforces, so the screen and the database agree.
   */
  static async claimsBiometric(
    supabase: SupabaseClient,
    claimIds: string[]
  ): Promise<CompOffClaimBiometric[]> {
    if (claimIds.length === 0) return [];
    const { data, error } = await supabase.rpc('hr_comp_off_claims_biometric', {
      p_claim_ids: claimIds,
    });
    if (error) throw error;
    return (data ?? []) as CompOffClaimBiometric[];
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
