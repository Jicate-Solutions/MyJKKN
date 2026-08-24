// =====================================================================
// Meetings 7-day auto-close — RETIRED 2026-08-21
// =====================================================================
// Director decision 2026-08-08 said a finished meeting nobody marked closes
// itself as 'completed' 7 days after it ended.
//
// REVERSED by the Director on 2026-08-21: "Stop closing them automatically.
// the EAO for director will manage this and followup."
//
// WHY. Measured on production 2026-08-21:
//
//   outcome_marked_by   status      count
//   (never marked)      completed      62
//   (never marked)      cancelled      29
//   (never marked)      confirmed      23
//
// outcome_marked_by is NULL on EVERY row. Two separate facts follow, and they
// are easy to conflate:
//
//   1. No meeting has ever been marked by a host. Not one. MarkOutcomeButtons
//      has shipped the whole time and has never been used, because nothing ever
//      put the decision in front of anyone.
//   2. This sweep has not closed any of them either — it stamps
//      outcome_marked_by = 'system', and none of the 62 carries that stamp. The
//      62 predate it. The routine IS live and healthy (enabled, last fired
//      2026-08-20 00:45Z, HTTP 200); it has simply found nothing old enough,
//      because its cutoff is seven days.
//
// Which makes the timing the point. 17 bookings are currently 'confirmed' with
// a start time already past, the oldest from 18 August — so this sweep was days
// away from stamping its FIRST real batch as 'completed', silently, without any
// human ever having looked at them. Retiring it now is what stops that.
//
// This route is KEPT rather than deleted so the scheduled routine
// ('meetings-auto-close', daily 06:20 IST) does not start 404-ing daily and
// reading as a broken job. It now closes nothing and says so. Disabling the
// ai_routine_schedules row is a separate production change and is NOT done
// here.
//
// What replaces it: /meetings/inbox now carries an "Awaiting you" tab listing
// every meeting that has ended without an outcome, so the decision is visible
// instead of being made silently by a cron job.
//
// Runs via the AI-routine dispatcher (ai_routine_schedules row
// 'meetings-auto-close', daily 06:20 IST, editable at /admin/ai-routines) —
// NOT a raw vercel.json cron. vercel.json has a HARD 100-cron cap and the
// 101st entry fails EVERY production build with a schema error while the old
// build keeps serving 200s; PR #3010 has just taken it from 100 to 55 so new
// work lands here instead.
//
// All the work is one SECURITY DEFINER statement
// (fn_meetings_auto_close_unmarked, migration 20260831010000) so the rule
// lives in exactly one place and the sweep is idempotent by construction: its
// predicate is status = 'confirmed', and its own UPDATE moves every row it
// touches out of that set. A booking the host already marked was never in the
// set, so its outcome_marked_by = 'host' stamp is preserved.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` or `?secret=`. The
// dispatcher sends Bearer; the query form is accepted because a Bearer-only
// route 401s silently under some callers.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const started = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Retired 2026-08-21. fn_meetings_auto_close_unmarked is deliberately NOT
  // called: a meeting nobody marked is now left for its host to decide, and
  // /meetings/inbox surfaces it. `ok: true` because doing nothing IS the
  // correct outcome now — reporting a failure would make a healthy routine
  // look broken in the dispatcher log every morning.
  return NextResponse.json({
    ok: true,
    retired: true,
    closed: 0,
    reason:
      'Auto-close was retired on 2026-08-21. A meeting that has ended without an ' +
      'outcome now waits for its host under Awaiting you on /meetings/inbox, ' +
      'instead of being recorded as completed after 7 days.',
    elapsed_ms: Date.now() - started,
  });
}
