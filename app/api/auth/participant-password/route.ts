// app/api/auth/participant-password/route.ts
//
// POST — a course participant changes their own password.
//
// WHY IT EXISTS. A participant is provisioned with a TEMPORARY password an
// administrator generated, read out or emailed. Until now there was no way to
// replace it: /auth/login is Google OAuth only, /auth/participant-login has no
// reset link (someone with no email cannot receive one), and the admin-side
// reissue only mints another temporary one. So every participant was left using
// a credential a third party had seen.
//
// THE CURRENT PASSWORD IS RE-VERIFIED, and that is the whole point of doing this
// server-side. Supabase's client updateUser({ password }) changes it from the
// session alone unless "Secure password change" happens to be enabled on the
// project — so a borrowed session, a shared laptop or an unlocked phone could
// lock the real owner out of their own fee account. Proof of the current
// password is required here regardless of project settings.
//
// The re-auth runs on a THROWAWAY client with persistSession false. Signing in
// through the cookie-bound client would rotate the caller's live session as a
// side effect of a check.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/with-auth';
import { createClient as createCookieClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MIN_LENGTH = 8;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword } = (body ?? {}) as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { ok: false, error: 'Enter your current and new password.' },
        { status: 400 },
      );
    }
    if (newPassword.length < MIN_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `Your new password must be at least ${MIN_LENGTH} characters.` },
        { status: 400 },
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { ok: false, error: 'Your new password must be different from the current one.' },
        { status: 400 },
      );
    }

    const admin = serviceClient();

    // Participants only. Staff and learners sign in with Google and have no
    // password to change — offering them this endpoint would be a way to ATTACH
    // one to an account that deliberately has none.
    const { data: profile } = await admin
      .from('profiles')
      .select('is_external_participant, is_active')
      .eq('id', auth.user.id)
      .maybeSingle();

    const p = profile as any;
    if (!p?.is_external_participant || !p?.is_active) {
      return NextResponse.json(
        { ok: false, error: 'This account does not use a password.' },
        { status: 403 },
      );
    }

    const { data: authUser } = await admin.auth.admin.getUserById(auth.user.id);
    const email = authUser?.user?.email;
    if (!email) {
      console.error('[participant-password] no auth identity for', auth.user.id);
      return NextResponse.json(
        { ok: false, error: 'Could not change your password. Please contact the institution.' },
        { status: 500 },
      );
    }

    // ── prove they know the current password ───────────────────────────────
    const probe = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { error: reauthError } = await probe.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (reauthError) {
      // Deliberately not distinguishing "wrong password" from anything else,
      // and deliberately not logging the attempt with the address.
      return NextResponse.json(
        { ok: false, error: 'Your current password is not correct.' },
        { status: 401 },
      );
    }

    // Sign the probe out so its short-lived token is not left valid.
    await probe.auth.signOut().catch(() => {});

    const { error: updateError } = await admin.auth.admin.updateUserById(auth.user.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error('[participant-password] update failed:', updateError.message);
      return NextResponse.json(
        { ok: false, error: `Could not change your password: ${updateError.message}` },
        { status: 500 },
      );
    }

    // ── keep them signed in ────────────────────────────────────────────────
    // admin.updateUserById DOES invalidate the caller's existing session —
    // verified: a request with the pre-change cookie 307'd to login. Left
    // unhandled, changing your password silently signs you out of the page you
    // are standing on, which reads as a failure of the thing that just
    // succeeded.
    //
    // So re-establish the session through the COOKIE-BOUND client with the new
    // password. This is the one sign-in that must write cookies, unlike the
    // throwaway probe above.
    const cookieClient = await createCookieClient();
    const { error: refreshError } = await cookieClient.auth.signInWithPassword({
      email,
      password: newPassword,
    });

    if (refreshError) {
      // The password DID change; only the session refresh failed. Say so
      // precisely — telling them it failed would invite a second change
      // attempt with a password that is now the old one.
      console.error('[participant-password] session refresh failed:', refreshError.message);
      return NextResponse.json({ ok: true, signedOut: true });
    }

    return NextResponse.json({ ok: true, signedOut: false });
  },
  { allowApiKey: false },
);
