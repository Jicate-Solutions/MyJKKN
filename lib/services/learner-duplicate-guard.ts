import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================
// LEARNER DUPLICATE GUARD
// ============================================
// Created: 2026-10-08
// Purpose: Catch the same person entered twice BEFORE it forks into two learner
// records and two logins.
// Incident: JKKN-COP-1519 and JKKN-COP-1538 (same name, mobile, admission year)
// were keyed 15 days apart with college emails that differ by one transposed pair
// (…26pb@ / …26bp@). The …26bp@ Google login attached to the empty duplicate while
// the paid, active record got a second, unusable login minted from its own typo.
// ============================================

/**
 * A learner in one of these states is a closed chapter — a fresh enquiry for the
 * same person (re-application after rejection, re-admission) is legitimate.
 */
const CLOSED_LIFECYCLE_STATUSES = ['rejected', 'inactive', 'exited', 'graduated', 'alumni'] as const;

export interface DuplicateLearnerCandidate {
  id: string;
  application_id: string | null;
  first_name: string | null;
  last_name: string | null;
  college_email: string | null;
  lifecycle_status: string;
}

export interface LearnerIdentity {
  student_mobile?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  admission_year_id?: string | null;
  institution_id?: string | null;
}

const normalize = (value: string | null | undefined): string =>
  (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Two learner rows are "the same person" when all five parts agree. Returns null
 * while any part is missing: a draft enquiry is created before the mobile is
 * typed, so an incomplete identity can't be judged yet.
 */
export function learnerIdentityKey(identity: LearnerIdentity): string | null {
  const mobile = normalize(identity.student_mobile);
  const firstName = normalize(identity.first_name);
  if (!mobile || !firstName || !identity.admission_year_id || !identity.institution_id) {
    return null;
  }
  return [
    mobile,
    firstName,
    normalize(identity.last_name),
    identity.admission_year_id,
    identity.institution_id,
  ].join('|');
}

/**
 * Other live learners that are the same person as `identity`. Throws on a query
 * error — the caller decides whether a failed check blocks (login creation) or
 * not (data entry).
 */
export async function findDuplicateLearners(
  supabase: SupabaseClient<any, any, any>,
  identity: LearnerIdentity,
  excludeLearnerId?: string | null
): Promise<DuplicateLearnerCandidate[]> {
  const key = learnerIdentityKey(identity);
  if (!key) return [];

  let query = supabase
    .from('learners_profiles')
    .select('id, application_id, first_name, last_name, college_email, lifecycle_status')
    .eq('student_mobile', (identity.student_mobile as string).trim())
    .eq('institution_id', identity.institution_id as string)
    .eq('admission_year_id', identity.admission_year_id as string)
    .not('lifecycle_status', 'in', `(${CLOSED_LIFECYCLE_STATUSES.join(',')})`);

  // Conditional, never `.neq(col, undefined)` — that sends the string "undefined".
  if (excludeLearnerId) {
    query = query.neq('id', excludeLearnerId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as DuplicateLearnerCandidate[]).filter(
    (candidate) =>
      learnerIdentityKey({
        ...identity,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
      }) === key
  );
}

export function describeDuplicateLearner(candidate: DuplicateLearnerCandidate): string {
  const name = `${candidate.first_name ?? ''} ${candidate.last_name ?? ''}`.trim();
  const email = candidate.college_email ? `, ${candidate.college_email}` : '';
  return `${candidate.application_id ?? candidate.id} (${name}, ${candidate.lifecycle_status}${email})`;
}
