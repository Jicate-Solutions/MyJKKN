export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Gate-pass overdue sweep.
 *
 * WHY THIS EXISTS
 * ---------------
 * `overdue` is a live label on gate_pass_status_enum and four surfaces read
 * it — the gate-pass queue's "Out now" tab, the campus-living dashboard card,
 * the /campus-living landing alert, and the ID-card Morning Page's
 * `gate_pass_overdue` exception. Until this route, NOTHING ever set it: there
 * was no cron, no pg_cron job and no trigger, and `markOverdue()` had zero
 * callers. Every one of those surfaces was structurally, permanently zero —
 * not "no overdue learners tonight", but "this number cannot move".
 *
 * WHAT IT DOES, AND DELIBERATELY DOES NOT
 * ----------------------------------------
 * Flips `active` → `overdue` for passes whose return time has passed. That is
 * all. In particular:
 *
 *   • It does NOT touch `issued`. An issued pass whose window closed belongs
 *     to a learner who never left — that is "the approval expired", not "they
 *     haven't come back", and the gate scanner already reads it correctly as
 *     `approved_window_closed`. Sweeping it into `overdue` would put someone
 *     who is asleep in their room onto a list of people missing from campus.
 *
 *   • It sends NOTHING. A learner going overdue is exactly when a parent wants
 *     to hear, but a cron that messages families is an outward-facing change
 *     of its own and is not being added as a side effect of a status sweep.
 *     The gate already notifies a parent on exit and on a late return.
 *
 * The sweep is IDEMPOTENT by construction: it only matches `active`, and it
 * writes `overdue`, so a second run within the same minute matches nothing.
 * `overdue` is also still scannable — getScannablePassesForLearner includes
 * it precisely because an overdue learner is the one standing at the gate
 * wanting to come back in, and recordReturn accepts it.
 *
 * Cluster-wide, not per-institution: a learner is late against a clock, not
 * against a tenant. RLS is bypassed here by design (service role) — the same
 * reasoning as every other cron in this directory.
 *
 * Backed by `idx_hgp_open_by_due`, the partial index on
 * `(expected_return) WHERE actual_return IS NULL` added by
 * 20260912120000_gate_pass_rebuild.sql.
 *
 * Schedule in vercel.json: hourly. A pass is due at a minute-level time, so
 * an hourly resolution means a learner shows as overdue within the hour —
 * fast enough for a morning exception list, and cheap.
 * Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron)
 * OR `?secret=` (manual runs).
 */

const LOG = '[cron/campus-living/gate-pass-overdue]';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn(`${LOG} CRON_SECRET not configured`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn(`${LOG} Unauthorized attempt`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();
  const now = new Date().toISOString();

  const { data, error } = await db
    .from('hostel_gate_passes')
    .update({ status: 'overdue' })
    .eq('status', 'active')
    .lt('expected_return', now)
    // Belt and braces. An 'active' pass with an actual_return should not
    // exist, and this also matches the partial index's predicate exactly.
    .is('actual_return', null)
    .select('id, learner_id, institution_id, pass_number, expected_return');

  if (error) {
    // A failed sweep must be loud. A silent one leaves every overdue surface
    // reading zero, which is indistinguishable from "nobody is late" — the
    // exact ambiguity this route exists to remove.
    console.error(`${LOG} sweep failed`, error.message);
    return NextResponse.json(
      { ok: false, error: error.message, duration_ms: Date.now() - startTime },
      { status: 500 },
    );
  }

  const flipped = (data ?? []) as Array<{
    id: string;
    learner_id: string;
    institution_id: string;
    pass_number: string | null;
    expected_return: string;
  }>;

  if (flipped.length > 0) {
    console.warn(
      `${LOG} ${flipped.length} pass(es) went overdue`,
      flipped.map((p) => ({ id: p.id, pass_number: p.pass_number, due: p.expected_return })),
    );
  }

  return NextResponse.json({
    ok: true,
    swept_at: now,
    marked_overdue: flipped.length,
    passes: flipped.map((p) => ({
      id: p.id,
      pass_number: p.pass_number,
      institution_id: p.institution_id,
      expected_return: p.expected_return,
    })),
    duration_ms: Date.now() - startTime,
  });
}
