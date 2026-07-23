import { NextResponse } from 'next/server';
import { PARENT_SESSION_COOKIE, PARENT_ACTIVE_LEARNER_COOKIE } from '@/lib/auth/parent-jwt';

export const runtime = 'nodejs';

/** POST /api/parent/auth/logout — clear the parent session + active-child cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PARENT_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(PARENT_ACTIVE_LEARNER_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
