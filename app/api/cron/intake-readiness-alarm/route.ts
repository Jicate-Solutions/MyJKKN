// =====================================================================
// Weekly intake-readiness alarm — four numbers per college to its Principal
// =====================================================================
// Director approval: rank 9 of the 2026-08-11 invisible-learners audit
// ("The alarm that fires before anyone has to ask"). Every Monday, per
// college, the four current-admission-year numbers:
//   1. paid-but-not-activated learners (invisible to attendance)
//   2. unplaced learners (no class group)
//   3. programmes with a cohort and ZERO timetabled class groups
//   4. learners admitted 7+ days ago with no bill of any kind
// Each college's Principal(s) get the numbers weekly (zeros included — a
// silent week must be distinguishable from a broken alarm). Any metric above
// zero for TWO CONSECUTIVE weeks additionally escalates to the Director.
//
// All the logic lives in lib/services/academic/intake-readiness-alarm.ts
// (Next.js forbids extra exports from a route.ts, and the escalation rule
// must be unit-testable). The numbers come from the service_role-only RPC
// fn_intake_readiness_weekly_alarm (migration 20260825020000 — a FILE until
// the Director applies it; before that this route fails loudly, it does not
// pretend).
//
// SCHEDULING lives in the database, not vercel.json: `crons` already sits at
// Vercel's hard 100-entry cap, and a 101st entry fails EVERY deploy. The
// migration seeds an ai_routine_schedules row ('intake-readiness-alarm',
// Mondays 08:45 IST) and /api/cron/ai-routine-dispatcher fires this route
// with the CRON_SECRET Bearer token. The dispatcher itself runs daily-or-
// finer, so this route ALSO self-gates on "is it Monday in IST" — an
// operator flipping days_of_week from /admin/ai-routines cannot silently
// turn the weekly alarm into a daily one. `?force=1` bypasses the weekday
// gate for a manual run (idempotency keys still dedup deliveries).
//
// STATE for the two-consecutive-weeks rule: this routine's own ai_jobs rows
// (job_type 'intake_readiness.weekly_alarm') — no new state table.
// Delivery: deliverInApp (check-then-insert on notifications.idempotency_key;
// .upsert(onConflict) would fail at runtime against that PARTIAL unique
// index).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (the dispatcher
// sends it) OR `?secret=` for a manual run. `?dryRun=1` computes and counts
// but writes nothing. Does not call Claude. Created: 2026-08-13.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  istWeekInfo,
  runIntakeReadinessAlarm,
} from '@/lib/services/academic/intake-readiness-alarm';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const forceParam = request.nextUrl.searchParams.get('force');
  const force = forceParam === '1' || forceParam === 'true';
  const dryParam = request.nextUrl.searchParams.get('dryRun');
  const dryRun = dryParam === '1' || dryParam === 'true';

  // Weekly self-gate. The dispatcher can only fire what its schedule row says,
  // but that row is operator-editable — the weekday check is the routine's own
  // guarantee. Skipping is a SUCCESS (the dispatcher's status line reads
  // `HTTP 200 · skipped 1`), not an error.
  const week = istWeekInfo();
  if (!week.isMonday && !force) {
    return NextResponse.json({
      ok: true,
      skipped: 1,
      reason: 'not Monday in IST — weekly alarm runs Mondays only (pass ?force=1 to override)',
      week_start: week.weekStart,
      elapsed_ms: Date.now() - started,
    });
  }

  const admin = createServiceRoleClient();
  const result = await runIntakeReadinessAlarm(admin, { dryRun });

  if (!result.ok) {
    // A sweep that fails quietly is the exact failure this alarm exists to
    // end. Until migration 20260825020000 is applied, this is where the
    // missing RPC shows up — loudly.
    return NextResponse.json(
      { ...result, elapsed_ms: Date.now() - started },
      { status: 500 },
    );
  }

  // Keys named for the dispatcher's status summariser (sent / skipped /
  // escalations / flagged), so "last run" reads like a result, not a stall.
  return NextResponse.json({ ...result, elapsed_ms: Date.now() - started });
}
