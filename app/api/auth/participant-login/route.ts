// app/api/auth/participant-login/route.ts
//
// POST — sign in an external course participant with their JKKN ID.
//
// WHY THIS ROUTE EXISTS
// /auth/login is Google OAuth only. An external participant has no Google
// account and usually no email at all, so they were provisioned against a
// synthetic participants.jkkn.local address that nobody knows or should know.
// What they DO have is a JKKN ID and a temporary password. This route is the
// only thing that turns those into a session.
//
// THE ADDRESS NEVER REACHES THE BROWSER
// Resolution happens entirely server-side: JKKN ID -> profile id (service-role
// RPC) -> auth identity -> signInWithPassword. A route that merely *returned*
// the email would be a JKKN-ID-to-account oracle, and a JKKN ID is six digits
// plus a check digit — trivially enumerable.
//
// TWO CLIENTS, both necessary:
//   • admin (service role) resolves the id. fn_resolve_participant_jkkn_id is
//     granted to service_role alone, and auth.admin.getUserById is an admin
//     call. The caller here is UNAUTHENTICATED, so nothing else could read it.
//   • createClient() is the cookie-bound SSR client. signInWithPassword must go
//     through it, because that is what writes the session cookies; the service
//     client has no cookie jar and its sign-in would evaporate.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Per-IP, in-memory. Resets on redeploy and is per-instance — a speed bump
// against casual guessing, not a security control. It matters more here than on
// most routes: the username space is six digits, so an unthrottled endpoint is
// a credential-stuffing target. Supabase's own auth throttling is the backstop.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= MAX_ATTEMPTS) return true;
  entry.count++;
  return false;
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Accepts "391840-6", "3918406" and stray spacing — people retype these from
 *  paper. Normalised to the stored NNNNNN-C form before lookup. */
function normaliseJkknId(raw: string): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length !== 7) return null;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

// One message for every failure mode. Distinguishing "no such JKKN ID" from
// "wrong password" would confirm which six-digit numbers are real, which is the
// enumeration this route exists to avoid.
const GENERIC_FAILURE = 'That JKKN ID and password do not match.';

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (rateLimited(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const { jkknId, password } = (body ?? {}) as { jkknId?: string; password?: string };

    const normalised = normaliseJkknId(jkknId ?? '');
    if (!normalised || !password) {
      return NextResponse.json({ ok: false, error: GENERIC_FAILURE }, { status: 401 });
    }

    const admin = serviceClient();

    const { data: profileId, error: resolveError } = await admin.rpc(
      'fn_resolve_participant_jkkn_id',
      { p_jkkn_id: normalised } as any,
    );

    if (resolveError) {
      console.error('[participant-login] resolve failed:', resolveError.message);
      return NextResponse.json(
        { ok: false, error: 'Could not sign you in right now. Please try again.' },
        { status: 500 },
      );
    }
    if (!profileId) {
      return NextResponse.json({ ok: false, error: GENERIC_FAILURE }, { status: 401 });
    }

    // profiles.id === auth.users.id in this codebase, so the profile id IS the
    // auth user id.
    const { data: authUser, error: userError } =
      await admin.auth.admin.getUserById(String(profileId));

    const email = authUser?.user?.email;
    if (userError || !email) {
      console.error('[participant-login] no auth identity for profile', profileId);
      return NextResponse.json({ ok: false, error: GENERIC_FAILURE }, { status: 401 });
    }

    // Through the COOKIE-BOUND client: this is what actually establishes the
    // session. The service client above has no cookie jar.
    const supabase = await createClient();
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signIn?.user) {
      return NextResponse.json({ ok: false, error: GENERIC_FAILURE }, { status: 401 });
    }

    // Never the email, never the profile id — the client needs neither, and the
    // whole point of resolving server-side is that they do not leave it.
    return NextResponse.json({ ok: true, redirectTo: '/my-courses' });
  } catch (e) {
    console.error('[participant-login] unexpected:', e);
    return NextResponse.json(
      { ok: false, error: 'Could not sign you in right now. Please try again.' },
      { status: 500 },
    );
  }
}
