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
// Ends the current preview by RE-ISSUING a fresh Supabase session for the
// admin — not restoring one from a cookie backup.
//
// Why re-issue instead of restore?
//   Earlier versions backed up admin's sb-*-auth-token.* cookies into a
//   single sb-preview-admin-backup cookie as JSON. Supabase tokens are ~2KB
//   each chunk; two chunks serialized often exceed the browser's ~4KB single-
//   cookie limit, are silently truncated, and /end reads garbage. Admin
//   lands on the login page with no session.
//
//   Fix: don't store cookies. Use admin.generateLink + verifyOtp with the
//   admin's email (from the signed preview JWT's originator_email claim) to
//   mint a brand-new session. Same primitive we used to impersonate the
//   target on /start — just pointed at the admin this time. Zero cookie-size
//   ceiling, no stale-token drift, no collision with supabase-ssr's adapter.
//
// Security: admin.generateLink doesn't email the user (admin.* skips
// delivery). originator_email is signed by us, so an attacker can't swap
// emails without the signing secret.
// ============================================================================

export async function POST() {
  await connection();

  try {
    const cookieStore = await cookies();

    // Step 1 — read preview claims first (before any cookie mutation).
    const claims = await getPreviewClaimsFromCookies();

    // Service-role client used for both the DB lookups and the regen flow.
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let adminEmail: string | null = null;
    let actorName = 'Unknown';
    let actorRole: string | null = null;
    let targetEmail: string | null = null;

    // Step 2 — audit end event + gather admin email for regen.
    if (claims) {
      try {
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
          adminEmail = adminProfile.email ?? null;
          actorName = adminProfile.full_name || adminProfile.email || 'Unknown';
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

      // Fall back to JWT claim if DB lookup returned nothing.
      if (!adminEmail && claims.originator_email) {
        adminEmail = claims.originator_email;
      }

      await writePreviewAudit({
        actionType: 'preview_session_ended',
        actorUserId: claims.originator,
        actorName,
        actorEmail: adminEmail,
        actorRole,
        targetUserId: claims.sub,
        targetEmail,
        mode: claims.mode,
        sessionId: claims.sessionId,
        description: `${actorName} ended preview session`,
      });
    }

    // Step 3 — build response; all cookie mutations staged on it.
    const res = NextResponse.json({ ok: true });
    const secureFlag = process.env.NODE_ENV === 'production';
    const baseOpts = {
      httpOnly: true,
      secure: secureFlag,
      sameSite: 'lax' as const,
      path: '/',
    };

    // Step 4 — re-issue admin session via magic-link exchange.
    let adminSessionInstalled = false;
    if (adminEmail) {
      try {
        const { data: linkData, error: linkError } =
          await serviceClient.auth.admin.generateLink({
            type: 'magiclink',
            email: adminEmail,
          });

        if (linkError || !linkData?.properties?.hashed_token) {
          console.error(
            '[preview/end] admin.generateLink failed — Admin will need to re-login',
            linkError,
          );
        } else {
          const exchangeClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          const { data: otpData, error: otpError } =
            await exchangeClient.auth.verifyOtp({
              token_hash: linkData.properties.hashed_token,
              type: 'magiclink',
            });

          if (otpError || !otpData?.session) {
            console.error(
              '[preview/end] verifyOtp for admin failed — Admin will need to re-login',
              otpError,
            );
          } else {
            // Install admin's fresh session cookies on the response.
            const adminSupabase = createServerClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              {
                cookies: {
                  get(name: string) {
                    return cookieStore.get(name)?.value;
                  },
                  set(name: string, value: string, options: any) {
                    res.cookies.set(name, value, { ...options, ...baseOpts });
                  },
                  remove(name: string, options: any) {
                    res.cookies.set(name, '', {
                      ...options,
                      ...baseOpts,
                      maxAge: 0,
                    });
                  },
                },
              },
            );
            const { error: setSessionError } = await adminSupabase.auth.setSession({
              access_token: otpData.session.access_token,
              refresh_token: otpData.session.refresh_token,
            });

            if (setSessionError) {
              console.error(
                '[preview/end] setSession for admin failed — Admin will need to re-login',
                setSessionError,
              );
            } else {
              adminSessionInstalled = true;
            }
          }
        }
      } catch (regenErr) {
        console.error(
          '[preview/end] Admin session regeneration threw — Admin will need to re-login',
          regenErr,
        );
      }
    }

    // Step 5 — if regen failed, wipe target's session so browser ends up clean.
    // Otherwise supabase-ssr's setSession above already overwrote them with
    // the admin's fresh session.
    if (!adminSessionInstalled) {
      for (const c of cookieStore.getAll()) {
        if (c.name.startsWith('sb-') && c.name.includes('-auth-token')) {
          res.cookies.set(c.name, '', { ...baseOpts, maxAge: 0 });
        }
      }
    }

    // Step 6 — delete preview marker + legacy backup cookies.
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
