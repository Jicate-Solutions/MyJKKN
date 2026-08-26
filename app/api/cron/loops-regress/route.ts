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
// Concurrent double-fire can't duplicate audit rows: the dispatcher's
// fn_ai_routine_claim_due marks the slot atomically before firing (review r3
// disposition); manual re-runs appending extra rows is fine — audits are an
// append-only log and the notification fanout is idempotent.
// Coverage today: scf (the proven recipe), feeder (cycle_delta known-delta,
// added 2026-07-13), mess (2026-07-26), bug-triage + induction-session
// (2026-08-13 — the last two chartered-but-unproven loops; each asserts
// through the loop's REAL measurement fn, never a re-implementation),
// work-pulse (2026-08-26 — adoption-delta measurer, Wave-2 return edge),
// ops-cycletime (2026-08-26 — the shared three-queue cycle-time measurer), and
// attendance-intervention (2026-08-26 — the attendance return edge's
// fn_attendance_measure_intervention_effect, known deltas 0.00 / +50.00pp).
// Additional loops join by adding fn_loops_regress_<loop> + extending
// LOOP_FNS — see .claude/loop-manifests/.
//
// Alerting (wire 2): any verdict that is not 'measure-verified' fans out a
// HIGH-priority notification to every super admin (two-write pattern).
// Silence stays meaningful: a healthy week produces no notification at all.
//
// Auth: CRON_SECRET Bearer only — dispatcher and the AI Routines manual
// trigger both send the header; secrets never sit in URLs (review 2026-07-11
// #3; diverges from the older scf-measure-outcomes mould deliberately).
// Created: 2026-07-11 (Director: "yes want them").

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { findingsFingerprint } from '@/lib/ai-routines/loop-governance';

// One RPC per manifested loop with an in-DB sim. Extend alongside the
// manifests — never remove entries without retiring the manifest too.
const LOOP_FNS: { loopKey: string; fn: string }[] = [
  { loopKey: 'scf', fn: 'fn_loops_regress_scf' },
  { loopKey: 'feeder', fn: 'fn_loops_regress_feeder' },
  { loopKey: 'mess', fn: 'fn_loops_regress_mess' },
  { loopKey: 'bug-triage', fn: 'fn_loops_regress_bug_triage' },
  { loopKey: 'induction-session', fn: 'fn_loops_regress_induction' },
  // Return-edge measurer (fn_learner_360_measure_reverdict_delta) proven by
  // known-delta sim. Until 20260930010000/20260930020000 are applied this
  // entry reports sim-error weekly — a deliberate visible nudge, not a bug.
  { loopKey: 'learner-360', fn: 'fn_loops_regress_learner360' },
  { loopKey: 'work-pulse', fn: 'fn_loops_regress_workpulse' },
  { loopKey: 'ops-cycletime', fn: 'fn_loops_regress_ops_cycletime' },
  { loopKey: 'attendance-intervention', fn: 'fn_loops_regress_attendance' },
  // consultants (2026-08-26): apply 20261003030000 via Mgmt API BEFORE this
  // line ships — the fn's absence reads as a weekly sim-error alert.
  { loopKey: 'consultants', fn: 'fn_loops_regress_consultants' },
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
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
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
      const raw = (Array.isArray(data) ? data[0] : data) as RegressRow | undefined;
      // An empty result set from the RPC is itself a sim failure — without
      // this guard `undefined` reached the verdict filter and 500'd the run
      // after side effects (review r3).
      const row: RegressRow = raw ?? {
        loop_key: loopKey,
        verdict: 'sim-error: rpc returned no row',
        no_change_lift: null,
        known_delta_lift: null,
      };
      results.push(row);
      // Exact match on purpose: a regress fn's vocabulary is closed
      // (measure-verified | sim-failed | sim-error) — anything unexpected
      // SHOULD alarm here, unlike the watchdog's broader isBadVerdict sweep
      // (review 2026-07-11 #4 disposition). Empty-seed → sim-failed is also
      // deliberate: on this tenant an empty session_feedback would itself be
      // an incident, not a skip (review #6 disposition).
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
      // Same persistent trail as the RPC-error branch — a thrown exception
      // must still leave a loop_audits row / red badge (review r2). Guarded:
      // the audit write failing must not mask the original error.
      try {
        await admin.from('loop_audits').insert({
          loop_key: loopKey,
          layer: 'sim',
          verdict: row.verdict,
          evidence: { runner: 'loops-regress-cron', thrown: String(e).slice(0, 500) },
        });
      } catch {
        /* audit trail is best-effort here; the notification below still fires */
      }
    }
  }
  // Sentinel-leftover note (review r2): the sim's ZZREGRESS seeds live only
  // inside fn_loops_regress_*'s own subtransaction — a dropped connection
  // aborts the whole transaction server-side, so committed leftovers cannot
  // exist and no pre-clean write is needed here.

  // Wire 2 — alert supers on any non-verified verdict. Idempotent per IST day.
  let notified = 0;
  if (failures.length > 0) {
    // Audience lookup failure must FAIL the run, not fan out to nobody
    // (review r4); a 500 lands in last_status, which the daily watchdog
    // alarms on.
    const { data: supers, error: supersErr } = await admin
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true);
    if (supersErr || !supers?.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `super-admin lookup failed: ${supersErr?.message ?? 'no recipients'}`,
          failures: failures.map((f) => ({ loop: f.loop_key, verdict: f.verdict })),
        },
        { status: 500 }
      );
    }
    const userIds = supers.map((s: { id: string }) => s.id);
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
      // Day + failure-set fingerprint: a manual re-run over the same failures
      // stays deduplicated; a distinct same-day failure still pages.
      idempotencyKey: `loops-regress-fail:${istDay}:${findingsFingerprint(
        failures.map((f) => `${f.loop_key}:${f.verdict}`)
      )}`,
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
