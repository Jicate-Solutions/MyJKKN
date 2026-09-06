// =====================================================================
// MBA Associate role sync (daily) — PR-4 of the MBA Teaching-Enterprise
// Improvement Board (spec specs/mba-improvement-board-design-2026-07-23.md).
// =====================================================================
// Re-derives the current MBA Management Associate set from the enrolment RULE
// and reconciles the 'mba_associate' role membership:
//   • ADDs the role to newly-matching learners;
//   • REMOVEs it from anyone who no longer matches (a leaver loses access;
//     their filed ideas/summaries STAY — those key on author_id and RLS checks
//     the VIEWER's perms, not the author's current role);
//   • keeps the analytics-only 'mba_associate' cohort aligned to the same set.
//
// All mutation happens inside the service-role SECDEF fn_mba_associate_sync()
// (REVOKE anon/PUBLIC/authenticated; GRANT service_role) — the route only
// authenticates the cron and invokes it. Fully idempotent: a second run the
// same day is a no-op (ON CONFLICT DO NOTHING on adds, NOT EXISTS on removes).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
// OR `?secret=` query param (manual runs). Mirrors improvement-rank-ideas.
//
// Schedule in vercel.json: daily 04:53 (53 4 * * *) — off-peak, off the :00/:30
// marks to avoid the platform-wide cron pile-up.
// Created: 2026-07-24.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/mba-associate-sync] CRON_SECRET not configured');
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/mba-associate-sync] Unauthorized attempt');
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc('fn_mba_associate_sync');
    if (error) {
      console.error('[cron/mba-associate-sync] RPC error', error.message);
      return NextResponse.json(
        { ok: false, error: error.message, duration_ms: Date.now() - startTime },
        { status: 500 },
      );
    }

    // The RPC returns a single row (TABLE-returning fn → array of one).
    const summary = Array.isArray(data) ? data[0] : data;
    const duration_ms = Date.now() - startTime;
    console.log(
      `[cron/mba-associate-sync] role +${summary?.role_added ?? 0} / -${summary?.role_removed ?? 0} ` +
        `(total ${summary?.role_total ?? 0}), cohort +${summary?.cohort_added ?? 0} / -${summary?.cohort_removed ?? 0}, ` +
        `${duration_ms}ms`,
    );
    return NextResponse.json({ ok: true, ...summary, duration_ms });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/mba-associate-sync] Fatal', message);
    return NextResponse.json({ ok: false, error: message, duration_ms }, { status: 500 });
  }
}
