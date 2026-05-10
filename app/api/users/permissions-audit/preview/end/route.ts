export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';

import {
  getPreviewClaimsFromCookies,
  writePreviewAudit,
  PREVIEW_COOKIE_NAME,
} from '@/lib/auth/preview-session';
import { PREVIEW_ADMIN_BACKUP_COOKIE } from '../start/route';

// ============================================================================
// POST /api/users/permissions-audit/preview/end
//
// Ends the preview session by performing a CLEAN LOGOUT — clears the target's
// Supabase auth cookies and the preview marker cookie, then returns. The
// client navigates to /auth/login afterwards so the admin signs back in fresh.
//
// Why a clean logout instead of regenerating the admin's session?
//   Prior implementations tried two approaches and both had reliability issues:
//     1. Cookie backup: stored admin's sb-*-auth-token.* cookies as JSON in
//        a single sb-preview-admin-backup cookie. Two chunks × ~2KB each
//        often exceeded the browser's ~4KB single-cookie limit, got silently
//        truncated, and /end read garbage.
//     2. admin.generateLink + verifyOtp: minted a fresh admin session at exit.
//        Worked most of the time but failed at three points (generateLink,
//        verifyOtp, setSession) — when any failed, the admin landed on the
//        login page anyway with confusing partial-state cookies still set.
//
// The cleaner model: always log the admin out at exit. Single failure mode
// (cookies don't get cleared → user re-tries), no surprise session swaps,
// and matches the refresh-during-preview behavior so users are never confused
// about which identity is active.
// ============================================================================

export async function POST() {
  await connection();

  try {
    const cookieStore = await cookies();

    // Step 1 — read preview claims (so we can audit the end event before
    // touching cookies). Failure here is non-fatal; cookies still get cleared.
    const claims = await getPreviewClaimsFromCookies();

    // Step 2 — audit end event. Best-effort; never blocks the cookie clear.
    if (claims) {
      let actorName = 'Unknown';
      let actorEmail: string | null = claims.originator_email ?? null;
      let actorRole: string | null = null;
      let targetEmail: string | null = null;

      try {
        const serviceClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const [{ data: adminProfile }, { data: targetProfile }] = await Promise.all([
          serviceClient
            .from('profiles')
            .select('full_name, email, role')
            .eq('id', claims.originator)
            .single(),
          serviceClient
            .from('profiles')
            .select('email')
            .eq('id', claims.sub)
            .single(),
        ]);
        if (adminProfile) {
          actorName = adminProfile.full_name || adminProfile.email || 'Unknown';
          actorEmail = adminProfile.email ?? actorEmail;
          actorRole = adminProfile.role ?? null;
        }
        if (targetProfile) {
          targetEmail = targetProfile.email ?? null;
        }
      } catch (lookupErr) {
        console.error(
          '[preview/end] Admin/target lookup failed — Non-fatal, proceeding',
          lookupErr,
        );
      }

      await writePreviewAudit({
        actionType: 'preview_session_ended',
        actorUserId: claims.originator,
        actorName,
        actorEmail,
        actorRole,
        targetUserId: claims.sub,
        targetEmail,
        mode: claims.mode,
        sessionId: claims.sessionId,
        description: `${actorName} ended preview session (clean logout)`,
      });
    }

    // Step 3 — build response with all cookie deletions staged.
    const res = NextResponse.json({ ok: true });
    const secureFlag = process.env.NODE_ENV === 'production';
    const baseOpts = {
      httpOnly: true,
      secure: secureFlag,
      sameSite: 'lax' as const,
      path: '/',
    };

    // Step 4 — wipe ALL Supabase auth-token cookies (target's session). The
    // browser may have multiple chunks (sb-<project>-auth-token.0, .1, etc).
    for (const c of cookieStore.getAll()) {
      if (c.name.startsWith('sb-') && c.name.includes('-auth-token')) {
        res.cookies.set(c.name, '', { ...baseOpts, maxAge: 0 });
      }
    }

    // Step 5 — delete preview marker + legacy backup cookies.
    res.cookies.set(PREVIEW_COOKIE_NAME, '', { ...baseOpts, maxAge: 0 });
    res.cookies.set(PREVIEW_ADMIN_BACKUP_COOKIE, '', { ...baseOpts, maxAge: 0 });

    return res;
  } catch (err) {
    console.error('[preview/end] Fatal error — Returning 500', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
