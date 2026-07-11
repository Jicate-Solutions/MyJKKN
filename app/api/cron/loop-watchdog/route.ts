// =============================================================================
// LOOP WATCHDOG — silence must not look like health (governance wire 3)
// =============================================================================
// Daily (dispatcher row 'loop-watchdog', 09:23 IST — after the 08:15 measure):
// three sweeps over the loop plumbing, one notification if anything is wrong,
// silence when healthy.
//
//   1. SILENT routines — dispatcher-managed, enabled, but last fired further
//      back than their OWN cadence allows (derived from days_of_week: a daily
//      row alarms after ~26h, a Sundays-only row after ~7d — a flat 26h would
//      false-alarm every weekly routine 6 days out of 7, review 2026-07-11 #1).
//      A dead dispatcher, a disabled schedule, or a deploy that broke a route
//      all look like this. Receipt for the failure class: pde-bridge fired
//      HTTP 200 daily into a dead pipe for days; nothing anywhere went red
//      (reference_ai_pulse_loop_weld).
//   2. ERRORED routines — last_status carrying an HTTP 4xx/5xx, timeout, or
//      "not in registry". These were previously visible only to someone who
//      happened to open /admin/ai-routines and read the grey text.
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
  findingsFingerprint,
} from '@/lib/ai-routines/loop-governance';

const AUDIT_WINDOW_HOURS = 26; // audit sweep window: this cron's own daily cadence + slack
const ERROR_RX = /HTTP [45]\d\d|timeout|timed out|failed|exception|not in registry/i;

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
    .eq('managed', true)
    .eq('enabled', true);
  if (schedErr) {
    return NextResponse.json({ ok: false, error: schedErr.message }, { status: 500 });
  }

  type Row = {
    routine_id: string;
    days_of_week: number[] | null;
    last_fired_at: string | null;
    last_status: string | null;
    updated_at: string | null;
  };
  const silent = ((rows ?? []) as Row[]).filter((r) => {
    // Compare instants, not timestamp strings — PostgREST's `+00:00`/µs format
    // vs toISOString()'s `Z` makes lexicographic comparison boundary-unreliable
    // (review #7). Anchor on last fire, falling back to the row's updated_at
    // for never-fired rows; a row with neither signal is an alarm by itself.
    const anchor = r.last_fired_at ?? r.updated_at;
    if (!anchor) return true;
    return nowMs - new Date(anchor).getTime() > staleThresholdMs(r.days_of_week);
  });
  const errored = ((rows ?? []) as Row[]).filter(
    (r) => r.last_status !== null && ERROR_RX.test(r.last_status)
  );

  // Fetch the window unfiltered and classify with the shared vocabulary —
  // keeping the good/bad decision in one place (loop-governance) instead of a
  // PostgREST ilike that both false-alarmed honest states and NULL-skipped
  // (verdict is NOT NULL today, but isBadVerdict guards NULL anyway).
  const auditCutoff = new Date(nowMs - AUDIT_WINDOW_HOURS * 3600_000).toISOString();
  const { data: audits } = await admin
    .from('loop_audits')
    .select('loop_key, verdict, audited_at')
    .gte('audited_at', auditCutoff);
  const badAudits = ((audits ?? []) as { loop_key: string; verdict: string | null }[]).filter(
    (a) => isBadVerdict(a.verdict)
  );

  const findings: string[] = [
    ...silent.map(
      (r) => `SILENT: ${r.routine_id} last fired ${r.last_fired_at ?? 'never'}`
    ),
    ...errored.map((r) => `ERROR: ${r.routine_id} → ${r.last_status}`),
    ...badAudits.map((a) => `VERDICT: ${a.loop_key} → ${a.verdict}`),
  ];

  let notified = 0;
  if (findings.length > 0) {
    const { data: supers } = await admin
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true);
    const userIds = (supers ?? []).map((s: { id: string }) => s.id);
    const istDay = new Date(nowMs + 19_800_000).toISOString().slice(0, 10);
    const outcome = await fanoutNotification(admin, {
      title: `🔴 Loop watchdog: ${findings.length} issue${findings.length === 1 ? '' : 's'} (${silent.length} silent, ${errored.length} errored, ${badAudits.length} bad verdicts)`,
      body: findings.slice(0, 12).join(' · '),
      userIds,
      priority: 'high',
      category: 'loops',
      url: '/admin/loops',
      // Day + finding-set fingerprint: the same findings re-checked stay
      // deduplicated, but a DISTINCT failure later the same day still pages.
      idempotencyKey: `loop-watchdog:${istDay}:${findingsFingerprint(findings)}`,
      source: 'loop-watchdog-cron',
    });
    notified = outcome.notified;
  }

  return NextResponse.json({
    ok: true,
    scanned: (rows ?? []).length,
    silent: silent.map((r) => r.routine_id),
    errored: errored.map((r) => r.routine_id),
    bad_verdicts: badAudits.length,
    notified,
  });
}
