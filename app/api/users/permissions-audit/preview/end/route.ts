export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
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
// Ends the current preview session:
//   1. Audit the end event (if a live preview existed)
//   2. Wipe the target's Supabase auth cookies from the browser
//   3. Restore the admin's original auth cookies from PREVIEW_ADMIN_BACKUP
//   4. Delete the preview marker + backup cookies
//
// Always safe to call — if no preview was active, it's effectively a no-op.
// ============================================================================

interface BackedUpCookie {
  name: string;
  value: string;
}

export async function POST() {
  await connection();

  try {
    const cookieStore = await cookies();

    // Read preview claims first so we can audit correctly — we need them
    // BEFORE any cookie mutation because the whole session is about to be
    // wiped.
    const claims = await getPreviewClaimsFromCookies();

    // ── Audit (best-effort) ────────────────────────────────────────────────
    if (claims) {
      // Look up the admin's profile via service-role. We can't trust the
      // current session — it's the target's, not the admin's.
      let actorName = 'Unknown';
      try {
        const serviceClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const { data: adminProfile } = await serviceClient
          .from('profiles')
          .select('full_name, email')
          .eq('id', claims.originator)
          .single();
        if (adminProfile) {
          actorName = adminProfile.full_name || adminProfile.email || 'Unknown';
        }
      } catch (auditLookupErr) {
        console.error(
          '[preview/end] Audit lookup failed — Non-fatal, proceeding',
          auditLookupErr,
        );
      }

      await writePreviewAudit({
        actionType: 'preview_session_ended',
        actorUserId: claims.originator,
        actorName,
        targetUserId: claims.sub,
        mode: claims.mode,
        sessionId: claims.sessionId,
        description: `${actorName} ended preview session`,
      });
    }

    // ── Build response: ALL cookie mutations are staged on this response ──
    const res = NextResponse.json({ ok: true });
    const secureFlag = process.env.NODE_ENV === 'production';

    // 1. Wipe the target's Supabase session from the browser using
    //    supabase-ssr's own adapter so chunk names (sb-<ref>-auth-token.*)
    //    are cleared using the same naming scheme Supabase used to write
    //    them. scope:'local' means we only forget the cookies; we don't
    //    revoke the token server-side (admin could re-preview any time).
    try {
      const wipeClient = createServerClient(
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
      await wipeClient.auth.signOut({ scope: 'local' });
    } catch (wipeErr) {
      console.error(
        '[preview/end] Session wipe failed — Non-fatal, continuing to restore admin',
        wipeErr,
      );
    }

    // 2. Restore admin's original auth cookies from the backup.
    const backupRaw = cookieStore.get(PREVIEW_ADMIN_BACKUP_COOKIE)?.value;
    if (backupRaw) {
      try {
        const backup = JSON.parse(backupRaw) as BackedUpCookie[];
        if (Array.isArray(backup)) {
          for (const c of backup) {
            if (typeof c?.name === 'string' && typeof c?.value === 'string') {
              res.cookies.set(c.name, c.value, {
                httpOnly: true,
                secure: secureFlag,
                sameSite: 'lax',
                path: '/',
              });
            }
          }
        }
      } catch (parseErr) {
        console.error(
          '[preview/end] Admin backup cookie parse failed — Admin will need to re-login',
          parseErr,
        );
      }
    }

    // 3. Delete the preview marker + backup cookies.
    res.cookies.set(PREVIEW_COOKIE_NAME, '', {
      httpOnly: true,
      secure: secureFlag,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    res.cookies.set(PREVIEW_ADMIN_BACKUP_COOKIE, '', {
      httpOnly: true,
      secure: secureFlag,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return res;
  } catch (err) {
    console.error('[preview/end] Fatal error — Returning 500', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
