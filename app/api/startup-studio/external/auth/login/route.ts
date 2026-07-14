import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessCode } from '@/lib/services/startup-studio/external-access-service';
import {
  signExternalSession,
  EXTERNAL_SESSION_COOKIE,
  externalSessionCookieOptions,
} from '@/lib/auth/external-jwt';

export const runtime = 'nodejs';

/**
 * External mentor/investor login: { identifier (email or phone), code } → verify
 * against ss_external_access (with attempts/lockout) → issue the isolated
 * sf100_external_session JWT cookie. The token carries only the contact id; teams
 * are resolved per-request (lib/utils/external-access.ts), never trusted from the client.
 *
 * Generic failure copy — never reveal whether the identifier exists or the code
 * was wrong (no enumeration). A locked credential is surfaced so the user waits.
 */
const INVALID = NextResponse.json(
  { success: false, error: 'invalid', message: 'Invalid email/phone or access code.' },
  { status: 401 }
);

export async function POST(req: NextRequest) {
  let body: { identifier?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'bad_request', message: 'Invalid request' },
      { status: 400 }
    );
  }

  const identifier = (body.identifier ?? '').trim();
  const code = (body.code ?? '').trim();
  if (!identifier || !code) return INVALID;

  const result = await verifyAccessCode(identifier, code);

  if (!result.ok) {
    if (result.reason === 'locked') {
      return NextResponse.json(
        {
          success: false,
          error: 'locked',
          message:
            'Too many incorrect attempts. This access code is temporarily locked. Please try again later.',
          lockedUntil: result.lockedUntil ?? null,
        },
        { status: 429 }
      );
    }
    return INVALID;
  }

  const token = await signExternalSession({ sub: result.mentorId });
  const res = NextResponse.json({ success: true });
  res.cookies.set(EXTERNAL_SESSION_COOKIE, token, externalSessionCookieOptions());
  return res;
}
