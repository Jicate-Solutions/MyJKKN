export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';

import {
  getPreviewClaimsFromCookies,
  writePreviewAudit,
  PREVIEW_COOKIE_NAME,
} from '@/lib/auth/preview-session';

// POST /api/users/permissions-audit/preview/end
// Ends the current preview session:
//   - Clears the sb-preview-session cookie
//   - Writes a 'preview_session_ended' audit entry
//
// Silently returns ok:true even if no session was active — calling this is
// always safe, so the UI can invoke it as a "clean up on exit" button.
export async function POST() {
  await connection();

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: any) { cookieStore.set(name, value, options); },
          remove(name: string, options: any) { cookieStore.set(name, '', { ...options, maxAge: 0 }); },
        },
      },
    );

    // ── Must be signed in (otherwise clearing the cookie serves no purpose) ──
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Read current preview claims (may be null if already expired) ───────
    const claims = await getPreviewClaimsFromCookies();

    // ── Audit if we had a live session ─────────────────────────────────────
    if (claims) {
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      await writePreviewAudit({
        actionType: 'preview_session_ended',
        actorUserId: claims.originator,
        actorName: callerProfile?.full_name || callerProfile?.email || 'Unknown',
        targetUserId: claims.sub,
        mode: claims.mode,
        sessionId: claims.sessionId,
        description: `${callerProfile?.full_name || callerProfile?.email || 'Super admin'} ended preview session`,
      });
    }

    // ── Clear cookie ───────────────────────────────────────────────────────
    const res = NextResponse.json({ ok: true });
    res.cookies.set(PREVIEW_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return res;
  } catch (err) {
    console.error('[preview/end] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
