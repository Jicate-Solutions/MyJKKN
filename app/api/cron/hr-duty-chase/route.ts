// =============================================================================
// HR DUTY CHASE — the HR staff harness's chase ladder (build step 2)
// =============================================================================
// Daily, from the AI-routine dispatcher (ai_routine_schedules row
// 'hr-duty-chase', seeded by 20270613101207; day and time editable on
// /admin/ai-routines). One pass:
//   * every enabled HR duty in hr_duty_definitions reads what is waiting;
//   * a due item nudges its owner; +2 working days its owner's supervisor;
//     +4 it joins the HR head's weekly late list;
//   * on the digest weekday: the HR head's late list, and ONE digest to the
//     Director of late items per desk (never per person).
//
// SHIPS SWITCHED OFF. platform_policies 'hr.harness.chase.enabled' is seeded
// false: every run then computes a preview, records it in hr_duty_chase_runs,
// and sends nothing and writes no ledger row. Nothing chases anyone until the
// Director flips that one row. 'hr.harness.chase.max_messages_per_run' is the
// volume fuse: a run that works out more messages than that sends none of them
// and tells the Director alone.
//
// Auth: CRON_SECRET, Bearer only — the dispatcher and the AI Routines "Run now"
// button both send the header; a secret never sits in a URL.
// =============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { runHrDutyChase } from '@/lib/services/hr/duty-harness/chase-service';
import { createHarnessDbDeps } from '@/lib/services/hr/duty-harness/db-deps';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const result = await runHrDutyChase(createHarnessDbDeps());
  // A failed run is a 500 so the dispatcher's last_status (and the loop
  // watchdog that reads it) sees it. Switched off, outside hours, a weekly
  // off day and a blown fuse are all correct behaviour, so they are 200.
  const status = result.outcome === 'failed' ? 500 : 200;
  return NextResponse.json(
    { ok: status === 200, ...result, duration_ms: Date.now() - started },
    { status }
  );
}
