/**
 * POST /api/schools-portal/auth/logout
 *
 * Clears the `school_portal_session` cookie. No DB write — the magic link
 * row is already consumed at first verify, so simply dropping the cookie
 * terminates the HM's session.
 */
import { NextResponse } from 'next/server';
import { SCHOOL_PORTAL_SESSION_COOKIE } from '@/lib/auth/school-portal-jwt';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SCHOOL_PORTAL_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
