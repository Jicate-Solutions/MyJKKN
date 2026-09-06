// =====================================================================
// AI Routine Dispatcher — the single clock for scheduler-managed AI routines
// =====================================================================
// Created: 2026-07-01. Runs every 15 minutes (vercel.json). Reads the editable
// schedule table (ai_routine_schedules) and fires whatever is due for the
// current 15-minute slot, so super_admins can change any routine's day/time
// from /admin/ai-routines without a redeploy.
//
// Idempotency is in the DB: fn_ai_routine_claim_due() marks last_fired_slot in
// the SAME atomic UPDATE...RETURNING that selects due routines, so overlapping
// ticks cannot double-fire. Each managed routine's own /api/cron/<name> endpoint
// is invoked with CRON_SECRET (Bearer) against the deployed origin — the exact
// same call Vercel used to make; only the clock moved.
//
// Auth: CRON_SECRET via Authorization: Bearer or ?secret=. Env: NEXT_PUBLIC_APP_URL.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getRoutineById } from '@/lib/ai-routines/registry';
import { summarizeRoutineResult } from '@/lib/ai-routines/summarize-routine-result';
import { withCronRun } from '@/lib/cron/run-log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Run-logged (2026-09-10). The dispatcher is the single clock for ~45 routines,
// so its OWN silence is the most expensive failure on the platform — and it was
// the one fire nothing recorded: fn_ai_routine_record_fire logs the routines it
// fires, never the tick that fired them. withCronRun opens a cron_run_log row
// before the claim and closes it after, so a dispatcher that dies mid-tick
// leaves an unclosed row rather than no trace at all.
async function handler(request: NextRequest) {
  // 1) Authorize — same CRON_SECRET pattern as every other cron.
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

  // 2) Atomically claim the routines due in the current 15-min slot (marks
  //    last_fired_slot in the same statement — no double-fire across ticks).
  const { data: due, error: claimErr } = await admin.rpc('fn_ai_routine_claim_due');
  if (claimErr) {
    console.error('[cron/ai-routine-dispatcher] claim failed:', claimErr);
    return NextResponse.json(
      { ok: false, error: claimErr.message, elapsed_ms: Date.now() - started },
      { status: 500 },
    );
  }
  const dueIds: string[] = ((due ?? []) as { routine_id: string }[]).map((r) => r.routine_id);

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '');

  // Compact one-line summary of a routine's OWN JSON result, appended to the
  // HTTP status so "last run" says what the routine DID (e.g.
  // "HTTP 200 · generated 0, skipped 0, courses 142, skipped_no_taxonomy 142"),
  // not just that its endpoint answered 200. The judgement lives in
  // summarizeRoutineResult so it can be driven by a fixture in a test — a
  // route file cannot export a helper for one to import. This wrapper only
  // parses the body; it never throws, because status logging must not be able
  // to fail the tick.
  //
  // The allowlist that used to sit here is gone; its entries live on as
  // HEADLINE_KEYS in that module, including the metaloop keys (collected,
  // filed, insufficient, enqueued) added to it on main.
  const summarize = async (resp: Response): Promise<string> => {
    try {
      return summarizeRoutineResult(resp.status, await resp.clone().json());
    } catch {
      return `HTTP ${resp.status}`; // non-JSON body / already consumed → bare status
    }
  };

  // 3) Fire each due routine's own cron endpoint (parallel; each bounded).
  // Record helper that never throws — a logging failure must not fail the tick.
  const record = async (rid: string, status: string) => {
    try {
      await admin.rpc('fn_ai_routine_record_fire', { p_routine_id: rid, p_status: status });
    } catch {
      /* best-effort logging only */
    }
  };

  const fired = await Promise.all(
    dueIds.map(async (rid) => {
      // Whole body guarded so one routine can never reject Promise.all / 500 the tick.
      try {
        const routine = getRoutineById(rid);
        if (!routine || !routine.triggerPath) {
          await record(rid, 'skipped: not in registry');
          return { rid, status: 'skipped: not in registry' };
        }
        if (!origin) {
          await record(rid, 'skipped: no app origin');
          return { rid, status: 'skipped: no app origin' };
        }
        const resp = await fetch(`${origin}${routine.triggerPath}`, {
          method: 'GET',
          headers: { authorization: `Bearer ${cronSecret}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(120_000),
        });
        const status = await summarize(resp);
        await record(rid, status);
        return { rid, status };
      } catch (err) {
        const status = `error: ${err instanceof Error ? err.message : 'fire failed'}`;
        await record(rid, status);
        return { rid, status };
      }
    }),
  );

  return NextResponse.json({
    ok: true,
    due: dueIds.length,
    fired,
    elapsed_ms: Date.now() - started,
  });
}

export const GET = withCronRun('ai-routine-dispatcher', handler);
