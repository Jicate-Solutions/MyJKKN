export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runVacancyPriceDrops } from '@/lib/services/campus-living/vacancy-price-drop-service';

/**
 * Dynamic Vacancy Price-Drop cron (PR θ, 2026-05-29).
 *
 * Decision 8: an unfilled Premium upgrade-vacancy's differential auto-drops
 * 20% every 60 days (policy-driven) until taken or the hostel year ends, and
 * each drop re-notifies the eligible pool. This route is the scheduled trigger
 * — it delegates entirely to runVacancyPriceDrops (service-role; idempotent).
 *
 * Schedule in vercel.json: daily 02:00 (0 2 * * *). The per-vacancy
 * ">= interval_days since last_dropped_at" guard makes a daily run safe — it
 * only acts on vacancies actually past their 60-day interval.
 *
 * Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
 * OR `?secret=` query param (manual runs). Mirrors app/api/cron/hostel-vacate-sla.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/campus-living/vacancy-price-drops] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/campus-living/vacancy-price-drops] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runVacancyPriceDrops();
    const duration_ms = Date.now() - startTime;
    console.log(
      `[cron/campus-living/vacancy-price-drops] dropped ${summary.dropped}, ` +
        `closed_year_end ${summary.closed_year_end}, renotified ${summary.renotified}, ` +
        `${duration_ms}ms`,
    );
    return NextResponse.json({ ...summary, duration_ms });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const error = e instanceof Error ? e.message : String(e);
    console.error('[cron/campus-living/vacancy-price-drops] Fatal', error);
    return NextResponse.json({ error, duration_ms }, { status: 500 });
  }
}
