// /api/cron/hr/duty-notices
// ----------------------------------------------------------------------------
// HR staff harness (2026-10-01), duties R9 and A3 — the daily chase.
//
//   R9 onboarding checklist
//     - a step's owner gets ONE reminder once they have held the step for more
//       than 2 working days, or once the joiner's expected joining date is 3
//       days away or closer with the step still open;
//     - the HR head gets ONE notice once the joining date has passed with
//       steps still open.
//   A3 attendance regularisation
//     - any "awaiting approval" notice the browser never sent goes now;
//     - the approvers get ONE reminder after 48 hours pending;
//     - the HR head gets ONE notice after 4 days pending (the month-close date
//       is not stored, so age stands in for "about to hold up the month");
//     - any approved/rejected notice the requester missed goes now (14 days).
//
// Windows are platform_policies rows (seeded by 20270613101133). Every notice
// is claimed in hr_duty_notices before it is sent, so re-running this route —
// or the event hooks racing it — never sends one twice. A chase skips people
// on approved leave today; they get the same notice on the first later run
// when they are back (pending_user_ids on the ledger row).
//
// Daytime only: the route itself refuses to chase at night (outside 08:00-
// 20:00 IST) or on Sunday, whoever triggers it, and answers 200 with
// `skipped: 'outside_daytime'`. This guardrail is for the scheduled chases;
// the event notices (your turn, a request arrived, your request was decided)
// go when the event happens.
//
// If today's leave list cannot be read, the chases are skipped (counted as
// skipped_leave_unknown) but the missed "submitted"/"decided" notices still go.
//
// Schedule: ai_routine_schedules 'hr-duty-notices', Mon–Sat 10:07 IST.
// Auth: CRON_SECRET Bearer only (what the dispatcher and manual trigger send).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isDaytimeIst } from '@/lib/services/hr/duty-notices/selection';
import {
  ladderCoversDuty,
  loadThresholds,
  profilesOnLeave,
  runOnboardingSweep,
  runRegularizationSweep,
  todayIst,
} from '@/lib/services/hr/duty-notices/dispatch';

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  if (!isDaytimeIst(now)) {
    return NextResponse.json({
      ok: true,
      skipped: 'outside_daytime',
      note: 'Chases go Monday to Saturday, 08:00-20:00 IST only.',
      duration_ms: Date.now() - startedAt,
    });
  }

  const supabase = createServiceRoleClient();
  const errors: string[] = [];

  try {
    const thresholds = await loadThresholds(supabase, now);
    // A failed leave read must not stop the event backstops: the sweeps get
    // null, skip their chases, and still send the missed event notices.
    let onLeave: Set<string> | null = null;
    try {
      onLeave = await profilesOnLeave(supabase, todayIst(now));
    } catch (err) {
      errors.push(`leave lookup: ${err instanceof Error ? err.message : String(err)} (chases skipped this run)`);
    }
    // When the HR chase ladder is on and owns A3, it sends the regularisation
    // chases; this run still sends the submitted/decided notices.
    const ladderOwnsA3 = await ladderCoversDuty(supabase, thresholds.chaseLadderSwitch, 'A3');

    // Independent duties: one failing must not stop the other.
    const [onboarding, regularization] = await Promise.all([
      runOnboardingSweep(supabase, now, thresholds.onboarding, onLeave, thresholds.goLiveAt).catch((err) => {
        errors.push(`onboarding: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }),
      runRegularizationSweep(supabase, now, thresholds.regularization, onLeave, thresholds.goLiveAt, ladderOwnsA3).catch((err) => {
        errors.push(`regularization: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }),
    ]);

    errors.push(...(onboarding?.errors ?? []), ...(regularization?.errors ?? []));
    const ok = onboarding !== null && regularization !== null && onLeave !== null;

    return NextResponse.json(
      {
        ok,
        onboarding,
        regularization,
        thresholds,
        on_leave_today: onLeave?.size ?? null,
        errors,
        duration_ms: Date.now() - startedAt,
      },
      { status: ok ? 200 : 500 },
    );
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, errors, duration_ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
