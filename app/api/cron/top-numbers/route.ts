// =============================================================================
// THE TWO TOP NUMBERS — weekly measurement
// =============================================================================
// Director 2026-09-18 06:24/06:27, spec
// specs/2026-09-18-loop-graph-and-two-top-numbers.md: every loop in MyJKKN
// serves one of exactly two numbers, so a loop's bar can be judged by whether
// the top actually moved.
//
//   T1  top-defect-hours    weekly hours real users lose to defects
//   T2  top-adoption-share  share of shipped features actually used
//
// Once a week (Monday 09:11 IST, dispatcher row 'top-numbers', migration
// 20261226010100) this route computes both for the ISO week that just ENDED —
// never a half-finished one — and records each through
// fn_loop_record_measurement, the single writer of loop_measurements. Both are
// recorded with met = NULL: neither has an approved bar yet, and NULL is
// neither a hit nor a miss, so it never moves a miss streak.
//
// NEVER A SILENT SKIP, NEVER A FAKE NUMBER. When Sentry cannot be read, T1 is
// still RECORDED — value NULL, gap "insufficient — …". The same for T2 while
// nothing records usage. A missing row would read on /admin/loops exactly like
// a week nobody measured; an honest NULL row says what was missing and when.
//
// Auth: CRON_SECRET Bearer header only — the dispatcher and the AI Routines
// manual trigger both send it; secrets never sit in URLs.
// Created: 2026-09-18.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  computeAdoptionShare,
  computeDefectHours,
  createSentryReader,
  lastCompleteIsoWeek,
  loadTopNumberConstants,
  type TopNumberReading,
} from '@/lib/services/loops/top-numbers';

interface RecordedReading {
  loopKey: string;
  value: number | null;
  recorded: boolean;
  gap: string;
  /** T1 only — which Sentry secret the reading was actually taken with. */
  token_source?: string;
  error?: string;
}

async function record(
  admin: ReturnType<typeof createServiceRoleClient>,
  reading: TopNumberReading
): Promise<RecordedReading> {
  const { error } = await admin.rpc('fn_loop_record_measurement', {
    p_loop_key: reading.loopKey,
    p_value: reading.value,
    p_bar_value: null,
    p_met: null,
    p_gap: reading.gap,
    p_run_id: reading.runId,
  });
  return {
    loopKey: reading.loopKey,
    value: reading.value,
    recorded: !error,
    gap: reading.gap,
    ...(reading.tokenSource ? { token_source: reading.tokenSource } : {}),
    ...(error ? { error: error.message } : {}),
  };
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const week = lastCompleteIsoWeek(new Date());

  // The five dials and the exclusion list are platform_policies rows read at
  // run time (config-table pattern), not deployed literals — a recalibration
  // changes next Monday's reading with no PR. Absent rows fall back to the
  // in-code defaults, so this route works before the seed is applied.
  const constants = await loadTopNumberConstants(admin);

  const [t1, t2] = await Promise.all([
    computeDefectHours(admin, createSentryReader(), week, constants),
    computeAdoptionShare(admin, week, constants),
  ]);

  const results = [await record(admin, t1), await record(admin, t2)];
  const failed = results.filter((r) => !r.recorded);

  if (failed.length > 0) {
    // HTTP 500 so the dispatcher records the failure in last_status — a quiet
    // 200 would let the weekly number die unnoticed.
    return NextResponse.json(
      {
        ok: false,
        error: `could not record ${failed.length} of ${results.length} top numbers: ${failed
          .map((f) => `${f.loopKey}: ${f.error ?? 'unknown'}`)
          .join('; ')}`,
        week: week.label,
        results,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, week: week.label, results });
}
