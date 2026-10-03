export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// /api/cron/hr/leave-escalations — hourly, 08:59 to 19:59 IST (vercel.json).
//
// HR staff harness, lane A (2026-10-01). Enforces the `escalate_after_hours`
// every leave approval step has always carried and nothing ever read: a
// request whose current step has waited past its limit is marked 'escalated'
// once per step, the escalation is recorded in hr_leave_deadline_nudges, and
// the current approver(s) and the next level are told in-app. Approvers on
// approved leave today are never chased. Rules: lib/hr/leave/deadline-harness.ts;
// database half: supabase/migrations/20270613101117_hr_leave_deadline_enforcement.sql.
//
// Hourly is sub-daily, which the AI-routine dispatcher cannot express, so this
// is a vercel.json cron. Daytime hours only, so no chase lands at night; the
// clock itself still runs through the night, and a request that fell due at
// 02:00 is escalated at 08:59.
//
// Auth: CRON_SECRET as `Authorization: Bearer <secret>` or `?secret=`.
// Safe to re-run: every step is escalated at most once (database-enforced).

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { isCronAuthorized, withCronRun } from '@/lib/cron/run-log';
import { runLeaveEscalations } from '@/lib/hr/leave/deadline-runner';

async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await runLeaveEscalations(createServiceRoleClient());
    return NextResponse.json({
      ok: result.errors.length === 0,
      ...result,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('[cron/hr/leave-escalations] failed', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'escalation pass failed' },
      { status: 500 }
    );
  }
}

export const GET = withCronRun('hr-leave-escalations', handler);
