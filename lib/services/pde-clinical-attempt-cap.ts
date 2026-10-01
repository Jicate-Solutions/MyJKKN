// lib/services/pde-clinical-attempt-cap.ts
// ============================================================================
// How many attempts a learner actually has on a clinical case.
//
// THE BUG THIS FIXES
//   A Senior Learner could already "Grant additional attempts" on the case
//   roster. The endpoint recorded the grant (pde_attempt_grants, or
//   pde_engagement_events with event_type='attempt_grant' where that table has
//   not landed), the roster rendered a "+3" chip beside the learner, and the
//   audit reason was kept forever.
//
//   Nothing on the LEARNER's side ever read any of it. The coach compared their
//   submission count against the policy cap; the attempt page compared it
//   against pde_assessments.max_attempts or the same policy. Neither added the
//   grant. So the button worked, the screen said it worked, the audit row
//   proved it worked — and the learner stayed locked out.
//
//   That made granting a dead end of its own, and it is why this module exists
//   rather than only the notice that points at the button.
//
// WHERE THE GRANT LIVES
//   Read exactly the way the faculty cohort route reads it (app/api/pde/cases/
//   [id]/cohort): the dedicated table first, the engagement-event log as the
//   fallback for installations where pde_attempt_grants has not been created.
//   The two must not disagree about a number the roster already displays.
//
// DIRECTION OF FAILURE
//   Every read here fails toward the BASE cap, never above it. A missing table,
//   an unreadable row or a thrown error all return 0 extra attempts, which is
//   exactly today's behaviour — a fault can restore the old lockout, it can
//   never hand out attempts nobody granted.
//
// PASS A SERVICE-ROLE CLIENT
//   pde_attempt_grants has RLS disabled today: 20260709000000 lists it among
//   the "real operational RLS-off tables ... LEFT for a careful
//   enable-RLS-+-policy pass". A learner's own session can therefore read it
//   right now and would start returning zero rows, silently, the moment that
//   pass lands without a learner-own-row policy — re-locking every learner who
//   had been granted attempts, with nothing raising. Because this function
//   fails toward the base cap by design, that failure would look exactly like
//   "no grants exist". Every caller passes the service-role client for that
//   reason; each query is pinned to one (case, learner) the caller has already
//   authenticated.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Event type the grant endpoint writes when pde_attempt_grants is absent. */
const GRANT_EVENT_TYPE = 'attempt_grant';

/** PostgreSQL "relation does not exist" — the fallback's trigger. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '');
}

/**
 * Total extra attempts a Senior Learner has granted this learner on this case.
 * Zero when none, when the read fails, and when neither store is available.
 */
export async function readGrantedExtraAttempts(
  supabase: SupabaseClient,
  params: { assessmentId: string; learnerId: string },
): Promise<number> {
  const sb = supabase as any;

  try {
    const { data, error } = await sb
      .from('pde_attempt_grants')
      .select('attempts_granted')
      .eq('case_id', params.assessmentId)
      .eq('learner_id', params.learnerId);

    if (!error) {
      return sumGranted((data ?? []).map((r: any) => r.attempts_granted));
    }
    if (!isMissingTable(error)) return 0;
  } catch {
    return 0;
  }

  // Fallback: the grant endpoint logged into pde_engagement_events instead.
  // case_id lives inside the JSONB metadata, filtered in JS exactly as the
  // cohort route does rather than through a jsonb path predicate.
  try {
    const { data, error } = await sb
      .from('pde_engagement_events')
      .select('metadata')
      .eq('event_type', GRANT_EVENT_TYPE)
      .eq('learner_id', params.learnerId);
    if (error) return 0;
    return sumGranted(
      (data ?? [])
        .filter((ev: any) => ev?.metadata?.case_id === params.assessmentId)
        .map((ev: any) => ev?.metadata?.attempts_granted),
    );
  } catch {
    return 0;
  }
}

/** Non-negative whole numbers only — junk contributes nothing. */
function sumGranted(values: unknown[]): number {
  let total = 0;
  for (const v of values) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n > 0) total += Math.trunc(n);
  }
  return total;
}

/**
 * The cap the learner is actually held to: the case's own number (or the
 * policy) plus whatever has been granted them on it.
 *
 * Callers pass the base they already resolved, because the two learner-facing
 * paths resolve it differently — the attempt page prefers
 * pde_assessments.max_attempts, the coach reads the policy only — and this
 * change is deliberately not the place to reconcile that older asymmetry.
 */
export async function resolveEffectiveAttemptsCap(
  supabase: SupabaseClient,
  params: { assessmentId: string; learnerId: string; baseCap: number },
): Promise<{ effectiveCap: number; grantedExtra: number }> {
  const grantedExtra = await readGrantedExtraAttempts(supabase, params);
  return { effectiveCap: params.baseCap + grantedExtra, grantedExtra };
}
