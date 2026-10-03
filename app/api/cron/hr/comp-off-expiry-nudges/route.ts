export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// /api/cron/hr/comp-off-expiry-nudges — daily 09:17 IST via the AI-routine
// dispatcher (routine 'hr-comp-off-expiry-nudges', editable at /admin/ai-routines).
//
// HR staff harness, lane A (2026-10-01). An undecided comp-off claim is
// rejected automatically the night its credit expires
// (fn_hr_comp_off_reject_expired_claims — unchanged). This pass adds the
// warnings that were missing:
//   * the claim's approvers are nudged 7 days and 2 days before the credit
//     expires (approvers on approved leave today are skipped);
//   * the claimant is told when the nightly job has closed their claim.
// Each is sent once per claim (hr_leave_deadline_nudges). Rules:
// lib/hr/leave/deadline-harness.ts.
//
// Auth: CRON_SECRET as `Authorization: Bearer <secret>` (the dispatcher) or
// `?secret=` (manual runs). Safe to re-run.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { isCronAuthorized, withCronRun } from '@/lib/cron/run-log';
import { runCompOffExpiryNudges } from '@/lib/hr/leave/deadline-runner';

async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await runCompOffExpiryNudges(createServiceRoleClient());
    return NextResponse.json({
      ok: result.errors.length === 0,
      ...result,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('[cron/hr/comp-off-expiry-nudges] failed', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'comp-off nudge pass failed' },
      { status: 500 }
    );
  }
}

export const GET = withCronRun('hr-comp-off-expiry-nudges', handler);
