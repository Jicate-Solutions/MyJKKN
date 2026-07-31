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
// 20260802030000). This route is only the trigger + the report, so the sweep can
// also be run by hand from a browser with ?secret= when someone needs it now.
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

// The function clamps to 1..200 itself; this is the per-run default.
const DEFAULT_LIMIT = 50;

/** One announced lapse, as fn_gemba_official_lapse_notify returns it. */
interface AnnouncedLapse {
  artifact_id: string;
  area_id: string;
  area_label: string | null;
  artifact_type: string;
  lapsed_at: string;
  recipients: number;
  notification_id: string | null;
}

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
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_LIMIT;

  const { data, error } = await admin.rpc('fn_gemba_official_lapse_notify', { p_limit: limit });

  if (error) {
    // Surfaced, never swallowed: a sweep that fails quietly is the exact failure
    // this whole change exists to end.
    console.error('[cron/gemba-official-lapse] sweep failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  const announced = (data ?? []) as AnnouncedLapse[];

  return NextResponse.json({
    ok: true,
    limit,
    announced: announced.length,
    notified: announced.reduce((sum, row) => sum + (row.recipients ?? 0), 0),
    lapses: announced.map((row) => ({
      area: row.area_label,
      artifact_type: row.artifact_type,
      lapsed_at: row.lapsed_at,
      recipients: row.recipients,
    })),
    elapsed_ms: Date.now() - started,
  });
}
