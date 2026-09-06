/**
 * SF100 external mentor/investor — per-request access resolution.
 *
 * The session JWT carries ONLY the contact's ss_mentors.id. The set of teams they
 * may reach is resolved HERE, on every request, from ss_mentor_matches — so a
 * coordinator assigning or removing a team takes effect immediately and can never
 * be over-ridden by a stale token or a client-supplied team id (D3, spec §4).
 *
 * Node runtime only (service-role client). Mirrors lib/utils/parent-access.ts.
 */
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  EXTERNAL_SESSION_COOKIE,
  verifyExternalSession,
} from '@/lib/auth/external-jwt';

/** A match status that grants live access to the team. */
const ACTIVE_MATCH_STATUSES = ['proposed', 'active'];

export interface ExternalSession {
  mentorId: string;
}

/** Read + verify the external session cookie. Returns null if not authenticated. */
export async function getExternalSession(): Promise<ExternalSession | null> {
  const jar = await cookies();
  const token = jar.get(EXTERNAL_SESSION_COOKIE)?.value;
  const claims = await verifyExternalSession(token);
  if (!claims?.sub) return null;
  // Defence in depth: the contact must still exist AND still be account-less.
  const db = createServiceRoleClient();
  const { data: mentor } = await db
    .from('ss_mentors')
    .select('id, user_id, status')
    .eq('id', claims.sub)
    .maybeSingle();
  if (!mentor || mentor.user_id) return null;
  return { mentorId: claims.sub };
}

/**
 * The SF100 enrollment ids this external contact is assigned to (live matches
 * only). Empty array = assigned to nothing → sees nothing.
 */
export async function resolveAssignedEnrollmentIds(
  mentorId: string
): Promise<string[]> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('ss_mentor_matches')
    .select('sf100_enrollment_id')
    .eq('mentor_id', mentorId)
    .not('sf100_enrollment_id', 'is', null)
    .in('status', ACTIVE_MATCH_STATUSES);
  const ids = (data ?? [])
    .map((r) => r.sf100_enrollment_id as string | null)
    .filter((v): v is string => !!v);
  // De-dupe defensively (unique index should already guarantee this).
  return Array.from(new Set(ids));
}

/**
 * Authorize an external contact for a SPECIFIC enrollment. The single choke point
 * every external-user data route must call before returning team data — never
 * trust a client-supplied enrollment id. Returns true only if the verified
 * session is assigned to that exact team.
 */
export async function externalCanAccessEnrollment(
  mentorId: string,
  enrollmentId: string
): Promise<boolean> {
  if (!enrollmentId) return false;
  const assigned = await resolveAssignedEnrollmentIds(mentorId);
  return assigned.includes(enrollmentId);
}
