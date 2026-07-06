// =====================================================================
// Cohort Moat — auto-propose on cohort close (M5 → M7 hand-off)
// =====================================================================
// For every CLOSED SF100 cohort that does not already have an open/applied
// feed-forward proposal, best-effort: assign experiment arms (idempotent) →
// compute the causal-lift experiment → propose an adjustment. The proposal is
// created in a SERVICE context (auth.uid() NULL → proposed_by NULL), so it lands
// as status='pending' and awaits a HUMAN approver (M7). This cron NEVER auto-
// applies anything — it only surfaces the machine's suggestion so the loop can't
// silently die waiting for someone to click "check for adjustments".
//
// Safe-by-construction: only CLOSED cohorts are considered (M5), and a cohort
// without both arms scored (>= min_arm_n each) yields a NULL causal_lift → the
// proposer refuses (best-effort swallowed) → no proposal. So this does nothing at
// all until a cohort genuinely closes with a computable result.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query param.
// Does not call Claude. Created 2026-07-06 (assumption-thrash follow-up to #1843).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (
    !cronSecret ||
    (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: cohorts, error } = await supabase
    .from('cohorts')
    .select('id')
    .eq('kind', 'sf100')
    .in('status', ['completed', 'archived']);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let considered = 0;
  let generated = 0;
  let alreadyHadProposal = 0;
  let noProposalYet = 0;

  for (const c of cohorts ?? []) {
    considered++;

    // Idempotent: skip cohorts that already have an open/applied proposal (the DB
    // partial unique index also enforces one-open-per-cohort, but skipping avoids
    // re-running the RPCs unnecessarily).
    const { data: existing } = await supabase
      .from('cohort_adjustment_proposals')
      .select('id')
      .eq('based_on_cohort_id', c.id)
      .in('status', ['pending', 'applied'])
      .limit(1);
    if (existing && existing.length > 0) {
      alreadyHadProposal++;
      continue;
    }

    try {
      // Arms are normally set at enrolment; re-assert (idempotent) as a backstop.
      await supabase.rpc('fn_assign_experiment_arms_for_cohort', { p_cohort_id: c.id });
      await supabase.rpc('fn_compute_cohort_experiment', { p_cohort_id: c.id });
      const { data: prop, error: perr } = await supabase.rpc(
        'fn_propose_cohort_adjustments',
        { p_cohort_id: c.id },
      );
      if (!perr && prop) generated++;
      else noProposalYet++; // expected M5 rejection: NULL causal lift / below min-arm-n
    } catch {
      noProposalYet++; // best-effort — never fail the whole sweep on one cohort
    }
  }

  return NextResponse.json({
    ok: true,
    considered,
    generated,
    already_had_proposal: alreadyHadProposal,
    no_proposal_yet: noProposalYet,
  });
}
