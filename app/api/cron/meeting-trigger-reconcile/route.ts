// app/api/cron/meeting-trigger-reconcile/route.ts
// ============================================================================
// Auto-accountability-meeting engine — PR1b hourly reconcile (explanation valve).
//
// For each open breach event (status='notified'):
//   - if the Principal submitted an explanation (action_responses) → mark
//     'explained' + route it to the Director to judge (skip / meet);
//   - if the 24h deadline passed with no explanation → mark 'meeting_pending'
//     + alert the Director that a review meeting is warranted.
//
// PR1c then BOOKS those pending meetings in the same pass (bookPendingMeetings):
// soonest common free slot when every participant's Google Calendar is
// connected, otherwise a one-time "connect your calendar" ask and the event
// stays pending. Same CRON_SECRET gate, no new cron entry.
//
// Hourly so the 24h deadline is enforced within ~1h and explanations reach the
// Director promptly. Auth: CRON_SECRET (Bearer header OR ?secret=).
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import {
  reconcileExplanations,
  bookPendingMeetings,
  type BookingResult
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
    const result = await reconcileExplanations();

    // PR1c — book what the valve escalated. Isolated in its own try/catch so a
    // booking-side failure (Google outage, unapplied migration) can never take
    // down the explanation valve, which is the live part of this cron.
    let booking: BookingResult | { failed: string };
    try {
      booking = await bookPendingMeetings();
    } catch (bookErr: any) {
      logger.error('meetings/triggers', 'bookPendingMeetings failed', bookErr);
      booking = { failed: bookErr?.message ?? 'Internal error' };
    }

    return NextResponse.json({
      success: true,
      ...result,
      booking,
      duration_ms: Date.now() - startTime
    });
  } catch (error: any) {
    logger.error(
      'meetings/triggers',
      'meeting-trigger-reconcile failed',
      error
    );
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
