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
// Ends the current preview session:
//   1. Audit the end event (if a live preview existed) via service-role
//   2. Replace every sb-*-auth-token* cookie on the browser with the admin's
//      backed-up value (or delete it if not in the backup).
//   3. Delete the preview marker + backup cookies.
//
// IMPORTANT — why we DO NOT call supabase.auth.signOut() any more:
//   Earlier versions used `signOut({scope: 'local'})` to wipe cookies. That
//   call sets Set-Cookie headers for each auth-token chunk to EMPTY via
//   supabase-ssr's adapter. We then tried to set the SAME cookie names back
//   to the admin's backup values on the same response. In practice the two
//   sets of Set-Cookie headers collided and the browser ended up with either
//   empty or the "last wins" cookie — inconsistent across chunks — so the
//   admin landed on `/` fully logged out.
//
//   The fix: skip the wipe, just write the admin's backed-up cookie values
//   directly. Any cookie whose name matches sb-*-auth-token* but is NOT in
//   the backup gets explicitly deleted so orphan target chunks can't leak.
// ============================================================================

interface BackedUpCookie {
  name: string;
  value: string;
}

export async function POST() {
  await connection();

  try {
    const cookieStore = await cookies();

    // Read preview claims FIRST — we need them before any cookie mutation
    // because the session is about to be restored to the admin's.
    const claims = await getPreviewClaimsFromCookies();

    // ── Audit (best-effort) ────────────────────────────────────────────────
    if (claims) {
      // Look up the admin's + target's profiles via service-role. We can't
      // trust the current session — it's the target's, not the admin's.
      let actorName = 'Unknown';
      let actorEmail: string | null = null;
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
          actorEmail = adminProfile.email ?? null;
          actorRole = adminProfile.role ?? null;
        }
        if (targetProfile) {
          targetEmail = targetProfile.email ?? null;
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
        actorEmail,
        actorRole,
        targetUserId: claims.sub,
        targetEmail,
        mode: claims.mode,
        sessionId: claims.sessionId,
        description: `${actorName} ended preview session`,
      });
    }

    // ── Build response: ALL cookie mutations are staged on this response ──
    const res = NextResponse.json({ ok: true });
    const secureFlag = process.env.NODE_ENV === 'production';

    // Parse the backup (may be absent if preview expired and cookie already
    // rolled off, or if the admin hit /end without ever starting).
    const backupRaw = cookieStore.get(PREVIEW_ADMIN_BACKUP_COOKIE)?.value;
    const backup: BackedUpCookie[] = (() => {
      if (!backupRaw) return [];
      try {
        const parsed = JSON.parse(backupRaw);
        return Array.isArray(parsed) ? (parsed as BackedUpCookie[]) : [];
      } catch (parseErr) {
        console.error(
          '[preview/end] Admin backup cookie parse failed — Admin will need to re-login',
          parseErr,
        );
        return [];
      }
    })();

    const backupByName = new Map<string, string>();
    for (const c of backup) {
      if (typeof c?.name === 'string' && typeof c?.value === 'string') {
        backupByName.set(c.name, c.value);
      }
    }

    // Collect every current sb-*-auth-token* cookie on the browser (currently
    // the TARGET's session). For each one: if the admin had it in the backup,
    // overwrite with the admin's value; otherwise delete it (it's an orphan
    // target chunk that mustn't be left behind).
    const currentAuthCookies = cookieStore
      .getAll()
      .filter((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));

    const processedNames = new Set<string>();
    for (const c of currentAuthCookies) {
      processedNames.add(c.name);
      const adminValue = backupByName.get(c.name);
      if (adminValue !== undefined) {
        res.cookies.set(c.name, adminValue, {
          httpOnly: true,
          secure: secureFlag,
          sameSite: 'lax',
          path: '/',
        });
      } else {
        res.cookies.set(c.name, '', {
          httpOnly: true,
          secure: secureFlag,
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
        });
      }
    }

    // Any cookie in the backup that DOES NOT currently exist on the browser
    // (e.g. the admin had more chunks than the target) — restore those too.
    for (const [name, value] of backupByName.entries()) {
      if (processedNames.has(name)) continue;
      res.cookies.set(name, value, {
        httpOnly: true,
        secure: secureFlag,
        sameSite: 'lax',
        path: '/',
      });
    }

    // Delete preview marker + backup cookies.
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
