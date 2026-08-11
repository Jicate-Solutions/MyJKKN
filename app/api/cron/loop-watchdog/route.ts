// =============================================================================
// LOOP WATCHDOG — silence must not look like health (governance wire 3)
// =============================================================================
// Daily (dispatcher row 'loop-watchdog', 09:23 IST — after the 08:15 measure):
// three sweeps over the loop plumbing, one notification if anything is wrong,
// silence when healthy.
//
//   1. SILENT routines — dispatcher-managed, enabled, but last fired further
//      back than their OWN cadence allows (derived from days_of_week: a daily
//      row alarms after ~25h, a Sundays-only row after ~7d — a flat cutoff would
//      false-alarm every weekly routine 6 days out of 7, review 2026-07-11 #1).
//      A dead dispatcher, a disabled schedule, or a deploy that broke a route
//      all look like this. Receipt for the failure class: pde-bridge fired
//      HTTP 200 daily into a dead pipe for days; nothing anywhere went red
//      (reference_ai_pulse_loop_weld).
//   2. ERRORED routines — last_status carrying an HTTP 4xx/5xx, an "error:"
//      token, or a skip. These were previously visible only to someone who
//      happened to open /admin/ai-routines and read the grey text. A stale
//      pre-deploy "skipped: not in registry" whose id the RUNNING registry
//      now knows is suppressed — it self-heals at the next fire (review r2).
//   2b. DISABLED routines — managed=true but enabled=false. A loop-bearing
//      routine that should be off long-term is managed=false by convention
//      (the maxlane pattern); enabled=false on a managed row silences a loop
//      and must be visible, not skipped (review r2 — the old sweep filtered
//      enabled=true while claiming to catch "a disabled schedule").
//   3. FAILURE VERDICTS — loop_audits rows from the last 26h whose verdict is
//      sim-failed / sim-error / walk-failed (shared isBadVerdict vocabulary).
//      Honest states (self-reinforcing, no-loop, unmeasurable-no-fuel) are
//      states, not alarms (review #2/#4). Belt-and-braces with the regress
//      cron's own alert.
//
// Known limitation (review #5, accepted): a route that returns HTTP 200 but
// no-ops keeps last_fired_at fresh and is invisible here — the positive
// liveness signal for that class is the per-loop regress sim (fn_loops_regress_*,
// wire 1); coverage grows loop by loop via LOOP_FNS.
//
// Scope: managed=true rows ONLY. The maxlane:* rows are managed=false —
// consumed by the local Mac poller, deliberately not watched here (their
// silence is expected whenever the Mac lane is off).
//
// Auth: CRON_SECRET Bearer only — dispatcher and the AI Routines manual
// trigger both send the header; secrets never sit in URLs (review #3).
// Created: 2026-07-11 (Director: "yes want them").

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  staleThresholdMs,
  isBadVerdict,
  isAlarmStatus,
  findingsFingerprint,
} from '@/lib/ai-routines/loop-governance';
import { getRoutineById } from '@/lib/ai-routines/registry';

const AUDIT_WINDOW_HOURS = 26; // audit sweep window: this cron's own daily cadence + slack

// 2026-08-09 expiry — see the fanout below. The TTL is DERIVED from this
// routine's own dispatcher row (staleThresholdMs over its days_of_week), because
// that schedule is editable on /admin/ai-routines with no deploy: a literal 36h
// would silently invert the moment someone slowed the cadence down.
// 1.5x the cadence absorbs a LATE run, not a fully skipped cycle (that would
// need >= 2x). Moot for this routine in practice: the 7-day floor below
// dominates 1.5x a daily cadence, so the effective TTL is 7 days either way.
const TTL_CYCLE_MULTIPLIER = 1.5;
// FLOOR, and the reason this routine is not just `cycle * 1.5`: loop-watchdog
// exists so that silence does not look like health, and it is itself
// dispatcher-run. If the dispatcher dies, no new edition is emitted — so a
// 36h TTL would empty the bell of watchdog rows exactly during the outage the
// routine was built to surface. A TTL can never MAKE an outage visible; it can
// only avoid deleting the last evidence of one too soon. 7 days outlives a
// plausible outage while still capping the stack at ~7 rows instead of the
// unbounded growth this change is here to stop. Kept in step with the
// 'loop_watchdog' bucket in
// supabase/migrations/20260816040100_backfill_expire_stale_notification_digests.sql.
const WATCHDOG_MIN_TTL_MS = 7 * 24 * 3600_000;
const OWN_ROUTINE_ID = 'loop-watchdog';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const nowMs = Date.now();

  const { data: rows, error: schedErr } = await admin
    .from('ai_routine_schedules')
    .select('routine_id, enabled, managed, days_of_week, last_fired_at, last_status, updated_at')
    .eq('managed', true);
  if (schedErr) {
    return NextResponse.json({ ok: false, error: schedErr.message }, { status: 500 });
  }

  type Row = {
    routine_id: string;
    enabled: boolean;
    days_of_week: number[] | null;
    last_fired_at: string | null;
    last_status: string | null;
    updated_at: string | null;
  };
  const managed = (rows ?? []) as Row[];
  // enabled=false on a managed row is its own finding; the silent/errored
  // sweeps only judge rows that are supposed to be firing.
  const disabled = managed.filter((r) => !r.enabled);
  const active = managed.filter((r) => r.enabled);
  const silent = active.filter((r) => {
    // Compare instants, not timestamp strings — PostgREST's `+00:00`/µs format
    // vs toISOString()'s `Z` makes lexicographic comparison boundary-unreliable
    // (review #7). Anchor on last fire, falling back to the row's updated_at
    // for never-fired rows; a row with neither signal is an alarm by itself.
    // Accepted trade-off (review r3): editing a never-fired row refreshes
    // updated_at and delays its silence alarm by one cadence period — the
    // alternative (flag every never-fired row) would false-page each freshly
    // seeded routine before its first scheduled fire (e.g. a Sunday row
    // seeded on a Thursday).
    const anchor = r.last_fired_at ?? r.updated_at;
    if (!anchor) return true;
    return nowMs - new Date(anchor).getTime() > staleThresholdMs(r.days_of_week);
  });
  const errored = active.filter((r) =>
    isAlarmStatus(r.last_status, Boolean(getRoutineById(r.routine_id)))
  );

  // Fetch the window unfiltered and classify with the shared vocabulary —
  // keeping the good/bad decision in one place (loop-governance) instead of a
  // PostgREST ilike that both false-alarmed honest states and NULL-skipped
  // (verdict is NOT NULL today, but isBadVerdict guards NULL anyway).
  // Explicit limit: PostgREST silently caps unbounded selects at 1000; 5000
  // is far above any real 26h audit volume, and a window that busy is itself
  // pathological (review r2).
  const auditCutoff = new Date(nowMs - AUDIT_WINDOW_HOURS * 3600_000).toISOString();
  const { data: audits } = await admin
    .from('loop_audits')
    .select('loop_key, verdict, audited_at')
    .gte('audited_at', auditCutoff)
    .limit(5000);
  const badAudits = ((audits ?? []) as { loop_key: string; verdict: string | null }[]).filter(
    (a) => isBadVerdict(a.verdict)
  );

  const findings: string[] = [
    ...silent.map(
      (r) => `SILENT: ${r.routine_id} last fired ${r.last_fired_at ?? 'never'}`
    ),
    ...errored.map((r) => `ERROR: ${r.routine_id} → ${r.last_status}`),
    ...disabled.map((r) => `DISABLED: ${r.routine_id} (managed loop routine switched off)`),
    ...badAudits.map((a) => `VERDICT: ${a.loop_key} → ${a.verdict}`),
  ];

  let notified = 0;
  if (findings.length > 0) {
    // The audience lookup failing must FAIL the run, not silently fan out to
    // nobody (review r4): a 500 here lands in last_status via the dispatcher,
    // which this same watchdog alarms on tomorrow — the wire watches itself.
    const { data: supers, error: supersErr } = await admin
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true);
    if (supersErr || !supers?.length) {
      return NextResponse.json(
        { ok: false, error: `super-admin lookup failed: ${supersErr?.message ?? 'no recipients'}`, findings },
        { status: 500 }
      );
    }
    const userIds = supers.map((s: { id: string }) => s.id);
    const istDay = new Date(nowMs + 19_800_000).toISOString().slice(0, 10);
    // Own cadence, read from the same managed rows already fetched above — no
    // extra query. A missing own-row (never seeded) falls through
    // staleThresholdMs's own "assume daily" default, and the floor applies
    // either way.
    const ownRow = managed.find((r) => r.routine_id === OWN_ROUTINE_ID);
    const expiresMs = Math.max(
      Math.round(staleThresholdMs(ownRow?.days_of_week) * TTL_CYCLE_MULTIPLIER),
      WATCHDOG_MIN_TTL_MS
    );
    const outcome = await fanoutNotification(admin, {
      title: `🔴 Loop watchdog: ${findings.length} issue${findings.length === 1 ? '' : 's'} (${silent.length} silent, ${errored.length} errored, ${disabled.length} disabled, ${badAudits.length} bad verdicts)`,
      body:
        findings.slice(0, 12).join(' · ') +
        (findings.length > 12 ? ` · …and ${findings.length - 12} more (see /admin/loops)` : ''),
      userIds,
      priority: 'high',
      category: 'loops',
      url: '/admin/loops',
      // Day + finding-set fingerprint: the same findings re-checked stay
      // deduplicated, but a DISTINCT failure later the same day still pages.
      idempotencyKey: `loop-watchdog:${istDay}:${findingsFingerprint(findings)}`,
      source: 'loop-watchdog-cron',
      // 2026-08-09: a restatement of the current failure set — a still-broken
      // routine pages again next cycle under a new istDay. Without an expiry
      // every edition stayed unread forever (14 of the Director's 680 unread).
      // TTL = max(own cadence x 1.5, 7 days): derived from THIS routine's own
      // dispatcher row so a cadence edit on /admin/ai-routines cannot silently
      // invert the margin, and floored at 7 days so a dispatcher outage does not
      // empty the bell of the very rows that record it (see WATCHDOG_MIN_TTL_MS).
      // Honoured by liveNotificationOrFilter() in the bell/inbox read path;
      // admin/manage/stats reads deliberately still show lapsed rows.
      extraColumns: {
        expires_at: new Date(nowMs + expiresMs).toISOString(),
      },
    });
    notified = outcome.notified;
  }

  return NextResponse.json({
    ok: true,
    scanned: managed.length,
    silent: silent.map((r) => r.routine_id),
    errored: errored.map((r) => r.routine_id),
    disabled: disabled.map((r) => r.routine_id),
    bad_verdicts: badAudits.length,
    notified,
  });
}
