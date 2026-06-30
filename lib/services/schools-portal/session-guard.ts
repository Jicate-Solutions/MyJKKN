/**
 * Shared session-guard for /api/schools-portal/* data routes.
 *
 * Reads the school_portal_session cookie, verifies it, and re-checks that
 * the contact + role + school still exist (defense-in-depth — a session
 * cookie minted before a contact was deactivated must not still work).
 *
 * Returns a normalized 401 JSON response on any failure (no enumeration).
 */
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import {
  SCHOOL_PORTAL_SESSION_COOKIE,
  verifySchoolPortalSession,
  type SchoolPortalJwtClaims,
} from '@/lib/auth/school-portal-jwt';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export interface ActiveHmSession {
  claims: SchoolPortalJwtClaims;
  // The supabase service-role client, ready for school-scoped queries. Routes
  // MUST always filter by `school_id = claims.schoolId` — RLS is bypassed.
  db: ReturnType<typeof createServiceRoleClient>;
}

const UNAUTH = NextResponse.json(
  { error: 'Not authenticated' },
  { status: 401 },
);

/**
 * Resolves the HM session from the school_portal_session cookie. Pass the
 * request object when calling from a Route Handler — both the `next/headers`
 * cookie store AND the request cookies are checked (the cookie store works
 * in all server contexts, but on Edge it can lag a redirect by one tick).
 *
 * On success returns { claims, db }. On failure returns a 401 NextResponse
 * that the route should return directly:
 *
 *   const guard = await resolveHmSession(req);
 *   if (guard instanceof NextResponse) return guard;
 *   const { claims, db } = guard;
 */
export async function resolveHmSession(
  req?: NextRequest,
): Promise<ActiveHmSession | NextResponse> {
  // Cookie store first (route handler context); request cookies as fallback.
  let token: string | undefined;
  try {
    const store = await cookies();
    token = store.get(SCHOOL_PORTAL_SESSION_COOKIE)?.value;
  } catch {
    // Outside a request context (rare). Fall through to req cookies.
  }
  if (!token && req) {
    token = req.cookies.get(SCHOOL_PORTAL_SESSION_COOKIE)?.value;
  }

  const claims = await verifySchoolPortalSession(token);
  if (!claims) return UNAUTH;

  const db = createServiceRoleClient();

  // Re-verify the contact is still active and the email/role still matches.
  // This is the defense-in-depth that prevents a stale session from
  // outliving a contact-deactivation.
  const { data: contactRow, error } = await db
    .from('school_contacts')
    .select(
      `
        id,
        school_id,
        email,
        role:school_contact_roles!inner(code, can_login_to_portal)
      `,
    )
    .eq('id', claims.sub)
    .maybeSingle();

  if (error || !contactRow) {
    logger.warn('schools-portal/session-guard', 're-resolve failed', {
      sub: claims.sub,
      code: error?.code,
      message: error?.message,
    });
    return UNAUTH;
  }

  if (contactRow.school_id !== claims.schoolId) {
    logger.warn('schools-portal/session-guard', 'school_id drift', {
      sub: claims.sub,
      claimed: claims.schoolId,
      actual: contactRow.school_id,
    });
    return UNAUTH;
  }

  const roleJoin = Array.isArray(contactRow.role)
    ? contactRow.role[0]
    : contactRow.role;
  if (!roleJoin?.can_login_to_portal) return UNAUTH;

  return { claims, db };
}
