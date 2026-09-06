// =====================================================================
// Committee term expiry warning — daily sweep
// =====================================================================
// Director decision 8 (2026-08-05): the Chairman and the Coordinator are cut
// off on their term end date like everyone else, but a warning must go out
// ahead of the date so a successor can be appointed. The Director's concern in
// their own framing: a committee must not be left leaderless overnight, and
// THE PERSON WHO COULD FIX IT MAY BE THE ONE WHO JUST LOST ACCESS.
//
// This route fires 30 days out and again 7 days out, and sends TWO notices per
// warning: one to the outgoing leader, one to the people who hold
// accreditation.naac.committees.edit — with the outgoing leader excluded from
// that second list, escalating to super admins if excluding them empties it.
// That exclusion is the Director's clause, not a nicety.
//
// All the work is in the SECURITY DEFINER RPC
// fn_accreditation_committee_term_warnings (migration 20260809103200,
// service_role only), which writes notifications + user_notifications directly
// and is idempotent on notifications.idempotency_key keyed by
// (member, term_end, threshold, audience) — so each warning is sent exactly
// once EVER, not once per day. This route is only the trigger and the report.
// Same shape as /api/cron/accreditation-narrative-reminders.
//
// SCHEDULING lives in the database, not vercel.json: `crons` already holds
// exactly 100 entries, Vercel's plan cap, and a 101st fails the build for every
// deploy rather than scheduling anything. The migration seeds an
// ai_routine_schedules row ('committee-term-reminders', daily 09:07 IST) and
// /api/cron/ai-routine-dispatcher fires this route with the CRON_SECRET Bearer
// token — the same call Vercel would have made; only the clock moved.
//
// ⚠️ REPORTS WHAT IT EXAMINED, NOT JUST WHAT IT SENT. Every real term today
// ends 2027-03-31, so the honest answer on most nights is "nothing due" — and
// that is indistinguishable from a broken query unless the counts say how much
// was looked at. The body therefore always carries `examined` (leadership seats
// inspected) alongside `candidates` (seats inside a warning window) and
// `unreachable` (warnings nobody could be told about). A failure is a 500 that
// names the error, never a cheerful empty 200.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (the dispatcher sends
// it) OR `?secret=` for a manual run. Does not call Claude.
// Created: 2026-08-05.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG_MODULE = 'accreditation/committee-terms';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createServiceRoleClient();

  // ?dryRun=1 counts exactly what would be sent and writes nothing — the safe
  // way to exercise this against real people's names without ringing a bell.
  const dryParam = request.nextUrl.searchParams.get('dryRun');
  const dryRun = dryParam === '1' || dryParam === 'true';

  const { data, error } = await supabase.rpc('fn_accreditation_committee_term_warnings', {
    p_dry_run: dryRun,
  });

  if (error) {
    // Surfaced, never swallowed. A sweep that fails quietly is the exact
    // failure this change exists to end — and until migration 20260809103200
    // is applied this is where a missing function shows up, loudly.
    logger.error(LOG_MODULE, 'term warning sweep failed', error);
    return NextResponse.json(
      { ok: false, error: error.message, dry_run: dryRun, elapsed_ms: Date.now() - started },
      { status: 500 },
    );
  }

  const result = (data ?? {}) as Record<string, unknown>;

  // A null/empty body from an RPC that always returns a jsonb object means the
  // call did not do what we think it did. Do not report that as success.
  if (typeof result.examined !== 'number') {
    logger.error(LOG_MODULE, 'term warning sweep returned no counts', result);
    return NextResponse.json(
      {
        ok: false,
        error: 'sweep returned no counts — cannot distinguish "nothing due" from a failed run',
        dry_run: dryRun,
        elapsed_ms: Date.now() - started,
      },
      { status: 500 },
    );
  }

  // A warning that reached nobody is not a quiet success. It is the precise
  // harm decision 8 names, so it is logged at warn level as well as counted.
  if (typeof result.unreachable === 'number' && result.unreachable > 0) {
    logger.warn(
      LOG_MODULE,
      `${result.unreachable} committee term warning(s) had no one who could act`,
      result,
    );
  }

  // Keys named so the AI-routine dispatcher's summariser picks them up, which
  // is what makes "last run" read `HTTP 200 · sent 0, candidates 0, skipped 0`
  // instead of a bare status that cannot be told apart from a stall.
  return NextResponse.json({ ok: true, ...result, elapsed_ms: Date.now() - started });
}
