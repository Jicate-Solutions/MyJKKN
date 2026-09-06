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
// connected, otherwise a "connect your calendar" ask (re-sent every blocked
// pass, Director decision 2026-07-28 #5) and the event stays pending. Same
// CRON_SECRET gate, no new cron entry.
//
// A third, WEEKLY path rides the same hourly cron
// (sendWeeklyCalendarConnectSummary): once per ISO week each Principal — and
// the EAO — gets the list of people in their college who still have no healthy
// Google Calendar connection (Director decisions #5 + #6). It is gated by its
// own notifications ledger, so calling it 168 times a week sends it once; that
// is why it does NOT need a new vercel.json cron entry.
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
  sendWeeklyCalendarConnectSummary,
  sweepCalendarConnectLock,
  type BookingResult,
  type WeeklyConnectSummaryResult,
  type CalendarLockSweepResult
} from '@/lib/services/meetings/meeting-trigger-service';
import {
  reconcileHandoverExplanations,
  type HandoverReconcileResult
} from '@/lib/services/director-desk/handover-chase-service';
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

    // Director's Desk (2026-08-05) — the handover half of the SAME valve, run
    // here rather than only on its own nightly cron because "explain within 24
    // hours" checked once a night is in practice a window of 24 to 48 hours,
    // which is not the decision that was made. It must run BEFORE the booking
    // pass below: this is what moves a silent handover to meeting_pending, and
    // bookPendingMeetings is what then books the Director and the grantee. Its
    // own try/catch, like every other rider on this cron — a failure here must
    // not take down the attendance valve, which is the live part.
    let handovers: HandoverReconcileResult | { failed: string };
    try {
      handovers = await reconcileHandoverExplanations();
    } catch (hoErr: any) {
      logger.error(
        'meetings/triggers',
        'reconcileHandoverExplanations failed',
        hoErr
      );
      handovers = { failed: hoErr?.message ?? 'Internal error' };
    }

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

    // Weekly summary — same isolation. Its own ISO-week gate makes this a
    // no-op on 167 of every 168 hourly runs.
    let weekly: WeeklyConnectSummaryResult | { failed: string };
    try {
      weekly = await sendWeeklyCalendarConnectSummary();
    } catch (weeklyErr: any) {
      logger.error(
        'meetings/triggers',
        'sendWeeklyCalendarConnectSummary failed',
        weeklyErr
      );
      weekly = { failed: weeklyErr?.message ?? 'Internal error' };
    }

    // Calendar-connect lock sweep (Director decision 2026-08-18). Same isolation
    // as every other pass: this one can hold people out of MyJKKN entirely, so a
    // failure must not take the reconcile down with it — and must surface in the
    // response rather than disappear. No-op returning zeroes while the master
    // switch is off, which is how it ships.
    let calendarLock: CalendarLockSweepResult | { failed: string };
    try {
      calendarLock = await sweepCalendarConnectLock();
    } catch (lockErr: any) {
      logger.error('meetings/triggers', 'sweepCalendarConnectLock failed', lockErr);
      calendarLock = { failed: lockErr?.message ?? 'Internal error' };
    }

    return NextResponse.json({
      success: true,
      ...result,
      handovers,
      booking,
      weekly,
      calendarLock,
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
