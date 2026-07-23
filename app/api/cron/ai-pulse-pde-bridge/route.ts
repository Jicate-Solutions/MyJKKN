// =====================================================================
// AI Pulse → PDE Bridge Cron (Lane A)
// =====================================================================
// Bridges AI Pulse participation signals into pde_demonstrations rows
// for recent cycles via AiPulsePdeBridgeService.bridgeCycle.
//
// Gate: the `pde_bridge_enabled` ai_pulse_policies row (Lane B seeds it
// DEFAULT FALSE; Director flips it in /ai-pulse/admin/policies). When the
// policy is false/missing this route is a 200 no-op — the cron can be
// wired into vercel.json before the bridge is switched on.
//
// Query params:
//   ?secret=<CRON_SECRET>  — alternative to the Authorization header
//   ?dry_run=1             — force dry-run (evaluate + count, no writes)
//   ?cycle=<uuid>          — scope to one cycle instead of the 14-day window
//
// Auth + policy-read pattern: app/api/cron/ai-pulse-tick/route.ts.
// Reconciler adds the vercel.json cron line:
//   {"path":"/api/cron/ai-pulse-pde-bridge?secret=$CRON_SECRET","schedule":"53 4 * * *"}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  AiPulsePdeBridgeService,
  type BridgeCycleResult,
} from '@/lib/services/ai-pulse/ai-pulse-pde-bridge-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'ai-pulse/pde-bridge';

/** Days back from today that a cycle's demo_date may fall to be bridged. */
const RECENT_WINDOW_DAYS = 14;

export async function GET(req: NextRequest) {
  // -- Auth: CRON_SECRET (Vercel cron sends as Authorization header) ----
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }
  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const sb = supabase as any;
  const startedAt = Date.now();

  const dryRunParam = req.nextUrl.searchParams.get('dry_run');
  const dryRun = dryRunParam === '1' || dryRunParam === 'true';
  const cycleParam = req.nextUrl.searchParams.get('cycle');

  // -- 1. Master switch: pde_bridge_enabled policy (DEFAULT FALSE) -------
  const { data: enabledRow, error: enabledErr } = await sb
    .from('ai_pulse_policies')
    .select('config_key, value_jsonb')
    .eq('config_key', 'pde_bridge_enabled')
    .eq('is_active', true)
    .maybeSingle();
  if (enabledErr) {
    return NextResponse.json(
      { error: 'Failed to read pde_bridge_enabled policy', detail: enabledErr.message },
      { status: 500 }
    );
  }
  const enabledValue = enabledRow?.value_jsonb;
  const enabled = enabledValue === true || enabledValue === 'true';
  if (!enabled) {
    // The master switch is off, so this run does nothing. Without a top-level
    // numeric the dispatcher reported a bare "HTTP 200" — a green light on a
    // dead pipe. `processed: 0` makes the no-op legible in the Control Tower.
    // (`skipped: true` here is a BOOLEAN flag, not a count; summarize() ignores
    // non-numeric values, so it is left untouched for existing consumers.)
    return NextResponse.json({
      ok: true,
      processed: 0,
      created: 0,
      enabled: false,
      skipped: true,
    });
  }

  // -- 2. Resolve target cycles ------------------------------------------
  let cycleIds: string[] = [];
  if (cycleParam) {
    cycleIds = [cycleParam];
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RECENT_WINDOW_DAYS);
    const cutoffISO = cutoff.toISOString().split('T')[0];

    const { data: cycles, error: cyclesErr } = await sb
      .from('startup_events')
      .select('id, demo_date')
      .filter('config->>kind', 'eq', 'ai_pulse')
      .gte('demo_date', cutoffISO)
      .order('demo_date', { ascending: false });
    if (cyclesErr) {
      return NextResponse.json(
        { error: 'Failed to list ai_pulse cycles', detail: cyclesErr.message },
        { status: 500 }
      );
    }
    cycleIds = ((cycles ?? []) as any[]).map((c) => c.id);
  }

  // -- 3. Bridge each cycle ------------------------------------------------
  const results: BridgeCycleResult[] = [];
  const cycleErrors: Array<{ cycle_id: string; error: string }> = [];
  for (const cycleId of cycleIds) {
    try {
      const result = await AiPulsePdeBridgeService.bridgeCycle(
        supabase,
        cycleId,
        { dryRun }
      );
      results.push(result);
    } catch (e) {
      const message = (e as Error).message;
      logger.error(MODULE, `bridgeCycle failed for ${cycleId}`, e);
      cycleErrors.push({ cycle_id: cycleId, error: message });
    }
  }

  // -- 4. Aggregate ----------------------------------------------------------
  const totals = { found: 0, inserted: 0, skipped: 0 };
  for (const r of results) {
    for (const counts of Object.values(r.per_signal)) {
      totals.found += counts.found;
      totals.inserted += counts.inserted;
      totals.skipped += counts.skipped;
    }
  }

  const summary = {
    enabled: true,
    dry_run: dryRun,
    cycles_processed: results.length,
    cycles_failed: cycleErrors.length,
    totals,
    results,
    cycle_errors: cycleErrors,
    elapsed_ms: Date.now() - startedAt,
  };

  logger.info(MODULE, 'cron run complete', summary);

  // Top-level numeric keys for ai-routine-dispatcher's summarize() — it reads
  // only top-level allowlisted numerics, never `summary.totals.*`.
  return NextResponse.json({
    ok: true,
    processed: summary.cycles_processed,
    candidates: summary.totals.found,
    created: summary.totals.inserted,
    skipped: summary.totals.skipped,
    summary,
  });
}
