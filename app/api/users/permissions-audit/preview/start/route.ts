export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';

import {
  mintPreviewToken,
  writePreviewAudit,
  PREVIEW_COOKIE_NAME,
  canUseWriteMode,
  type PreviewMode,
} from '@/lib/auth/preview-session';

// ============================================================================
// POST /api/users/permissions-audit/preview/start
//
// Real impersonation: swaps the caller's Supabase session for the target's
// session cookies so every downstream query (RLS, auth.uid(), etc.) sees the
// target user. The caller's original session is backed up in a separate cookie
// so /preview/end can restore it.
//
// Flow
//   1. Validate caller is signed in + super admin
//   2. Validate target exists + no nested preview
//   3. If mode=write, caller email must match DIRECTOR_EMAIL
//   4. Back up the caller's sb-*-auth-token.* cookies → PREVIEW_ADMIN_BACKUP
//   5. Generate a magic-link session for the target via service-role
//   6. Exchange the hashed_token for a real access_token + refresh_token
//   7. Overwrite the browser's Supabase auth cookies with the target's session
//      (delegated to supabase-ssr's cookie adapter via auth.setSession)
//   8. Set the preview marker cookie (mode, sessionId) for banner + middleware
//   9. Audit the start event
// ============================================================================

// 15 minutes — mirrors the preview JWT exp.
const PREVIEW_TTL_SECONDS = 15 * 60;

// NOTE: We no longer back up the admin's auth cookies into `sb-preview-admin-backup`.
// Previous implementations (PR #181) stored admin's sb-*-auth-token.* cookies as
// a JSON blob in a single cookie. Supabase auth tokens are ~2KB each; with chunking
// the serialized backup frequently exceeded the ~4KB cookie size limit and was
// silently truncated/dropped by the browser — so /preview/end had nothing to
// restore, leaving the admin logged out.
//
// The fix: /preview/end doesn't RESTORE the admin's session. It RE-ISSUES a fresh
// one using admin.generateLink + verifyOtp with the admin's email (read from the
// preview JWT's originator_email claim, which is signed and trustworthy). Same
// primitive we use here to impersonate the target, but pointed at the admin.
// Zero cookie-size constraints, no stale-token worries.
//
// For backwards compat, we still EXPORT the old cookie name constant so any code
// that imported it won't break at build time. It's no longer set or read.
export const PREVIEW_ADMIN_BACKUP_COOKIE = 'sb-preview-admin-backup';

export async function POST(request: NextRequest) {
  await connection();

  try {
    const cookieStore = await cookies();

    // ── Caller-context Supabase client (reads request cookies) ─────────────
    const callerSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          },
        },
      },
    );

    // Step 1 — authenticated?
    const {
      data: { user },
      error: userError,
    } = await callerSupabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2 — super admin?
    const { data: callerProfile, error: profileError } = await callerSupabase
      .from('profiles')
      .select('id, email, full_name, role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !callerProfile ||
      (callerProfile.is_super_admin !== true && callerProfile.role !== 'super_admin')
    ) {
      return NextResponse.json(
        { error: 'Forbidden — only super admins can preview other users' },
        { status: 403 },
      );
    }

    // Step 3 — no nested preview
    if (cookieStore.get(PREVIEW_COOKIE_NAME)?.value) {
      return NextResponse.json(
        { error: 'A preview session is already active. Exit it before starting another.' },
        { status: 409 },
      );
    }

    // Step 4 — parse body
    const body = await request.json().catch(() => ({}));
    const { targetUserId, mode: requestedMode } = body as {
      targetUserId?: string;
      mode?: PreviewMode;
    };

    if (!targetUserId || typeof targetUserId !== 'string') {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
    }
    if (targetUserId === callerProfile.id) {
      return NextResponse.json({ error: 'Cannot preview yourself' }, { status: 400 });
    }

    // Step 5 — mode gate
    const isWriteRequested = requestedMode === 'write';
    if (isWriteRequested && !canUseWriteMode(callerProfile.email)) {
      return NextResponse.json(
        {
          error: `Write-mode preview is restricted to the director and the MyJKKN lead developer. You may preview in read-only mode.`,
        },
        { status: 403 },
      );
    }
    const effectiveMode: PreviewMode = isWriteRequested ? 'write' : 'read';

    // Step 6 — target exists?
    const { data: target, error: targetError } = await callerSupabase
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('id', targetUserId)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }
    if (!target.email) {
      return NextResponse.json(
        {
          error:
            'Target user has no email on file. Cannot create a preview session for this account.',
        },
        { status: 422 },
      );
    }

    // Step 7 — mint a real Supabase session for the target using service-role
    // admin.generateLink. This does NOT send an email (admin.* functions skip
    // the email delivery step); it just produces a hashed_token that we
    // immediately exchange for a session.
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email: target.email,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[preview/start] generateLink failed:', linkError);
      return NextResponse.json(
        { error: 'Could not create a preview session for this user (generateLink failed).' },
        { status: 500 },
      );
    }

    // Exchange the hashed_token for a real session. This call is made with
    // the anon key — the token itself IS the authentication. We use a
    // throwaway client so we don't pollute any other auth state.
    const exchangeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: otpData, error: otpError } = await exchangeClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });
    if (otpError || !otpData?.session) {
      console.error('[preview/start] verifyOtp failed:', otpError);
      return NextResponse.json(
        { error: 'Could not exchange preview token for a session.' },
        { status: 500 },
      );
    }

    const targetSession = otpData.session;

    // Step 8 — build the response and install both cookie sets on it.
    // (No admin-backup cookie; /end regenerates the admin session fresh.)
    const sessionId = randomUUID();
    const previewToken = await mintPreviewToken({
      targetUserId: target.id,
      originatorId: callerProfile.id,
      originatorEmail: callerProfile.email ?? '',
      mode: effectiveMode,
      sessionId,
    });

    const res = NextResponse.json({
      ok: true,
      sessionId,
      mode: effectiveMode,
      expiresInSeconds: PREVIEW_TTL_SECONDS,
      target: {
        id: target.id,
        email: target.email,
        fullName: target.full_name,
        role: target.role,
      },
    });

    const secureFlag = process.env.NODE_ENV === 'production';

    // 8a — set preview marker cookie (banner + middleware read this)
    res.cookies.set(PREVIEW_COOKIE_NAME, previewToken, {
      httpOnly: true,
      secure: secureFlag,
      sameSite: 'lax',
      path: '/',
      maxAge: PREVIEW_TTL_SECONDS,
    });

    // 8b — overwrite Supabase auth cookies with target's session. We use
    // supabase-ssr's own adapter on the RESPONSE so the cookie format + name
    // chunking matches exactly what @supabase/ssr expects to read back on
    // subsequent requests.
    const targetSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            res.cookies.set(name, value, {
              ...options,
              secure: secureFlag,
              sameSite: 'lax',
              path: '/',
            });
          },
          remove(name: string, options: any) {
            res.cookies.set(name, '', { ...options, maxAge: 0, path: '/' });
          },
        },
      },
    );
    const { error: setSessionError } = await targetSupabase.auth.setSession({
      access_token: targetSession.access_token,
      refresh_token: targetSession.refresh_token,
    });
    if (setSessionError) {
      console.error('[preview/start] setSession failed:', setSessionError);
      return NextResponse.json(
        { error: 'Could not install target session cookies.' },
        { status: 500 },
      );
    }

    // Step 10 — audit (best-effort; never blocks success)
    const targetLabel = target.full_name || target.email || target.id;
    await writePreviewAudit({
      actionType: 'preview_session_started',
      actorUserId: callerProfile.id,
      actorName: callerProfile.full_name || callerProfile.email || 'Unknown',
      actorEmail: callerProfile.email ?? null,
      actorRole: callerProfile.role ?? null,
      targetUserId: target.id,
      targetEmail: target.email,
      mode: effectiveMode,
      sessionId,
      description: `${callerProfile.full_name || callerProfile.email} started a ${effectiveMode} preview session as ${targetLabel}`,
      extra: {
        target_role: target.role,
      },
    });

    return res;
  } catch (err) {
    console.error('[preview/start] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
