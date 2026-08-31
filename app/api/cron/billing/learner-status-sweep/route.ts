// app/api/cron/billing/learner-status-sweep/route.ts
// ============================================================================
// Safety net for the learner lifecycle auto-promotion pipeline.
//
// Payments promote learners in real time via trg_evaluate_status_after_bill_paid
// (see 20260811140000). This sweep exists because that pipeline once stopped
// silently for months: the failure was a stale read plus a too-narrow trigger
// guard, both of which failed in the SAFE direction — nothing threw, no history
// row was written, the payment succeeded — so the only symptom was 98 learners
// sitting in the wrong status on a report nobody was diffing.
//
// A healthy night reports promoted_total: 0. A sustained non-zero means a
// payment is reaching the database without the triggers acting on it: treat it
// as a regression to investigate, NOT as routine catch-up.
//
// All the work happens in fn_sweep_learner_status_promotions so this is one
// round trip, not ~900. That RPC is promotion-only and safe to over-run.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query param.
// BOTH forms are required — Vercel does NOT interpolate ${CRON_SECRET} into a
// cron path, it sends the literal string and passes the real secret in the
// Authorization header. A route checking only ?secret= is dead on schedule
// while manual runs keep working, which is how razorpay-late-auth hid for
// months (2026-07-29).
//
// REGISTERED in vercel.json as of 2026-08-21, nightly at 20:35 UTC (02:05 IST).
// (The prior note here claimed vercel.json was at exactly 100 cron entries and
// the sweep could not be scheduled; that was stale — the file held 55.)
//
// Registration became load-bearing with per-fee-item due dates: paid_pct is
// measured on the DUE-as-on-date basis, so its denominator grows when a due
// date ARRIVES, with no payment and therefore no trigger to fire. Without a
// scheduled re-evaluation a learner who has already paid enough can sit in the
// wrong status until their next receipt happens to land.
//
// Manual run:
//   curl "$APP_URL/api/cron/billing/learner-status-sweep?secret=$CRON_SECRET"
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');

  if (cronSecret) {
    const headerOk = authHeader === `Bearer ${cronSecret}`;
    const queryOk = querySecret === cronSecret;
    if (!headerOk && !queryOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Sessionless context: no cookie identity exists here, and the RPC is
    // granted to service_role only.
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase.rpc(
      'fn_sweep_learner_status_promotions',
      { p_max_learners: 5000 }
    );

    // Supabase errors are plain objects, never Error instances — a try/catch
    // around this call would not see an RLS or grant failure.
    if (error) {
      logger.error('billing/status-sweep', 'sweep RPC failed', error);
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 500 }
      );
    }

    const result = (data ?? {}) as {
      evaluated?: number;
      promoted_to_reserved?: number;
      promoted_to_admitted?: number;
      promoted_total?: number;
      capped?: boolean;
    };

    // Loud on a non-zero night: real-time promotion is supposed to have already
    // handled these, so anything the sweep catches is a trigger that did not fire.
    if ((result.promoted_total ?? 0) > 0) {
      logger.warn(
        'billing/status-sweep',
        `sweep promoted ${result.promoted_total} learner(s) the payment triggers missed`,
        result
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
      duration_ms: Date.now() - startTime
    });
  } catch (error: any) {
    logger.error('billing/status-sweep', 'learner-status-sweep failed', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
