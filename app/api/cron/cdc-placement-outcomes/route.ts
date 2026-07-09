export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * CDC Placement-Outcome loop — MEASURE-phase trigger (gates ①③ ONLY).
 *
 * Honesty label: this is NOT a self-improving loop yet. It measures each
 * (institution, program, passing-out AY) cohort's placement/higher-ed
 * conversion against the prior cohort's baseline and emits NAAC 8.2.1
 * evidence ('Placement + higher studies progression' — overlaps NIRF GO,
 * the ~20-25% NIRF parameter JKKN can actually move). The act/feed-forward
 * gates (②④) require a named CDC owner who consumes the deltas — Director
 * decision pending.
 *
 * All work happens in fn_cdc_placement_outcome_measure() (service-role-only,
 * SECURITY DEFINER): cohort enumeration from alumni_outcomes, small-cohort
 * labeling (ALL cohorts computed; n < min_cohort_size gets small_cohort=true —
 * 'Compute, but label small group', Director 2026-07-09), baseline delta
 * (±2.0pp deadband), change-only cycle history, evidence upsert. Cohort
 * AGGREGATES only, never per-student rows. Idempotent per (cohort, IST
 * calendar-month window).
 *
 * Gated on platform policy cdc_placement_loop.master_enabled (DARK by default
 * → returns skipped). Gate is checked both here and inside the fn.
 * Cadence: ai-routine dispatcher row 'cdc-placement-outcomes' (Sun 03:15 IST —
 * the dispatcher has no monthly granularity; the month-window idempotency +
 * change-only history make the effective cadence monthly).
 * Auth: CRON_SECRET via ?secret= / Authorization: Bearer / x-vercel-cron
 * (matches the other crons).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();

  // Gate — the loop is dark unless its master switch is explicitly true.
  const { data: pol } = await db
    .from('platform_policies')
    .select('value')
    .eq('policy_key', 'cdc_placement_loop.master_enabled')
    .eq('scope_type', 'global')
    .maybeSingle();
  if (!pol || pol.value !== true) {
    return NextResponse.json({
      success: true,
      skipped: 'loop dark (cdc_placement_loop.master_enabled != true)',
    });
  }

  const { data, error } = await db.rpc('fn_cdc_placement_outcome_measure');
  if (error) {
    console.error('[cdc/placement-outcomes] measure run failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, run: data });
}
