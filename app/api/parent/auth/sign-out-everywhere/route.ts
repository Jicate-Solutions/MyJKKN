import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  PARENT_SESSION_COOKIE,
  PARENT_ACTIVE_LEARNER_COOKIE,
  verifyParentSession,
} from '@/lib/auth/parent-jwt';
import {
  parentSignOutEverywhereAvailable,
  revokeParentSessions,
} from '@/lib/auth/parent-sign-out-everywhere';

export const runtime = 'nodejs';

/**
 * "Sign out of all devices" — a PARENT on their own account (Settings screen).
 * Director ruling 2026-10-01: logins last for ever on the installed app; the
 * safety net for a lost or shared phone is a sign-out-everywhere button for
 * each person.
 *
 * The caller is identified ONLY by their verified parent_session cookie; the
 * account written is the token's own `sub`, never a value from the request.
 *
 *   GET  → { available } — false while pp_parent_accounts.sessions_revoked_at
 *          (draft PR #4168) does not exist; the Settings screen hides the button.
 *   POST → sets sessions_revoked_at = now for this account (every device,
 *          this one included) and clears this browser's parent cookies.
 *
 * No user_activity_logs row: parents have no profiles row to log against.
 */

function clearParentCookies(res: NextResponse) {
  res.cookies.set(PARENT_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(PARENT_ACTIVE_LEARNER_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const claims = await verifyParentSession(req.cookies.get(PARENT_SESSION_COOKIE)?.value);
  if (!claims) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const available = await parentSignOutEverywhereAvailable(createServiceRoleClient());
  return NextResponse.json({ available });
}

export async function POST(req: NextRequest) {
  const claims = await verifyParentSession(req.cookies.get(PARENT_SESSION_COOKIE)?.value);
  if (!claims) {
    return NextResponse.json(
      { error: 'You are not signed in, so there is nothing to sign out of.' },
      { status: 401 }
    );
  }

  const revoked = await revokeParentSessions(createServiceRoleClient(), claims.sub);

  if (revoked.status === 'no-column') {
    return NextResponse.json(
      { error: 'Signing out of every device is not switched on yet. Please use Logout on this phone.' },
      { status: 409 }
    );
  }
  if (revoked.status !== 'ok') {
    // 'not-found' (no row touched) or a database error: a failure, never success.
    console.error('[parent/auth/sign-out-everywhere] revoke failed:', revoked);
    return NextResponse.json(
      { error: 'We could not sign you out of your other devices. Nothing was changed. Please try again in a minute.' },
      { status: 500 }
    );
  }

  return clearParentCookies(NextResponse.json({ ok: true, sessionsRevokedAt: revoked.revokedAt }));
}
