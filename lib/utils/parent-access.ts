/**
 * Parent Portal — server-side access control.
 *
 * Every /api/parent/* read/write resolves the caller's scope from their
 * parent_session JWT, then asserts the requested learner/institution is inside
 * that scope. Because the portal talks to Supabase via the service-role client
 * (which bypasses RLS), THIS is the real authorization gate — not the database.
 *
 * `learnerIds` are resolved fresh per request from VERIFIED pp_parent_learner_links
 * rows, so adding a sibling takes effect immediately without re-issuing the JWT.
 *
 * Node runtime only (uses the service-role client). Do not import from proxy.ts.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PARENT_SESSION_COOKIE, verifyParentSession } from '@/lib/auth/parent-jwt';
import { findLearnersByMobile, normalizeMobile } from '@/lib/utils/parent-identifier';

export interface ParentScope {
  parentAccountId: string; // the logged-in student's account
  loggedInLearnerId: string; // the student that was logged into
  /** primary parent mobile (live), used for OTP/add-sibling */
  mobile: string;
  /** primary parent name (live) for display */
  displayName?: string;
  /** the family: the logged-in learner + all siblings sharing a parent mobile (live) */
  learnerIds: string[];
  /** distinct institution ids across the family */
  institutionIds: string[];
}

/** Thrown by the assert* guards; carries an HTTP status for the route to surface. */
export class ParentAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = 'ParentAccessError';
    this.status = status;
  }
}

/**
 * Resolve the parent's scope from the request's session cookie.
 * Returns null when there is no valid session (caller → 401).
 */
export async function resolveParentScope(
  req: NextRequest
): Promise<ParentScope | null> {
  const token = req.cookies.get(PARENT_SESSION_COOKIE)?.value;
  const claims = await verifyParentSession(token);
  if (!claims) return null;

  const db = createServiceRoleClient();

  // The logged-in student's LIVE profile is the source of truth for contact.
  const { data: meRow, error } = await db
    .from('learners_profiles')
    .select('id, institution_id, father_name, mother_name, father_mobile, mother_mobile')
    .eq('id', claims.learnerProfileId)
    .maybeSingle();
  if (error) throw new ParentAccessError('Failed to resolve parent scope', 500);

  const me = meRow as unknown as {
    id: string;
    institution_id: string | null;
    father_name: string | null;
    mother_name: string | null;
    father_mobile: string | null;
    mother_mobile: string | null;
  } | null;
  if (!me) return null; // learner gone → treat as unauthenticated

  // Family = all learners sharing either parent mobile (resolved LIVE), so a
  // profile mobile change reshapes the family automatically. Always includes self.
  const family = new Map<string, string>(); // learnerId -> institutionId
  family.set(me.id, me.institution_id ?? '');
  for (const mob of [me.father_mobile, me.mother_mobile]) {
    if (!normalizeMobile(mob)) continue;
    const sibs = await findLearnersByMobile(db, mob as string);
    for (const s of sibs) if (s.institution_id) family.set(s.id, s.institution_id);
  }

  return {
    parentAccountId: claims.sub,
    loggedInLearnerId: me.id,
    mobile: normalizeMobile(me.father_mobile) || normalizeMobile(me.mother_mobile),
    displayName: me.father_name ?? me.mother_name ?? undefined,
    learnerIds: [...family.keys()],
    institutionIds: [...new Set([...family.values()].filter(Boolean))],
  };
}

export function assertLearnerAccess(scope: ParentScope, learnerId: string): void {
  if (!learnerId || !scope.learnerIds.includes(learnerId)) {
    throw new ParentAccessError('You do not have access to this learner.', 403);
  }
}

export function assertInstitutionAccess(
  scope: ParentScope,
  institutionId: string
): void {
  if (!institutionId || !scope.institutionIds.includes(institutionId)) {
    throw new ParentAccessError('You do not have access to this institution.', 403);
  }
}

/**
 * Convenience for route catch-blocks: map any thrown error to a JSON response.
 * ParentAccessError carries its own status; everything else becomes a 500.
 */
export function parentErrorResponse(err: unknown): NextResponse {
  if (err instanceof ParentAccessError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[parent-api] unhandled error:', message);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
