// =====================================================================
// /api/cron/pde-quest-risk-tier — PDE Tier 3 T3.2
// =====================================================================
// Nightly job that promotes pde_quests.risk_tier from 'experimental' to
// 'production' once a quest accumulates >= threshold passed submissions
// (threshold parsed from policy pde.quests.risk_tiers.production_eligibility,
// default 2).
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> header (Vercel
// auto-sends) OR ?secret=<value> query param for manual/test invocations.
// Pattern mirrors hr-policy-promote-detector + counselor-shift-flip.
//
// Idempotent: the underlying UPDATE is guarded by `risk_tier = 'experimental'`
// so a re-run cannot double-promote. Re-running the cron multiple times in
// the same window is safe and produces `promoted: 0` on subsequent calls.
//
// Cadence: schedule nightly via Vercel cron (vercel.json) in a separate ops
// PR — this PR ships the handler and service. Recommended cadence:
//   "schedule": "0 3 * * *"  // 03:00 UTC nightly
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { evaluateRiskTierPromotions } from '@/lib/services/pde-quest-risk-tier-service';

const JOB_NAME = 'pde-quest-risk-tier';

export async function GET(request: NextRequest) {
  const started = Date.now();
  const ranAt = new Date().toISOString();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const supabase = createServiceRoleClient();

  try {
    const result = await evaluateRiskTierPromotions(supabase);
    const elapsedMs = Date.now() - started;

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: ranAt,
      elapsed_ms: elapsedMs,
      evaluated: result.evaluated,
      promoted: result.promoted,
      threshold: result.threshold,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:${JOB_NAME}] Exception:`, err);
    return NextResponse.json(
      { ok: false, job: JOB_NAME, ran_at: ranAt, error: message },
      { status: 500 }
    );
  }
}
