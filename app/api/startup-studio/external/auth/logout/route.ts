import { NextResponse } from 'next/server';
import {
  EXTERNAL_SESSION_COOKIE,
  externalSessionClearOptions,
} from '@/lib/auth/external-jwt';

export const runtime = 'nodejs';

/** Clear the external session cookie (clean logout — no server state to purge). */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(EXTERNAL_SESSION_COOKIE, '', externalSessionClearOptions());
  return res;
}
