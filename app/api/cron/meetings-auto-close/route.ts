// =====================================================================
// Meetings 7-day auto-close
// =====================================================================
// Director decision 2026-08-08: a finished meeting nobody marked closes
// itself as 'completed' 7 days after it ended.
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
import { createServiceRoleClient } from '@/lib/supabase/server';

/** Director decision 2026-08-08. */
const AUTO_CLOSE_AFTER_DAYS = 7;

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

  const { data, error } = await admin.rpc('fn_meetings_auto_close_unmarked', {
    p_days: AUTO_CLOSE_AFTER_DAYS,
  });

  if (error) {
    // Migration 20260831010000 is Director-gated and FILE ONLY, so until it is
    // applied this RPC does not exist. Say that, rather than reporting a bare
    // failure the dispatcher would record as an opaque error string.
    const notDeployed = error.code === 'PGRST202';
    return NextResponse.json(
      {
        ok: false,
        error: notDeployed
          ? 'fn_meetings_auto_close_unmarked is not present — migration 20260831010000 has not been applied'
          : error.message,
        elapsed_ms: Date.now() - started,
      },
      { status: notDeployed ? 503 : 500 },
    );
  }

  const result = (data ?? {}) as { closed?: number; cutoff?: string };

  return NextResponse.json({
    ok: true,
    days: AUTO_CLOSE_AFTER_DAYS,
    closed: result.closed ?? 0,
    cutoff: result.cutoff ?? null,
    elapsed_ms: Date.now() - started,
  });
}
