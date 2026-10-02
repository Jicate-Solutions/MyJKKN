// =====================================================================
// Meetings daily sweep — closes a past meeting ONLY when its notes are linked
// =====================================================================
// What it does now (Director, 2 Oct 2026): a confirmed meeting that ended more
// than 7 days ago AND has meeting notes linked to it is closed as 'completed',
// stamped outcome_marked_by = 'notes'. The detail page says so in plain words
// ("Closed automatically because the meeting's notes were linked") and never
// names a person. A meeting WITHOUT notes is left alone and still waits for its
// host under "Awaiting you" on /meetings/inbox.
//
// HISTORY — why this route has looked three different ways
//
//   2026-08-08  Director decision: a meeting nobody marked closes itself as
//               'completed' 7 days after it ended (fn_meetings_auto_close_
//               unmarked, migration 20260831010000, stamped 'system').
//   2026-08-21  REVERSED by the Director: "Stop closing them automatically.
//               the EAO for director will manage this and followup." Measured
//               that day: outcome_marked_by was NULL on every row, no host had
//               ever marked a meeting, and 17 past bookings were days away from
//               being stamped 'completed' with nobody having looked. This route
//               was kept but closed nothing.
//   2026-10-02  Requested by the Front desk session and confirmed by the
//               Director in the myjkkn-agent chat, choosing "Close those with
//               notes" over "Keep the 21 Aug rule". A partial reversal: the
//               21 Aug retirement STANDS for meetings without notes; meetings
//               with notes are closed, because the linked record is evidence a
//               blind 7-day sweep never had.
//
// fn_meetings_auto_close_unmarked still exists in the database and must stay
// UNCALLED — it closes every unmarked meeting regardless of notes. This route
// calls fn_meetings_close_with_notes (migration 20271003091700) and nothing
// else; __tests__/meetings/auto-close-retired.test.ts fails if that changes.
//
// The first run after the migration is applied closes the notes-linked backlog
// in one go: 61 bookings on production on 2 Oct 2026 (counts only).
//
// All the work is one SECURITY DEFINER statement, service role only, so the
// rule lives in one place and the sweep is idempotent by construction: its
// predicate is status = 'confirmed' and its own UPDATE moves every row it
// touches out of that set. A meeting a person already marked was never in the
// set, so a 'host' or 'admin' stamp is never overwritten.
//
// Runs via the AI-routine dispatcher (ai_routine_schedules row
// 'meetings-auto-close', daily 06:20 IST, editable at /admin/ai-routines) —
// NOT a raw vercel.json cron, which has a HARD 100-cron cap.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` or `?secret=`. The
// dispatcher sends Bearer; the query form is accepted because a Bearer-only
// route 401s silently under some callers.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/** "Ended more than 7 days ago" — the same window the 2 Oct decision kept. */
const CLOSE_WITH_NOTES_AFTER_DAYS = 7;

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

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('fn_meetings_close_with_notes', {
    p_older_than_days: CLOSE_WITH_NOTES_AFTER_DAYS,
  });

  if (error) {
    // Migration 20271003091700 is Director-gated and FILE ONLY, so until it is
    // applied the function does not exist. Say that, rather than a bare failure
    // the dispatcher would record as an opaque error string.
    const notDeployed = error.code === 'PGRST202';
    return NextResponse.json(
      {
        ok: false,
        error: notDeployed
          ? 'fn_meetings_close_with_notes is not present — migration 20271003091700 has not been applied'
          : error.message,
        elapsed_ms: Date.now() - started,
      },
      { status: notDeployed ? 503 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    closed_with_notes: (data as number | null) ?? 0,
    days: CLOSE_WITH_NOTES_AFTER_DAYS,
    rule:
      'Closes a past meeting only when its notes are linked. A meeting without ' +
      'notes still waits for its host under Awaiting you on /meetings/inbox.',
    elapsed_ms: Date.now() - started,
  });
}
