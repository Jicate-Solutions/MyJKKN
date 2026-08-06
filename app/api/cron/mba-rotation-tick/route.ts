// =====================================================================
// MBA Team-Rotation tick (daily) — Part 3 of the MBA Teaching-Enterprise
// programme (spec specs/mba-team-rotation-and-faculty-2026-07-25.md).
// =====================================================================
// Advances every ACTIVE rotation cycle to today's period and reconciles the
// team members' department postings:
//   • (re)ACTIVATE each member's posting to their team's CURRENT-period area;
//   • EXPIRE the previous period's postings (need-to-know: access is lost on
//     rotate-out).
// Blackouts auto-pause: when today falls in a blackout gap (or before the start
// / past the end), the current period is NULL and the cycle writes nothing.
//
// All mutation happens inside the service-role SECDEF fn_mba_rotation_apply()
// (REVOKE anon/PUBLIC/authenticated; GRANT service_role) — the route only
// authenticates the cron and invokes it per active cycle. Fully idempotent:
// re-running the same day re-asserts the same active set and is a no-op.
//
// The period "advances" implicitly — fn_mba_rotation_apply derives the current
// period from today's date against the generated slot windows, so a daily tick
// moves the rota forward on its own with no stored pointer to drift.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
// OR `?secret=` query param (manual runs). Mirrors mba-associate-sync.
//
// Schedule in vercel.json: daily 05:07 (7 5 * * *) — off-peak, off the :00/:30
// marks to avoid the platform-wide cron pile-up.
// Created: 2026-07-25.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/mba-rotation-tick] CRON_SECRET not configured');
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/mba-rotation-tick] Unauthorized attempt');
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();

    // Every active cycle gets ticked. A cycle whose last period has passed is
    // auto-completed inside the RPC, so it drops out on the next run.
    const { data: cycles, error: cycleErr } = await (admin as any)
      .from('mba_rotation_cycles')
      .select('id, name')
      .eq('status', 'active');
    if (cycleErr) {
      console.error('[cron/mba-rotation-tick] cycle query error', cycleErr.message);
      return NextResponse.json(
        { ok: false, error: cycleErr.message, duration_ms: Date.now() - startTime },
        { status: 500 },
      );
    }

    const active = (cycles ?? []) as Array<{ id: string; name: string }>;
    let totalActivated = 0;
    let totalExpired = 0;
    let cyclesApplied = 0;
    let cyclesPaused = 0;
    const failures: Array<{ cycle_id: string; error: string }> = [];

    for (const cycle of active) {
      const { data, error } = await (admin as any).rpc('fn_mba_rotation_apply', {
        p_cycle_id: cycle.id,
      });
      if (error) {
        console.error(`[cron/mba-rotation-tick] apply error (${cycle.id})`, error.message);
        failures.push({ cycle_id: cycle.id, error: error.message });
        continue;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.current_period === null || row?.current_period === undefined) {
        cyclesPaused += 1; // blackout gap / not started / completed
      } else {
        cyclesApplied += 1;
        totalActivated += row?.postings_activated ?? 0;
        totalExpired += row?.postings_expired ?? 0;
      }
    }

    const duration_ms = Date.now() - startTime;
    console.log(
      `[cron/mba-rotation-tick] cycles ${active.length} (applied ${cyclesApplied}, paused ${cyclesPaused}), ` +
        `postings +${totalActivated} / -${totalExpired}, ${failures.length} failure(s), ${duration_ms}ms`,
    );

    // Top-level numeric keys for the Control Tower's summarize() (reads only
    // top-level allowlisted numerics).
    return NextResponse.json({
      ok: failures.length === 0,
      processed: active.length,
      applied: cyclesApplied,
      paused: cyclesPaused,
      activated: totalActivated,
      expired: totalExpired,
      failures,
      duration_ms,
    });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/mba-rotation-tick] Fatal', message);
    return NextResponse.json({ ok: false, error: message, duration_ms }, { status: 500 });
  }
}
