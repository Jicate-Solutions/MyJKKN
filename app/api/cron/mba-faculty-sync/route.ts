// =====================================================================
// MBA Faculty role sync (daily) — Part 1 of the MBA Team-Rotation build
// (spec specs/mba-team-rotation-and-faculty-2026-07-25.md).
// =====================================================================
// Re-derives the current MBA-department staff set from department membership
// and reconciles the 'mba_faculty' role:
//   • ADDs the role to newly-matching staff (joiners);
//   • REMOVEs it from anyone who no longer matches (a leaver loses management
//     access; their authored artifacts STAY — those key on author_id and RLS
//     checks the VIEWER's perms, not the author's current role).
//
// All mutation happens inside the service-role SECDEF fn_mba_faculty_sync()
// (REVOKE anon/PUBLIC/authenticated; GRANT service_role) — the route only
// authenticates the cron and invokes it. Fully idempotent: a second run the
// same day is a no-op (ON CONFLICT DO NOTHING on adds, NOT EXISTS on removes).
// Mirrors app/api/cron/mba-associate-sync (the learner-side twin).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
// OR `?secret=` query param (manual runs).
//
// Schedule in vercel.json: daily 05:19 (19 5 * * *) — off-peak, off the :00/:30
// marks to avoid the platform-wide cron pile-up, and off the mba-associate-sync
// slot (04:53).
// Created: 2026-07-25.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/mba-faculty-sync] CRON_SECRET not configured');
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/mba-faculty-sync] Unauthorized attempt');
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc('fn_mba_faculty_sync');
    if (error) {
      console.error('[cron/mba-faculty-sync] RPC error', error.message);
      return NextResponse.json(
        { ok: false, error: error.message, duration_ms: Date.now() - startTime },
        { status: 500 },
      );
    }

    // The RPC returns a single row (TABLE-returning fn → array of one).
    const summary = Array.isArray(data) ? data[0] : data;
    const duration_ms = Date.now() - startTime;
    console.log(
      `[cron/mba-faculty-sync] role +${summary?.role_added ?? 0} / -${summary?.role_removed ?? 0} ` +
        `(total ${summary?.role_total ?? 0}), ${duration_ms}ms`,
    );
    return NextResponse.json({ ok: true, ...summary, duration_ms });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/mba-faculty-sync] Fatal', message);
    return NextResponse.json({ ok: false, error: message, duration_ms }, { status: 500 });
  }
}
