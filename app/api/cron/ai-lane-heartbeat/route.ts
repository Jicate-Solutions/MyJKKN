// =====================================================================
// AI lane heartbeat — prove the max-lane workers are ALIVE, and catch stuck work
// =====================================================================
// THE PROBLEM THIS SOLVES
// A drain that is DEAD and a drain that is merely IDLE look identical from
// the outside. The queue-health card reports "windows-pde silent 502m", and
// that number means nothing on its own: it is equally consistent with "the
// worker died eight hours ago" and "nobody asked it to do anything".
//
// The usual health check — "is any job pending longer than N minutes?" — is
// VACUOUS on this lane, because with zero traffic there are zero pending jobs
// and the check passes while verifying nothing. Observed 2026-07-29: the lane
// reported perfectly healthy for 19 hours while nobody could tell whether the
// worker existed. The only way to distinguish the two states is to put a job
// in and see whether something eats it.
//
// HOW IT WORKS (two-phase, one run per hour)
//   Phase 1 — VERDICT on the PREVIOUS probe.
//     If the last heartbeat probe is still pending/claimed and older than
//     STALE_MINUTES, the drain did not pick it up: raise a notification.
//     If it completed, the drain was alive as of that probe.
//   Phase 2 — enqueue a FRESH probe for the next run to judge.
//
// Detection latency is therefore up to one cron period. That is a deliberate
// trade: a synchronous "enqueue then poll" would hold the request open for the
// 8-10s the model takes, and cron routes should not block on model latency.
//
// WHY THE PROMPT SAYS "LIVENESS PROBE"
// The lane watcher and the alerting path both EXCLUDE prompts beginning
// "LIVENESS PROBE" / "SMOKE TEST". Keeping that exact prefix is load-bearing:
// an alert channel that fires on its own synthetic rows trains everyone to
// ignore it, and then it is worth less than no alert at all.
//
// COST: the probe answers a one-word question on the ₹0 Max lane. The measured
// cost of an identical probe on 2026-07-29 was cost_inr = 0.
//
// Vercel cron line (reconciler adds to vercel.json — DO NOT edit here):
//   {"path":"/api/cron/ai-lane-heartbeat?secret=$CRON_SECRET","schedule":"23 * * * *"}
// Minute 19 deliberately: minute 0 carries 5 hourly crons and minute 23 carries 3.
// A heartbeat that queues behind a stampede reports latency that is not the
// lane's fault.
//
// Pattern reference: app/api/cron/ai-pulse-rotation-tick/route.ts (auth block).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const LANE = 'max-pde';
const JOB_TYPE = 'pde.clinical_reasoning.coach';
const PROBE_PROMPT = 'LIVENESS PROBE - reply with the single word: alive';

// A probe unclaimed this long means no worker is polling (lane, interactive).
// Well past the drain's ~1-minute poll cadence, so a busy lane never trips it.
const STALE_MINUTES = 20;

export async function GET(req: NextRequest) {
  // -- Auth: CRON_SECRET (Vercel cron sends as Authorization header) ----
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const startedAt = Date.now();

  // -- Gate: only probe a lane that is actually switched on ---------------
  // Probing a disabled job type would enqueue work nothing is meant to claim,
  // and then alert about the silence it just manufactured.
  const { data: jt, error: jtErr } = await (supabase as any)
    .from('ai_job_types')
    .select('enabled, lane')
    .eq('job_type', JOB_TYPE)
    .maybeSingle();

  if (jtErr) {
    return NextResponse.json(
      { error: 'Failed to read ai_job_types', detail: jtErr.message },
      { status: 500 },
    );
  }
  if (!jt?.enabled || jt.lane !== LANE) {
    return NextResponse.json({
      ok: true,
      skipped: `job type disabled or not on ${LANE}`,
      enabled: jt?.enabled ?? null,
      lane: jt?.lane ?? null,
    });
  }

  // -- Phase 1: judge the PREVIOUS probe ----------------------------------
  const { data: prior } = await (supabase as any)
    .from('ai_jobs')
    .select('id, status, requested_at, claimed_at, completed_at')
    .eq('lane', LANE)
    .eq('job_type', JOB_TYPE)
    .order('requested_at', { ascending: false })
    .limit(1);

  const last = prior?.[0];
  let verdict: 'alive' | 'drain_down' | 'no_prior' = 'no_prior';
  let ageMin: number | null = null;

  if (last) {
    ageMin = Math.round((Date.now() - new Date(last.requested_at).getTime()) / 60000);
    if (last.status === 'done') {
      verdict = 'alive';
    } else if (ageMin >= STALE_MINUTES) {
      // pending or claimed-but-never-finished, well past the poll cadence
      verdict = 'drain_down';
    } else {
      verdict = 'alive'; // too young to judge; treat as not-yet-failed
    }
  }

  if (verdict === 'drain_down') {
    // Resolve super-admins to explicit user_ids rather than targeting by role.
    //
    // `targeting` is NOT NULL, but its CONTENTS are not validated — an unknown
    // key inserts cleanly and then reaches nobody. Measured across ~190k live
    // rows: {"type":"user","user_ids":[...]} accounts for 80k+ deliveries,
    // "target_roles" appears 4 times, and a bare "roles" key appears ZERO
    // times. A health alert that inserts successfully and is delivered to no
    // one is worse than no alert, because it reads as coverage.
    const { data: admins } = await (supabase as any)
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true)
      .limit(50);

    const userIds: string[] = (admins ?? []).map((a: { id: string }) => a.id);

    if (userIds.length > 0) {
      await (supabase as any).from('notifications').insert({
        title: 'PDE coaching worker looks down',
        body:
          `The max-pde liveness probe has sat ${ageMin} minutes without being ` +
          `picked up (status: ${last.status}). Learners submitting a clinical ` +
          `case answer right now would get nothing back.`,
        url: '/admin/ai-routines',
        category: 'pde.lane.heartbeat',
        priority: 'high',
        targeting: { type: 'user', user_ids: userIds },
        metadata: { kind: 'pde_lane_heartbeat', lane: LANE, probe_job_id: last.id, age_min: ageMin },
      });
    }
  }

  // -- Phase 2: enqueue a fresh probe for the next run to judge -----------
  let enqueued: unknown = null;
  const { data: enq, error: enqErr } = await (supabase as any).rpc('fn_ai_enqueue_system', {
    p_job_type: JOB_TYPE,
    p_payload: { prompt: PROBE_PROMPT },
    p_dedupe_key: `ai-lane-heartbeat:${new Date().toISOString().slice(0, 13)}`,
  });
  if (enqErr) {
    return NextResponse.json(
      { ok: false, verdict, error: 'enqueue failed', detail: enqErr.message },
      { status: 500 },
    );
  }
  enqueued = enq;

  // -- Phase 3: STUCK REAL WORK on any max-* lane -------------------------
  // The probe above answers "is the PDE worker alive", which only works
  // because that lane has no traffic. Lanes that DO carry real work need the
  // opposite check: a genuine job sitting unclaimed. Injecting probes there
  // would be noise, and watching only PDE would miss the failure that actually
  // costs someone something.
  //
  // This matters most for max-sentiment. `shouldDeferToMaxLane` is FAIL-OPEN:
  // once the maxlane:voice-memo-sentiment schedule row exists, memos are routed
  // to the lane whether or not a worker is there to take them. If the runner
  // stops, memos pile up unprocessed with no error raised anywhere — the whole
  // point of "never pay, wait instead" is that waiting is silent.
  //
  // Deliberately lane-generic rather than sentiment-specific: it is no harder,
  // and it covers `max`, `max-pde` and any lane added later without a code
  // change. Runner names are not enumerated for the same reason.
  const { data: stuck } = await (supabase as any)
    .from('ai_jobs')
    .select('id, job_type, lane, requested_at')
    .eq('status', 'pending')
    .like('lane', 'max%')
    .lt('requested_at', new Date(Date.now() - STALE_MINUTES * 60_000).toISOString())
    .order('requested_at', { ascending: true })
    .limit(20);

  const stuckJobs: Array<{ id: string; job_type: string; lane: string; requested_at: string }> =
    stuck ?? [];

  if (stuckJobs.length > 0) {
    const byLane = stuckJobs.reduce<Record<string, number>>((acc, j) => {
      acc[j.lane] = (acc[j.lane] ?? 0) + 1;
      return acc;
    }, {});
    const oldestMin = Math.round(
      (Date.now() - new Date(stuckJobs[0].requested_at).getTime()) / 60000,
    );

    const { data: admins2 } = await (supabase as any)
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true)
      .limit(50);
    const ids2: string[] = (admins2 ?? []).map((a: { id: string }) => a.id);

    if (ids2.length > 0) {
      await (supabase as any).from('notifications').insert({
        title: 'AI work is piling up unclaimed',
        body:
          `${stuckJobs.length} job(s) have waited over ${STALE_MINUTES} minutes ` +
          `with no worker taking them (oldest ${oldestMin}m). By lane: ` +
          Object.entries(byLane).map(([l, n]) => `${l}=${n}`).join(', ') +
          `. Voice memos and coaching answers silently wait rather than fail, ` +
          `so nothing else will report this.`,
        url: '/admin/ai-routines',
        category: 'ai.lane.stuck',
        priority: 'high',
        targeting: { type: 'user', user_ids: ids2 },
        metadata: {
          kind: 'ai_lane_stuck',
          by_lane: byLane,
          oldest_min: oldestMin,
          sample_job_ids: stuckJobs.slice(0, 5).map((j) => j.id),
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    verdict,
    prior_probe: last ? { id: last.id, status: last.status, age_min: ageMin } : null,
    stuck_jobs: stuckJobs.length,
    enqueued,
    duration_ms: Date.now() - startedAt,
  });
}
