// =============================================================================
// LOOP WATCHDOG — silence must not look like health (governance wire 3)
// =============================================================================
// Daily (dispatcher row 'loop-watchdog', 09:23 IST — after the 08:15 measure):
// three sweeps over the loop plumbing, one notification if anything is wrong,
// silence when healthy.
//
//   1. SILENT routines — dispatcher-managed, enabled, but last fired > 26h ago
//      (or never fired and seeded > 26h ago). A dead dispatcher, a disabled
//      schedule, or a deploy that broke a route all look like this. Receipt
//      for the failure class: pde-bridge fired HTTP 200 daily into a dead pipe
//      for days; nothing anywhere went red (reference_ai_pulse_loop_weld).
//   2. ERRORED routines — last_status carrying an HTTP 4xx/5xx, timeout, or
//      "not in registry". These were previously visible only to someone who
//      happened to open /admin/ai-routines and read the grey text.
//   3. BAD VERDICTS — loop_audits rows from the last 26h whose verdict isn't
//      a *-verified value (catches manual /loops runs and the weekly regress
//      alike; belt-and-braces with the regress cron's own alert).
//
// Scope: managed=true rows ONLY. The maxlane:* rows are managed=false —
// consumed by the local Mac poller, deliberately not watched here (their
// silence is expected whenever the Mac lane is off).
//
// Auth: CRON_SECRET Bearer (dispatcher) OR ?secret= (manual).
// Created: 2026-07-11 (Director: "yes want them").

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

const STALE_HOURS = 26; // daily cadence + slack; dispatcher rows are day-granular
const ERROR_RX = /HTTP [45]\d\d|timeout|timed out|failed|exception|not in registry/i;

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
  const cutoff = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString();

  const { data: rows, error: schedErr } = await admin
    .from('ai_routine_schedules')
    .select('routine_id, enabled, managed, last_fired_at, last_status, updated_at')
    .eq('managed', true)
    .eq('enabled', true);
  if (schedErr) {
    return NextResponse.json({ ok: false, error: schedErr.message }, { status: 500 });
  }

  type Row = {
    routine_id: string;
    last_fired_at: string | null;
    last_status: string | null;
    updated_at: string | null;
  };
  const silent = ((rows ?? []) as Row[]).filter((r) =>
    r.last_fired_at ? r.last_fired_at < cutoff : (r.updated_at ?? '') < cutoff
  );
  const errored = ((rows ?? []) as Row[]).filter(
    (r) => r.last_status !== null && ERROR_RX.test(r.last_status)
  );

  const { data: badAudits } = await admin
    .from('loop_audits')
    .select('loop_key, verdict, audited_at')
    .gte('audited_at', cutoff)
    .not('verdict', 'ilike', '%verified');

  const findings: string[] = [
    ...silent.map(
      (r) => `SILENT: ${r.routine_id} last fired ${r.last_fired_at ?? 'never'}`
    ),
    ...errored.map((r) => `ERROR: ${r.routine_id} → ${r.last_status}`),
    ...((badAudits ?? []) as { loop_key: string; verdict: string }[]).map(
      (a) => `VERDICT: ${a.loop_key} → ${a.verdict}`
    ),
  ];

  let notified = 0;
  if (findings.length > 0) {
    const { data: supers } = await admin
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true);
    const userIds = (supers ?? []).map((s: { id: string }) => s.id);
    const istDay = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
    const outcome = await fanoutNotification(admin, {
      title: `🔴 Loop watchdog: ${findings.length} issue${findings.length === 1 ? '' : 's'} (${silent.length} silent, ${errored.length} errored, ${(badAudits ?? []).length} bad verdicts)`,
      body: findings.slice(0, 12).join(' · '),
      userIds,
      priority: 'high',
      category: 'loops',
      url: '/admin/loops',
      idempotencyKey: `loop-watchdog:${istDay}`,
      source: 'loop-watchdog-cron',
    });
    notified = outcome.notified;
  }

  return NextResponse.json({
    ok: true,
    scanned: (rows ?? []).length,
    silent: silent.map((r) => r.routine_id),
    errored: errored.map((r) => r.routine_id),
    bad_verdicts: (badAudits ?? []).length,
    notified,
  });
}
