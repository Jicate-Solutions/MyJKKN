// =====================================================================
// Gemba — tell the posted associates when official lapses
// =====================================================================
// 20260731043000_gemba_observation_record.sql already expires officialdom:
// a recorded visit that finds a department playbook matches reality stamps
// mba_dept_artifacts.official_until, and every read of that column already
// treats a past timestamp as "not official any more". The expiry works.
//
// What was missing is the TELLING. official_until slid past in the background,
// the document silently stopped being official, and nobody heard. This route is
// the sweep that says so out loud, to the people who can act on it: the
// associates actively posted to that department. Targeted, never broadcast.
//
// All the work is in the database (fn_gemba_official_lapse_notify, migration
// 20260802030000), reached through the one shared entry point
// lib/services/gemba/official-lapse-sweep. This route is only the trigger + the
// report, so the sweep can be run by hand from a browser with ?secret= when
// someone needs it now.
//
// SCHEDULING lives elsewhere: vercel.json already holds exactly 100 cron
// entries — Vercel's hard cap — so this route has no cron entry of its own and
// a 101st would fail the whole deploy rather than schedule anything. The sweep
// runs once daily at 04:43 inside /api/cron/improvement-rank-ideas, which calls
// the SAME runOfficialLapseSweep(). This route stays for the manual run and for
// the day a cron slot frees up.
//
// Idempotent twice over, in the function: a (artifact, exact lapse) ledger row
// AND notifications.idempotency_key's unique index. Running this route twice in
// one night adds nothing — which matters, because public.notifications already
// holds ~230,000 rows and a re-announcing sweep would bury the bell.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query —
// the same shape as /api/cron/improvement-rank-ideas.
// Created: 2026-07-31.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  runOfficialLapseSweep,
  OFFICIAL_LAPSE_DEFAULT_LIMIT,
} from '@/lib/services/gemba/official-lapse-sweep';

const LOG_MODULE = 'cron/gemba-official-lapse';

export async function GET(request: NextRequest) {
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
  const admin = createServiceRoleClient();

  const rawLimit = Number(request.nextUrl.searchParams.get('limit'));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.floor(rawLimit)
      : OFFICIAL_LAPSE_DEFAULT_LIMIT;

  try {
    const result = await runOfficialLapseSweep(admin, limit);
    return NextResponse.json({
      ok: true,
      ...result,
      elapsed_ms: Date.now() - started,
    });
  } catch (e) {
    // Surfaced, never swallowed: a sweep that fails quietly is the exact failure
    // this whole change exists to end.
    const message = e instanceof Error ? e.message : 'lapse sweep threw';
    logger.error(LOG_MODULE, 'sweep failed', e);
    return NextResponse.json(
      { ok: false, error: message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }
}
