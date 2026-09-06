// __tests__/meetings/past-reschedule-reason.test.ts
//
// A host could not move a meeting once it had ended: the service refused
// anything whose status was not 'confirmed', and the page hid the whole Actions
// card behind `!isCancelled && !isPast`. Meetings get missed, so the only route
// left was to book a fresh one and lose the thread.
//
// Director ruling 2026-08-21 — the reason is not decoration, it SELECTS THE
// ACTION:
//
//   'missed'    it never happened   → THIS booking moves to the new time.
//   'repeat'    it happened         → original untouched, NEW booking created,
//   'follow_up' it happened         → linked back via follows_booking_id.
//
// The contracts below are the ones that would silently rot:
//
//   1. Absent a reason, NOTHING changes for existing callers. The public
//      reschedule route and every pre-existing host path still see
//      confirmed-only. A regression here would let a cancelled booking be
//      revived by a stale attendee link.
//   2. A reason does NOT weaken authorisation. Wrong token and wrong host are
//      still refused — the reason says "I mean to act on an ended meeting", not
//      "let me past the door".
//   3. repeat / follow_up must NEVER mutate the original row. It already
//      happened; rewriting its time would destroy the record of when it did.
//   4. The successor carries follows_booking_id back to the original, which is
//      what makes a chain readable and is the hook the existing carry-over loop
//      (MeetingActionItemService.listOpenCarryOver) needs.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The service imports the booking-email module, which constructs Resend at
// import time and throws without RESEND_API_KEY. Same mock as
// host-scheduling-service.test.ts and meeting-mode-switch.test.ts.
vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {
    sendBookingConfirmedEmails: vi.fn(),
    sendBookingRescheduledEmails: vi.fn(),
    sendBookingCancelledEmails: vi.fn(),
  },
}));
// Something in the import chain calls createClientSupabaseClient() eagerly,
// which builds a real browser client and throws without project env vars. These
// contracts pass their own Supabase double in, so the module is stubbed out.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: {
    patchEventTime: vi.fn(),
    busyForHost: vi.fn(async () => ({ status: 'ok', busy: [] })),
  },
}));

import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';

const HOST = 'host-1';
const OTHER = 'someone-else';

/**
 * Minimal Supabase double. Only the calls rescheduleBooking makes before the
 * slot machinery are modelled, which is exactly the region these contracts live
 * in — the repeat/follow_up branch and both gates return before any meeting
 * type or schedule is loaded.
 */
function makeSupabase(bookingRow: Record<string, unknown> | null) {
  const updates: Array<Record<string, unknown>> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'limit', 'order', 'neq']) {
    builder[m] = () => builder;
  }
  builder.update = (payload: Record<string, unknown>) => {
    updates.push(payload);
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve({ data: bookingRow, error: null });
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: bookingRow, error: null });
  return { from: () => builder, __updates: updates } as never;
}

const closedBooking = (status: string) => ({
  id: 'bk-1',
  host_profile_id: HOST,
  cancel_token: 'tok-abc',
  status,
  attendee_name: 'Priya R',
  attendee_email: 'priya@example.com',
  attendee_phone: '9000000000',
  start_time: '2026-08-18T09:00:00.000Z',
  end_time: '2026-08-18T09:30:00.000Z',
  meeting_type_id: 'mt-1',
  google_event_id: null,
  reschedule_count: 0,
  venue_reservation_id: null,
  venue_status: null,
});

const NEW_START = '2026-09-01T09:00:00.000Z';

beforeEach(() => vi.restoreAllMocks());

describe('contract 1 — without a reason, existing callers are unchanged', () => {
  it.each(['completed', 'cancelled', 'no_show'])(
    'refuses a %s booking exactly as before',
    async (status) => {
      const db = makeSupabase(closedBooking(status));
      const res = await NativeSchedulingService.rescheduleBooking(
        db, 'uid-1', { actorProfileId: HOST }, NEW_START,
      );
      expect(res).toEqual({ success: false, error: 'NOT_FOUND' });
      // Nothing was written on the way to refusing.
      expect((db as unknown as { __updates: unknown[] }).__updates).toHaveLength(0);
    },
  );
});

describe('contract 2 — a reason does not weaken authorisation', () => {
  it('still refuses a caller who is neither the host nor holds the token', async () => {
    const db = makeSupabase(closedBooking('completed'));
    const res = await NativeSchedulingService.rescheduleBooking(
      db, 'uid-1', { actorProfileId: OTHER }, NEW_START, { reason: 'repeat' },
    );
    expect(res).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('still refuses a wrong cancel token', async () => {
    const db = makeSupabase(closedBooking('completed'));
    const res = await NativeSchedulingService.rescheduleBooking(
      db, 'uid-1', { cancelToken: 'wrong' }, NEW_START, { reason: 'missed' },
    );
    expect(res).toEqual({ success: false, error: 'NOT_FOUND' });
  });
});

describe('contract 3 — repeat / follow_up never mutate the original', () => {
  it.each(['repeat', 'follow_up'] as const)(
    '%s creates a successor and leaves the original alone',
    async (reason) => {
      const created = vi
        .spyOn(NativeSchedulingService, 'createBooking')
        .mockResolvedValue({
          success: true, uid: 'uid-new', start: NEW_START,
          end: NEW_START, hostName: 'Host', room: null,
        } as never);

      const db = makeSupabase(closedBooking('completed'));
      const res = await NativeSchedulingService.rescheduleBooking(
        db, 'uid-1', { actorProfileId: HOST }, NEW_START, { reason },
      );

      expect(res).toMatchObject({ success: true, uid: 'uid-new' });
      expect(created).toHaveBeenCalledTimes(1);

      // The successor inherits the original's guest, not a blank one.
      // NativeBookingInput is already typed — no cast needed, and casting it to
      // Record<string, unknown> is a TS2352 error (the types do not overlap).
      const input = created.mock.calls[0][1];
      expect(input.attendeeEmail).toBe('priya@example.com');
      expect(input.attendeeName).toBe('Priya R');
      expect(input.meetingTypeId).toBe('mt-1');
      expect(input.start).toBe(NEW_START);

      // Contract 4: the only write is the back-link on the NEW row. The
      // original's start_time is never rewritten — it really did happen then.
      const updates = (db as unknown as { __updates: Record<string, unknown>[] }).__updates;
      expect(updates).toHaveLength(1);
      expect(updates[0]).toEqual({
        reschedule_reason: reason,
        follows_booking_id: 'bk-1',
      });
      expect(updates[0]).not.toHaveProperty('start_time');
    },
  );

  it('still returns the successor when the back-link write fails', async () => {
    // A failed link must not lose a booking that was genuinely created.
    vi.spyOn(NativeSchedulingService, 'createBooking').mockResolvedValue({
      success: true, uid: 'uid-new', start: NEW_START, end: NEW_START,
      hostName: 'Host', room: null,
    } as never);
    const db = makeSupabase(closedBooking('completed'));
    (db as unknown as { from: () => Record<string, unknown> }).from().update = () => ({
      eq: () => Promise.resolve({ error: { message: 'boom' } }),
    });
    const res = await NativeSchedulingService.rescheduleBooking(
      db, 'uid-1', { actorProfileId: HOST }, NEW_START, { reason: 'follow_up' },
    );
    expect(res).toMatchObject({ success: true, uid: 'uid-new' });
  });

  it('does not create a successor for missed — that one moves the meeting', async () => {
    const created = vi.spyOn(NativeSchedulingService, 'createBooking');
    const db = makeSupabase(closedBooking('completed'));
    // 'missed' deliberately falls THROUGH to the ordinary move path, so it runs
    // on into slot re-validation, which this minimal double does not model. That
    // it gets that far is itself the proof the status gate let it past — the old
    // code returned NOT_FOUND immediately for a completed booking. The contract
    // under test is only that no successor was created.
    await NativeSchedulingService.rescheduleBooking(
      db, 'uid-1', { actorProfileId: HOST }, NEW_START, { reason: 'missed' },
    ).catch(() => undefined);
    expect(created).not.toHaveBeenCalled();
  });

  it('a completed booking is refused WITHOUT a reason but reached WITH one', async () => {
    // The pair that pins the gate change: same row, same caller, only the reason
    // differs. Without it the service returns NOT_FOUND without touching
    // anything; with it, execution continues past the gate.
    const noReason = await NativeSchedulingService.rescheduleBooking(
      makeSupabase(closedBooking('completed')), 'uid-1',
      { actorProfileId: HOST }, NEW_START,
    );
    expect(noReason).toEqual({ success: false, error: 'NOT_FOUND' });

    let reachedPastGate = false;
    await NativeSchedulingService.rescheduleBooking(
      makeSupabase(closedBooking('completed')), 'uid-1',
      { actorProfileId: HOST }, NEW_START, { reason: 'missed' },
    ).then(
      (r) => { reachedPastGate = !(r as { error?: string }).error || (r as { error?: string }).error !== 'NOT_FOUND'; },
      () => { reachedPastGate = true; },
    );
    expect(reachedPastGate).toBe(true);
  });
});
