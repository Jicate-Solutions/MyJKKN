// =====================================================================
// Usage analytics — nightly rollup + retention
// =====================================================================
// Drives the four usage-analytics RPCs that have existed since 2026-02-06
// and have NEVER been called by anything:
//   compute_module_usage_daily(target_date)        → module_usage_daily
//   compute_feature_usage_summary(target_date)     → feature_usage_summary
//   compute_institution_health_scores(target_date) → institution_health_scores
//   archive_old_usage_events(months_to_keep)       → usage_events_archive
//
// WHY THIS EXISTS
// `usage_events` had 25,832 rows as of 2026-07-26, but `module_usage_daily`'s
// newest row was 2026-02-06 — the day the substrate was built. A repo-wide grep
// found ZERO callers of the three compute_* RPCs and no cron among the 116
// cron routes. Every usage read surface (/api/analytics/usage/dashboard,
// /modules, /trends → LifecycleDashboardService) queries module_usage_daily and
// institution_health_scores, NOT raw usage_events. So the dashboards have been
// serving February numbers for five and a half months, and `usage_events` grows
// unbounded because the archival function is never invoked either.
//
// WINDOW (?days=N, default 2)
// Recomputes the last N days, not just yesterday. Two reasons: today's rows are
// still arriving, and a missed run must self-heal on the next fire rather than
// leaving a permanent hole. The RPCs are idempotent per target_date, so
// recomputing a day is safe.
//   - Nightly: default 2 (yesterday + today).
//   - Backfill: manual trigger with ?days=180 to roll up the Feb-onward history
//     that was never processed. Capped at MAX_DAYS.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time) —
// same discipline as accreditation-loop-evidence; no ?secret= query param,
// which would persist in access logs and Referer headers.
//
// Fired by the AI-routine dispatcher (ai_routine_schedules row 'usage-rollup' —
// day/time editable in /admin/ai-routines), NOT a raw vercel.json cron.
// Does not call Claude. Created 2026-07-26.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const DEFAULT_DAYS = 2;
// ~13 months: enough to backfill the whole un-rolled history in one manual
// trigger while bounding a typo'd ?days= from pinning the database.
const MAX_DAYS = 400;
/** Matches archive_old_usage_events' own default. */
const MONTHS_TO_KEEP = 12;

function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** UTC yyyy-mm-dd, `offset` days back from today. */
function dateNDaysAgo(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || !bearerMatches(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = Number(request.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), MAX_DAYS) : DEFAULT_DAYS;

  const supabase = createServiceRoleClient();

  const modules: Record<string, number> = {};
  const features: Record<string, number> = {};
  const health: Record<string, number> = {};
  const errors: Array<{ date: string; rpc: string; error: string }> = [];

  // Oldest first, so a partial failure still leaves the most recent days
  // unprocessed rather than the oldest — the next run's default window
  // (2 days) then repairs the recent end without a manual backfill.
  for (let i = days - 1; i >= 0; i--) {
    const target = dateNDaysAgo(i);

    // One day's three rollups. A failure on one RPC must not abort the rest:
    // a single bad day should not stop the other days or the archival step.
    const steps: Array<[string, Record<string, number>]> = [
      ['compute_module_usage_daily', modules],
      ['compute_feature_usage_summary', features],
      ['compute_institution_health_scores', health],
    ];

    for (const [rpc, sink] of steps) {
      const { data, error } = await supabase.rpc(rpc as never, { target_date: target } as never);
      if (error) {
        errors.push({ date: target, rpc, error: error.message });
        continue;
      }
      sink[target] = typeof data === 'number' ? data : 0;
    }
  }

  // Retention. Idempotent and a no-op when nothing is old enough, so it is safe
  // to run on every fire.
  let archived: number | null = null;
  {
    const { data, error } = await supabase.rpc('archive_old_usage_events', {
      months_to_keep: MONTHS_TO_KEEP,
    });
    if (error) errors.push({ date: '-', rpc: 'archive_old_usage_events', error: error.message });
    else archived = typeof data === 'number' ? data : 0;
  }

  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

  // `count` is on the dispatcher's summarize() allowlist, so the Control Tower's
  // "last run" line shows total rolled-up rows.
  const body = {
    ok: errors.length === 0,
    days,
    count: sum(modules) + sum(features) + sum(health),
    module_usage_daily: sum(modules),
    feature_usage_summary: sum(features),
    institution_health_scores: sum(health),
    archived,
    errors: errors.length ? errors : undefined,
  };

  // 207 when some days succeeded and some failed — the dispatcher records a
  // non-200 so a partial failure is visible instead of reading as a clean run.
  return NextResponse.json(body, { status: errors.length === 0 ? 200 : 207 });
}
