export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Late-payment charge accrual cron route — DELIBERATELY UNSCHEDULED.
 *
 * This route existing with NO schedule is intentional (Director's plan,
 * rank 1, 2026-08-06): the mechanism ships fully built but OFF at every
 * layer. There is no vercel.json cron entry, no ai_routines row and no
 * dispatcher registration for this path, and none may be added without a
 * fresh Director decision — the first live run must be signed off
 * deliberately by a human (recorded precondition (c)).
 *
 * Defense in depth, in order:
 *   1. CRON_SECRET — `Authorization: Bearer <secret>` header (Vercel cron
 *      shape) or `?secret=` query param (manual runs).
 *   2. This route refuses outright while billing.late_charge.enabled=false.
 *   3. Dry-run by default; a LIVE run requires the explicit `?live=1` param.
 *   4. fn_late_charge_accrue itself re-checks the master switch AND that
 *      effective_from is set and reached, and RAISEs otherwise — even a live
 *      call cannot accrue while the Director has not turned the mechanism on.
 *
 * Idempotent: the accrual inserts on UNIQUE (bill_id, period_start) with
 * ON CONFLICT DO NOTHING — re-running can never double-charge a month.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/billing/late-charge-accrual] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/billing/late-charge-accrual] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();

  // Route-level master-switch check (the RPC re-checks it — see header).
  // 'as never': the late-charge RPCs are not in the generated DB types until
  // the (Director-gated) migration is applied — pre-apply idiom, same as
  // yoy-trajectory-service.ts.
  const { data: enabledRaw, error: policyError } = await serviceClient.rpc(
    'fn_get_policy_bool' as never,
    { p_key: 'billing.late_charge.enabled', p_default: false } as never
  );
  const enabled = enabledRaw as unknown as boolean | null;
  if (policyError) {
    // Policy getter unavailable (migration not applied) = mechanism absent —
    // report and stop; never fall through to an accrual attempt.
    return NextResponse.json({
      skipped: true,
      reason: `policy check failed: ${policyError.message}`,
      duration_ms: Date.now() - startTime,
    });
  }
  if (enabled !== true) {
    return NextResponse.json({
      skipped: true,
      reason: 'billing.late_charge.enabled is false — the late-payment charge is OFF',
      duration_ms: Date.now() - startTime,
    });
  }

  // Dry-run unless explicitly asked for a live run.
  const dryRun = request.nextUrl.searchParams.get('live') !== '1';

  const { data: result, error } = await serviceClient.rpc(
    'fn_late_charge_accrue' as never,
    { p_dry_run: dryRun } as never
  );
  if (error) {
    console.error('[cron/billing/late-charge-accrual] accrual failed:', error.message);
    return NextResponse.json(
      { error: error.message, dry_run: dryRun, duration_ms: Date.now() - startTime },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ...((result as Record<string, unknown>) ?? {}),
    duration_ms: Date.now() - startTime,
  });
}
