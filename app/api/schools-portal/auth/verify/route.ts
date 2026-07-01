/**
 * POST /api/schools-portal/auth/verify
 *
 * Consumes a single-use magic-link token and, on success, mints a
 * `school_portal_session` HttpOnly cookie carrying the HM's claims.
 * Subsequent /api/schools-portal/* routes verify that cookie via
 * lib/auth/school-portal-jwt.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicLink } from '@/lib/services/schools-portal/magic-link';
import {
  signSchoolPortalSession,
  SCHOOL_PORTAL_SESSION_COOKIE,
  schoolPortalSessionCookieOptions,
} from '@/lib/auth/school-portal-jwt';

export const runtime = 'nodejs';

const INVALID = NextResponse.json(
  { error: 'Invalid or expired link' },
  { status: 401 },
);

export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const token = (body?.token ?? '').trim();
  if (!token) return INVALID;

  const verified = await verifyMagicLink(token);
  if (!verified) return INVALID;

  const sessionJwt = await signSchoolPortalSession({
    sub: verified.contactId,
    schoolId: verified.schoolId,
    email: verified.email,
    role: verified.role,
  });

  const res = NextResponse.json({
    ok: true,
    schoolId: verified.schoolId,
    schoolName: verified.schoolName,
    role: verified.role,
  });
  res.cookies.set(
    SCHOOL_PORTAL_SESSION_COOKIE,
    sessionJwt,
    schoolPortalSessionCookieOptions(),
  );
  return res;
}
