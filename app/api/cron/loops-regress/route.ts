// =============================================================================
// LOOPS REGRESS — the scheduled known-delta sim (governance wire 1)
// =============================================================================
// Weekly (dispatcher row 'loops-regress', Sundays 07:53 IST): re-proves each
// manifested loop's MEASURE function against production with known deltas —
// the standing defense against the fabricated-metric bug class (a broken
// measurer turns a "self-improving" loop into a confident liar; build/type
// gates cannot catch it, only a known-delta assert can — moat-loop capstone,
// 2026-06-28; re-proven executable 2026-07-10).
//
// The sim itself runs INSIDE fn_loops_regress_scf's subtransaction: seeds are
// rolled back in the same call; the only persistent write is the loop_audits
// verdict row, which /admin/loops renders as the chip's "tested" badge.
// Coverage today: scf (the proven recipe). Additional loops join by adding
// fn_loops_regress_<loop> + extending LOOP_FNS — see .claude/loop-manifests/.
//
// Alerting (wire 2): any verdict that is not 'measure-verified' fans out a
// HIGH-priority notification to every super admin (two-write pattern).
// Silence stays meaningful: a healthy week produces no notification at all.
//
// Auth: CRON_SECRET Bearer (dispatcher) OR ?secret= (manual). Mould of
// /api/cron/scf-measure-outcomes.
// Created: 2026-07-11 (Director: "yes want them").

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

// One RPC per manifested loop with an in-DB sim. Extend alongside the
// manifests — never remove entries without retiring the manifest too.
const LOOP_FNS: { loopKey: string; fn: string }[] = [
  { loopKey: 'scf', fn: 'fn_loops_regress_scf' },
];

type RegressRow = {
  loop_key: string;
  verdict: string;
  no_change_lift: number | null;
  known_delta_lift: number | null;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const results: RegressRow[] = [];
  const failures: RegressRow[] = [];

  for (const { loopKey, fn } of LOOP_FNS) {
    try {
      const { data, error } = await admin.rpc(fn);
      if (error) {
        // The fn itself records sim-error verdicts; an RPC-level error means
        // we could not even run it — record that honestly too.
        const row: RegressRow = {
          loop_key: loopKey,
          verdict: `sim-error: rpc failed — ${error.message}`.slice(0, 200),
          no_change_lift: null,
          known_delta_lift: null,
        };
        results.push(row);
        failures.push(row);
        await admin.from('loop_audits').insert({
          loop_key: loopKey,
          layer: 'sim',
          verdict: row.verdict,
          evidence: { runner: 'loops-regress-cron', rpc_error: error.message },
        });
        continue;
      }
      const row = (Array.isArray(data) ? data[0] : data) as RegressRow;
      results.push(row);
      if (row.verdict !== 'measure-verified') failures.push(row);
    } catch (e) {
      const row: RegressRow = {
        loop_key: loopKey,
        verdict: `sim-error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
        no_change_lift: null,
        known_delta_lift: null,
      };
      results.push(row);
      failures.push(row);
    }
  }

  // Wire 2 — alert supers on any non-verified verdict. Idempotent per IST day.
  let notified = 0;
  if (failures.length > 0) {
    const { data: supers } = await admin
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true);
    const userIds = (supers ?? []).map((s: { id: string }) => s.id);
    const istDay = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
    const outcome = await fanoutNotification(admin, {
      title: `⛔ Loop regress FAILED: ${failures.map((f) => f.loop_key).join(', ')}`,
      body:
        failures
          .map((f) => `${f.loop_key}: ${f.verdict} (no-change=${f.no_change_lift}, +2=${f.known_delta_lift})`)
          .join(' · ') +
        ' — a loop measure no longer proves out against known deltas. Treat as a release blocker for whatever last touched its functions.',
      userIds,
      priority: 'urgent',
      category: 'loops',
      url: '/admin/loops',
      idempotencyKey: `loops-regress-fail:${istDay}`,
      source: 'loops-regress-cron',
    });
    notified = outcome.notified;
  }

  return NextResponse.json({
    ok: true,
    ran: results.length,
    verified: results.filter((r) => r.verdict === 'measure-verified').length,
    failures: failures.map((f) => ({ loop: f.loop_key, verdict: f.verdict })),
    notified,
  });
}
