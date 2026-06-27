// app/api/cron/attendance-breach-check/route.ts
// ============================================================================
// Auto-accountability-meeting engine — PR1a nightly attendance trigger.
//
// Evaluates active `meeting_trigger_rules` (metric_key='attendance_rate_daily')
// for the just-completed campus day. On breach, notifies the college Principal
// (admin fallback) via the in-app bell. Detect + notify only — booking the
// meeting (PR1c) and the 24h explanation valve (PR1b) come later.
//
// Nothing fires unless a rule is `active` (all seeded inactive — the Director
// reviews each per-college threshold and activates).
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query param.
// Optional ?date=YYYY-MM-DD override (CRON_SECRET-gated) for controlled tests.
// Scheduled in vercel.json (mould of grievance-sla-breach-check).
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import {
  evaluateAttendanceTriggers,
  evaluateMissingDataTriggers
} from '@/lib/services/meetings/meeting-trigger-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');

  if (cronSecret) {
    const headerOk = authHeader === `Bearer ${cronSecret}`;
    const queryOk = querySecret === cronSecret;
    if (!headerOk && !queryOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const dateOverride =
      request.nextUrl.searchParams.get('date') || undefined;
    // Two inverse signals over the same day's attendance data: the rate trigger
    // (low attendance) and the missing-data trigger (a working day with no marks
    // at all). The rate trigger skips no-data days; the missing-data trigger
    // owns them. Both share the explanation valve via reconcileExplanations.
    const attendance = await evaluateAttendanceTriggers({ date: dateOverride });
    const missing_data = await evaluateMissingDataTriggers({ date: dateOverride });

    return NextResponse.json({
      success: true,
      attendance,
      missing_data,
      duration_ms: Date.now() - startTime
    });
  } catch (error: any) {
    logger.error(
      'meetings/triggers',
      'attendance-breach-check failed',
      error
    );
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
