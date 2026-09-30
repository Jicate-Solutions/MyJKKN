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
// Windows are platform_policies rows (seeded by 20270523090000). Every notice
// is claimed in hr_duty_notices before it is sent, so re-running this route —
// or the event hooks racing it — never sends one twice. People on approved
// leave today are skipped and reached on a later run.
//
// Schedule: ai_routine_schedules 'hr-duty-notices', Mon–Sat 10:07 IST.
// Auth: CRON_SECRET Bearer only (what the dispatcher and manual trigger send).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
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

  const supabase = createServiceRoleClient();
  const now = new Date();
  const errors: string[] = [];

  try {
    const thresholds = await loadThresholds(supabase);
    const onLeave = await profilesOnLeave(supabase, todayIst(now));

    // Independent duties: one failing must not stop the other.
    const [onboarding, regularization] = await Promise.all([
      runOnboardingSweep(supabase, now, thresholds.onboarding, onLeave).catch((err) => {
        errors.push(`onboarding: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }),
      runRegularizationSweep(supabase, now, thresholds.regularization, onLeave).catch((err) => {
        errors.push(`regularization: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }),
    ]);

    errors.push(...(onboarding?.errors ?? []), ...(regularization?.errors ?? []));
    const ok = onboarding !== null && regularization !== null;

    return NextResponse.json(
      {
        ok,
        onboarding,
        regularization,
        thresholds,
        on_leave_today: onLeave.size,
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
