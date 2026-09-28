// =============================================================================
// ADOPTION DAILY TICK — the adoption loop asks why and reminds on its own
// =============================================================================
// Spec: specs/2026-09-16-adoption-loop.md, rulings 2, 6, 9, 10 (9 and 10:
// Director 2026-09-24 17:52). Until this route, the why-not question needed a
// super admin to press "Ask why" on /admin/adoption; nobody did, and
// adoption_asks held 0 rows on production. This is the clock.
//
// Daily 10:33 IST through the AI-routine dispatcher (ai_routine_schedules row
// 'adoption-daily-tick', migration 20270324090000) — NOT vercel.json, which is
// at its hard cron cap.
//
// ONE RPC. Every rule lives in fn_adoption_daily_tick, in the database:
//   * the why-not question only for near-zero features, through the same core
//     the button uses (once per feature ever, once per person per 7 days);
//   * a reminder only to people who never did the core action, at most once a
//     month per person per feature;
//   * at most adoption.tick.max_notifications people per IST day (shared with
//     the Ask why button), one adoption message per person per IST day;
//   * a fair order: questions first, then first reminders, each feature an
//     equal share; repeats last, oldest reminder first across all features;
//   * nothing at all while adoption.loop.enabled is off.
// This route adds no rule of its own, so it cannot loosen one.
//
// ?dry_run=1 returns what the run WOULD send and writes nothing.
//
// Auth: CRON_SECRET Bearer header only — the dispatcher and the AI Routines
// "Run now" both send it; secrets never sit in URLs. An RPC error, or a run
// that answered success:false, is HTTP 500 so the dispatcher records the
// failure instead of a silent 200.
// Created: 2026-09-24.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import { summariseTick, type AdoptionTickResult } from '@/lib/adoption/tick-summary';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = ['1', 'true'].includes(request.nextUrl.searchParams.get('dry_run') ?? '');
  const started = Date.now();
  const admin = createServiceRoleClient();

  const { data, error } = await admin.rpc('fn_adoption_daily_tick', { p_dry_run: dryRun });
  if (error) {
    logger.error('adoption/daily-tick', 'fn_adoption_daily_tick failed', error);
    return NextResponse.json(
      { ok: false, error: `tick rpc failed: ${error.message}`, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  const result = (data ?? null) as AdoptionTickResult | null;
  if (!result || typeof result !== 'object' || result.success !== true) {
    const message = result?.error ?? 'tick returned no result';
    logger.error('adoption/daily-tick', 'run refused', message);
    return NextResponse.json(
      { ok: false, error: message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  const summary = summariseTick(result);
  logger.info('adoption/daily-tick', summary, {
    asked: result.asked ?? 0,
    reminded: result.reminded ?? 0,
    capped: result.capped ?? false,
    dry_run: result.dry_run ?? dryRun,
  });

  // The counters sit at the TOP level too: the AI-routine dispatcher's status
  // line (lib/ai-routines/summarize-routine-result.ts) reads top-level numbers
  // only, so nested ones would leave last_status at a bare "HTTP 200".
  // 'sent' is a headline key and prints even at zero.
  const asked = Number(result.asked ?? 0);
  const reminded = Number(result.reminded ?? 0);
  return NextResponse.json({
    ok: true,
    summary,
    sent: asked + reminded,
    asked,
    reminded,
    elapsed_ms: Date.now() - started,
    result,
  });
}
