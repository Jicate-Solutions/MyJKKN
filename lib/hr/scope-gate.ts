/**
 * HR institution-scope gate — the application-side twin of the `hr_scope_gate`
 * RESTRICTIVE policies in 20261121164500_hr_scope_gate_institution_access.sql.
 *
 * WHY THIS EXISTS BESIDE THE POLICIES. RLS answers a read it refuses with ZERO
 * ROWS, not an error. An HR admin at college A who asks for college B's rows
 * therefore sees an empty list, and an empty list reads as "nothing here" —
 * the leak is hidden, not reported. These helpers ask the SAME question the
 * policies ask, BEFORE the read, and refuse loudly (HrScopeError → HTTP 403)
 * instead of quietly.
 *
 * The predicates are evaluated by Postgres, not here: every check goes through
 * a SECURITY DEFINER RPC (`is_super_admin`, `role_has_institution_access`,
 * `fn_my_hr_organization_ids`, `fn_my_staff_ids`), so a caller cannot widen
 * its own scope by lying about it. What this file adds is only the honest
 * answer — "you may not see this", not "there is nothing to see".
 *
 * Fails CLOSED: an RPC error is treated as out of scope.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export class HrScopeError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = 'HrScopeError';
  }
}

async function isSuperAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_super_admin');
  return !error && data === true;
}

/**
 * Mirrors `role_has_institution_access(institution_id)` — the predicate the
 * `hr_attendance_periods` scope gate and `hr_staff_bank_directory()` use.
 * NULL is system-wide and always readable, exactly as the SQL function says.
 */
export async function assertInstitutionInHrScope(
  supabase: SupabaseClient,
  institutionId: string | null | undefined,
  what = 'this institution'
): Promise<void> {
  if (!institutionId) return;

  const { data, error } = await supabase.rpc('role_has_institution_access', {
    check_institution_id: institutionId,
  });
  if (error || data !== true) {
    throw new HrScopeError(`You do not have access to ${what}.`);
  }
}

/**
 * Mirrors `hr_organization_id = ANY (fn_my_hr_organization_ids())` — the
 * predicate the `hr_recruitment_candidate_packages` scope gate uses. A NULL
 * organisation is readable, matching the policy's `hr_organization_id IS NULL`.
 */
export async function assertHrOrganizationInScope(
  supabase: SupabaseClient,
  hrOrganizationId: string | null | undefined,
  what = 'this organisation'
): Promise<void> {
  if (!hrOrganizationId) return;
  if (await isSuperAdmin(supabase)) return;

  const { data, error } = await supabase.rpc('fn_my_hr_organization_ids');
  const mine = (error ? [] : (data as string[] | null) ?? []) as string[];
  if (!mine.includes(hrOrganizationId)) {
    throw new HrScopeError(`You do not have access to ${what}.`);
  }
}

/**
 * Whether `staffId` is one of the caller's own staff records — the identity
 * escape hatch the bank-account gate repeats (`staff_id = ANY (fn_my_staff_ids())`).
 */
export async function isOwnStaffRecord(
  supabase: SupabaseClient,
  staffId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_my_staff_ids');
  if (error) return false;
  return ((data as string[] | null) ?? []).includes(staffId);
}

export interface CandidatePackageScopeInput {
  /** Service-role client: reads the candidate's organisation REGARDLESS of the
   *  caller's RLS, which is what makes "forbidden" distinguishable from
   *  "not found". Server-only — never hand this a browser client. */
  admin: SupabaseClient;
  /** The caller's own client — every scope predicate runs as THEM. */
  supabase: SupabaseClient;
  userId: string;
  candidateId: string;
  /** When the route addresses one package, its identity escape hatches
   *  (`proposed_by`, `approved_by`) are honoured too. */
  packageId?: string;
}

/**
 * The candidate-packages gate: may this reader see this candidate's salary
 * packages? Resolves the candidate's organisation with the service-role client,
 * then asks the reader's own session the policy's question.
 *
 * Returns `'not_found'` when no such candidate exists (or the package is not
 * this candidate's), `'ok'` when the read may proceed, and THROWS HrScopeError
 * when the candidate is real but outside the reader's institution scope. The
 * identity paths the policy repeats — the candidate's submitter, a package's
 * proposer or approver — are honoured before the scope question is asked.
 */
export async function assertCandidatePackagesInScope(
  input: CandidatePackageScopeInput
): Promise<'ok' | 'not_found'> {
  const { admin, supabase, userId, candidateId, packageId } = input;

  const { data: candidate, error: candidateErr } = await admin
    .from('hr_recruitment_candidates')
    .select('id, hr_organization_id, submitted_by')
    .eq('id', candidateId)
    .maybeSingle();
  if (candidateErr) throw candidateErr;
  if (!candidate) return 'not_found';

  if (candidate.submitted_by === userId) return 'ok';

  if (packageId) {
    const { data: pkg, error: pkgErr } = await admin
      .from('hr_recruitment_candidate_packages')
      .select('id, candidate_id, proposed_by, approved_by')
      .eq('id', packageId)
      .maybeSingle();
    if (pkgErr) throw pkgErr;
    if (!pkg || pkg.candidate_id !== candidateId) return 'not_found';
    if (pkg.proposed_by === userId || pkg.approved_by === userId) return 'ok';
  }

  await assertHrOrganizationInScope(
    supabase,
    candidate.hr_organization_id as string | null,
    "this candidate's institution"
  );
  return 'ok';
}
