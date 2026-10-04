// app/api/cron/weekly-report-card/route.ts
// ============================================================================
// Campus Walk — the Monday report card bells (Director ruling, 30 Sep 2026).
//
// Every Monday at 08:07 IST (vercel.json `37 2 * * 1`, which is UTC), each
// college's head gets one bell for the week just ended — "Your college's
// week: N fixed, M late" — and the Director gets one all-college summary,
// which also names every college with no head on record. No email, no
// WhatsApp.
//
// All the logic lives in lib/campus-walk/report-card-run.ts (Next.js forbids
// extra exports from a route.ts, and the idempotency and no-head fallback are
// unit-tested there). This route is the CRON_SECRET-gated wrapper.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (what Vercel Cron
// sends) OR `?secret=` for a manual run. It FAILS CLOSED when CRON_SECRET is
// not configured — the intake-readiness alarm's pattern.
//
// Params: `?week=YYYY-MM-DD` re-runs a given week (moved back to its Monday);
// `?force=1` runs on a day that is not Monday; `?dryRun=1` counts without
// sending. Re-running is safe: each bell's key is college + week.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { istWeekInfo } from '@/lib/services/academic/intake-readiness-alarm';
import { parseWeekParam } from '@/lib/campus-walk/report-card';
import { runWeeklyReportCard } from '@/lib/campus-walk/report-card-run';
import { logger } from '@/lib/utils/enhanced-logger';

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
  const now = new Date();
  const params = request.nextUrl.searchParams;
  const force = params.get('force') === '1' || params.get('force') === 'true';
  const dryRun = params.get('dryRun') === '1' || params.get('dryRun') === 'true';
  const weekParam = params.get('week');

  if (!weekParam && !force && !istWeekInfo(now).isMonday) {
    return NextResponse.json({
      ok: true,
      skipped: 1,
      reason: 'not Monday in IST — the report card goes out on Mondays (pass ?force=1 to override)'
    });
  }

  const parsed = parseWeekParam(weekParam, now);
  if (!parsed.week) {
    return NextResponse.json(
      { ok: false, error: 'week must be a date written YYYY-MM-DD' },
      { status: 400 }
    );
  }
  if (parsed.notFinished) {
    return NextResponse.json(
      { ok: false, error: `the week of ${parsed.week.weekStart} has not finished yet` },
      { status: 400 }
    );
  }

  try {
    const result = await runWeeklyReportCard(createServiceRoleClient(), {
      week: parsed.week,
      now,
      dryRun
    });
    const ok = result.collegeBellsFailed === 0 && result.directorBell !== 'failed';
    return NextResponse.json(
      { ok, ...result, elapsed_ms: Date.now() - started },
      { status: ok ? 200 : 500 }
    );
  } catch (error: any) {
    logger.error('campus-walk/report-card', 'weekly report card failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Internal error', elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }
}
