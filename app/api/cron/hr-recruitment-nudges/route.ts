// =====================================================================
// /api/cron/hr-recruitment-nudges — HR staff harness, recruitment duties
// =====================================================================
// Duty cards R5, R6 and R8 of artifacts/hr-staff-harness-design-2026-10-01.html.
// Each run sends, at most ONCE per item:
//   * approval_reminder        — step waited past its escalate_after_hours
//                                (seeded 72) -> the step's approver
//   * approval_escalation      — 48 hours after that reminder, still waiting
//                                -> the HR Head (role hr_head)
//   * scorecard_missing        — 24 hours after an interview, no scorecard
//                                -> that interviewer
//   * offer_not_issued         — 'package_fixed' for 2 days
//                                -> the job's creator, else HR editors
//   * joining_outcome_missing  — 'offer_issued', joining date + 2 days passed,
//                                nothing recorded -> the same people
// The rules are in lib/hr/recruitment/harness-selection.ts (pure, tested);
// the reads and sends in lib/hr/recruitment/harness-run.ts.
//
// Schedule: AI-routine dispatcher, row 'hr-recruitment-nudges' in
// ai_routine_schedules (Mon–Sat 09:15 IST, editable at /admin/ai-routines).
// The dispatcher fires once a day — every threshold above is a day or more,
// so a daily run is late by at most one working day.
//
// Auth: CRON_SECRET, `Authorization: Bearer` (what the dispatcher sends) or
// `?secret=` for a manual run.
//
// Idempotent: every nudge is claimed in hr_recruitment_nudges_sent
// (UNIQUE (kind, ref_key)) before it is sent, so a re-run or an overlapping
// run sends nothing twice. Migration 20270613101125.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isCronAuthorized } from '@/lib/cron/run-log';
import { runRecruitmentHarness } from '@/lib/hr/recruitment/harness-run';

const JOB_NAME = 'hr-recruitment-nudges';

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, job: JOB_NAME, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, job: JOB_NAME, error: 'unauthorized' }, { status: 401 });
  }

  const ranAt = new Date();
  try {
    const summary = await runRecruitmentHarness(createServiceRoleClient(), ranAt);
    // A college whose HR-editor lookup failed, or an unfinished claim the settle
    // step could not decide, is not a crash (every other nudge still went out),
    // but it is reported, so a broken lookup stays visible.
    const ok = summary.failed === 0 && summary.hrEditorsUnavailable === 0 && summary.unsettled === 0;
    return NextResponse.json(
      { ok, job: JOB_NAME, ran_at: ranAt.toISOString(), ...summary },
      { status: ok ? 200 : 500 },
    );
  } catch (err) {
    console.error(`[cron:${JOB_NAME}] run failed`, err);
    return NextResponse.json(
      { ok: false, job: JOB_NAME, ran_at: ranAt.toISOString(), error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
