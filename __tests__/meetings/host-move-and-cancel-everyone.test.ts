// __tests__/meetings/host-move-and-cancel-everyone.test.ts
//
// Director's rulings, 9 Oct 2026 (booking door edge cases):
//   "Keep the same link": a meeting scheduled directly (no meeting type) is
//     moved IN PLACE by HostSchedulingService.moveDirect. It keeps the same
//     booking, uid and Meet link, and the Google event is patched. It is all
//     or nothing: a calendar that refuses puts the row back.
//   "Yes, email everyone with the real title": cancelling such a meeting
//     emails EVERY invitee, naming the meeting by its own title, not
//     "Meeting".
// Plus the email keys: each invitee's email has its own idempotency key, so
// Resend no longer drops every invitee after the first as a duplicate.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sentEmails: Array<{ to: string; subject: string; key: string }> = [];
/** Sending to these addresses throws (a provider error mid-loop). */
const throwFor = new Set<string>();
vi.mock('@/lib/resend', () => ({
  resend: {
    emails: {
      send: vi.fn(async (msg: { to: string; subject: string }, opts: { headers: Record<string, string> }) => {
        if (throwFor.has(msg.to)) throw new Error('provider down');
        sentEmails.push({ to: msg.to, subject: msg.subject, key: opts.headers['Idempotency-Key'] });
        return { data: { id: `r${sentEmails.length}` }, error: null };
      }),
    },
  },
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn(() => ({})) }));
const patchEventTime = vi.fn();
const markEventCancelled = vi.fn();
vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: {
    patchEventTime: (...a: unknown[]) => patchEventTime(...a),
    markEventCancelled: (...a: unknown[]) => markEventCancelled(...a),
    busyForHost: vi.fn(async () => ({ status: 'ok', busy: [] })),
  },
}));

process.env.RESEND_API_KEY = 'test-key';

import { HostSchedulingService } from '@/lib/services/meetings/host-scheduling-service';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';

const HOST = 'host-1';
const OLD_START = '2099-01-10T05:00:00.000Z';
const OLD_END = '2099-01-10T05:30:00.000Z';
const NEW_START = '2099-01-11T09:00:00.000Z';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    uid: 'uid-1',
    host_profile_id: HOST,
    status: 'confirmed',
    start_time: OLD_START,
    end_time: OLD_END,
    meeting_type_id: null,
    source: 'host-direct',
    google_event_id: 'g1',
    video_url: 'https://meet.google.com/same-link',
    venue_reservation_id: null,
    reschedule_count: 0,
    previous_start_time: null,
    rescheduled_at: null,
    cancel_token: 'tok',
    attendee_name: 'A Parent',
    attendee_email: 'parent@gmail.com',
    answers: {
      title: 'Fee review',
      location_mode: 'online',
      participants: [
        { email: 'parent@gmail.com', name: 'A Parent' },
        { email: 'viswanathan.s@jkkn.ac.in', name: 'Viswanathan S' },
      ],
    },
    ...over,
  };
}

/** A tiny meeting_bookings / profiles / meeting_types double. */
function makeDb(
  booking: Record<string, unknown> | null,
  opts: {
    updateError?: { code: string; message: string };
    restoreFails?: boolean;
    roomError?: boolean;
    /** A cancel commits right after the move's row update (the race). */
    cancelAfterMove?: boolean;
    /** Status re-reads (after the move) fail. */
    statusReadFails?: boolean;
  } = {}
) {
  const updates: Array<{ table: string; payload: Record<string, unknown>; where: Record<string, unknown> }> = [];
  let current = booking ? { ...booking } : null;
  const db = {
    from(table: string) {
      const where: Record<string, unknown> = {};
      let payload: Record<string, unknown> | null = null;
      const b: any = {
        select: () => b,
        eq: (c: string, v: unknown) => ((where[c] = v), b),
        neq: () => b,
        update: (p: Record<string, unknown>) => ((payload = p), b),
        maybeSingle: async () => {
          if (payload) {
            updates.push({ table, payload, where: { ...where } });
            if (table !== 'meeting_bookings') return { data: { id: 'x' }, error: null };
            const isRestore = where.start_time === NEW_START;
            if (!isRestore && opts.updateError) return { data: null, error: opts.updateError };
            if (isRestore && opts.restoreFails) return { data: null, error: { code: 'XX', message: 'down' } };
            const matches = current && Object.entries(where).every(([k, v]) => (current as any)[k] === v);
            if (!matches) return { data: null, error: null };
            current = { ...(current as object), ...payload };
            if (opts.cancelAfterMove && !isRestore) current = { ...(current as object), status: 'cancelled' };
            return { data: { id: (current as any).id }, error: null };
          }
          if (table === 'meeting_bookings') {
            const statusOnlyRead = (current as any)?.start_time === NEW_START || updates.length > 0;
            if (opts.statusReadFails && statusOnlyRead) return { data: null, error: { code: 'XX', message: 'read failed' } };
            return { data: current, error: null };
          }
          if (table === 'profiles') return { data: { full_name: 'The Director', email: 'director@jkkn.ac.in' }, error: null };
          return { data: null, error: null };
        },
        then: (ok: (v: unknown) => unknown) => {
          if (payload) updates.push({ table, payload, where: { ...where } });
          const err = table === 'resource_reservations' && opts.roomError ? { message: 'room clash' } : null;
          return Promise.resolve({ data: null, error: err }).then(ok);
        },
      };
      return b;
    },
  };
  return {
    db: db as any,
    updates,
    now: () => current,
    /** Cancel the row now, as another request would. */
    cancelNow: () => {
      current = { ...(current as object), status: 'cancelled' };
    },
  };
}

beforeEach(() => {
  sentEmails.length = 0;
  throwFor.clear();
  patchEventTime.mockReset();
  patchEventTime.mockResolvedValue(true);
  markEventCancelled.mockReset();
});

describe('moveDirect: same meeting, same link, new time', () => {
  it('moves the row in place, patches the Google event, keeps the Meet link', async () => {
    const { db, now } = makeDb(row());
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 45 });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({
      uid: 'uid-1',
      startIso: NEW_START,
      endIso: '2099-01-11T09:45:00.000Z',
      previousStartIso: OLD_START,
      videoUrl: 'https://meet.google.com/same-link',
    });
    expect(now()).toMatchObject({ start_time: NEW_START, end_time: '2099-01-11T09:45:00.000Z', previous_start_time: OLD_START, reschedule_count: 1 });
    expect(patchEventTime).toHaveBeenCalledWith(db, HOST, 'g1', NEW_START, '2099-01-11T09:45:00.000Z', 'Asia/Kolkata');
  });

  it('emails every invitee once, by the meeting\'s own title, and the host once', async () => {
    const { db } = makeDb(row());
    await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    const to = sentEmails.map((e) => e.to);
    expect(to.filter((t) => t === 'parent@gmail.com')).toHaveLength(1);
    expect(to.filter((t) => t === 'viswanathan.s@jkkn.ac.in')).toHaveLength(1);
    // the host leg shares one key, so Resend keeps it to one email
    const hostKeys = new Set(sentEmails.filter((e) => e.to === 'director@jkkn.ac.in').map((e) => e.key));
    expect(hostKeys.size).toBe(1);
    expect(sentEmails.every((e) => !/–\s*Meeting\b/.test(e.subject))).toBe(true);
    expect(sentEmails.some((e) => e.subject.includes('Fee review'))).toBe(true);
  });

  it('a calendar that refuses puts the meeting back: nothing changed', async () => {
    patchEventTime.mockResolvedValue(false);
    const { db, now } = makeDb(row());
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(r).toMatchObject({ ok: false, error: { code: 'CALENDAR_FAILED' } });
    expect(now()).toMatchObject({ start_time: OLD_START, end_time: OLD_END, previous_start_time: null, reschedule_count: 0 });
    expect(sentEmails).toHaveLength(0);
  });

  it('if putting it back also fails, the move stands with a warning', async () => {
    patchEventTime.mockResolvedValue(false);
    const { db } = makeDb(row(), { restoreFails: true });
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(r.ok).toBe(true);
    expect(r.warning).toMatch(/still shows the old time/);
  });

  it('a clash with another meeting is SLOT_TAKEN and nothing is patched', async () => {
    const { db } = makeDb(row(), { updateError: { code: '23P01', message: 'exclusion' } });
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(r).toMatchObject({ ok: false, error: { code: 'SLOT_TAKEN' } });
    expect(patchEventTime).not.toHaveBeenCalled();
  });

  it('refuses a meeting of another host, a typed meeting, or a cancelled one', async () => {
    for (const over of [{ host_profile_id: 'someone-else' }, { meeting_type_id: 't1' }, { status: 'cancelled' }]) {
      const { db, updates } = makeDb(row(over));
      const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
      expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(updates).toHaveLength(0);
    }
  });

  it('a meeting someone else moved meanwhile is not overwritten', async () => {
    const { db } = makeDb(row());
    // the row moves under us between the read and the write
    const realFrom = db.from.bind(db);
    let reads = 0;
    db.from = (t: string) => {
      const b = realFrom(t);
      const ms = b.maybeSingle;
      b.maybeSingle = async () => {
        const out = await ms();
        if (t === 'meeting_bookings' && ++reads === 1 && out.data) out.data = { ...out.data, start_time: '2099-01-09T05:00:00.000Z' };
        return out;
      };
      return b;
    };
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(patchEventTime).not.toHaveBeenCalled();
  });
});

describe('moveDirect: the review round of 10 Oct', () => {
  it('Google not answering keeps the move (it may have applied) and warns', async () => {
    patchEventTime.mockRejectedValue(new Error('socket hang up'));
    const { db, now } = makeDb(row());
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(r.ok).toBe(true);
    expect(r.warning).toMatch(/did not confirm the new time/);
    expect(now()).toMatchObject({ start_time: NEW_START });
  });

  it('a room that cannot follow the meeting is reported, not hidden', async () => {
    const { db } = makeDb(row({ venue_reservation_id: 'room-1' }), { roomError: true });
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(r.ok).toBe(true);
    expect(r.warning).toMatch(/room booked for this meeting is still held at the old time/);
  });

  it('only a meeting the server marked host-direct can be moved', async () => {
    const { db, updates } = makeDb(row({ source: 'routing-form' }));
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(updates).toHaveLength(0);
  });

  it('moves only from the start the caller checked', async () => {
    const { db, updates } = makeDb(row());
    const r = await HostSchedulingService.moveDirect(db, {
      uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30, expectedStartIso: '2099-01-09T05:00:00.000Z',
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(updates).toHaveLength(0);
  });

  it('the host gets ONE moved email however many are invited', async () => {
    const { db } = makeDb(row());
    await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(sentEmails.filter((e) => e.to === 'director@jkkn.ac.in')).toHaveLength(1);
  });
});

describe('moveDirect: a cancel that lands mid-move (review 12:52 IST)', () => {
  it('a cancel after the row moved stops the calendar patch and every "moved" email', async () => {
    const { db } = makeDb(row(), { cancelAfterMove: true });
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    // the row DID move; the reply says the cancel won, never "nothing changed"
    expect(r).toMatchObject({ ok: false, error: { code: 'CANCELLED_MEANWHILE' } });
    expect(r.error?.message).toBe(
      'The meeting was cancelled while it was being moved. The cancellation stands; nobody was sent the new time.'
    );
    expect(r.error?.message).not.toMatch(/nothing was changed/i);
    expect(patchEventTime).not.toHaveBeenCalled();
    expect(sentEmails).toHaveLength(0);
  });

  it('a cancel during the calendar patch: the put-back never rewrites the cancelled row, and no email goes', async () => {
    const h = makeDb(row());
    patchEventTime.mockImplementation(async () => {
      h.cancelNow();
      return false;
    });
    await HostSchedulingService.moveDirect(h.db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(h.now()).toMatchObject({ status: 'cancelled', start_time: NEW_START });
    expect(sentEmails).toHaveLength(0);
  });

  it('a failed status read is NOT a cancel: the move goes on', async () => {
    const { db, now } = makeDb(row(), { statusReadFails: true });
    const r = await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(r.ok).toBe(true);
    expect(patchEventTime).toHaveBeenCalled();
    expect(now()).toMatchObject({ start_time: NEW_START, status: 'confirmed' });
  });

  it('a calendar refusal on a meeting cancelled meanwhile: no room move, no email, the cancel stands', async () => {
    const h = makeDb(row({ venue_reservation_id: 'room-1' }));
    patchEventTime.mockImplementation(async () => {
      h.cancelNow();
      return false;
    });
    const r = await HostSchedulingService.moveDirect(h.db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(r).toMatchObject({ ok: false, error: { code: 'CANCELLED_MEANWHILE' } });
    expect(h.updates.filter((u) => u.table === 'resource_reservations')).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it('with no invitee list, the row\'s attendee and the host still hear of the move', async () => {
    const { db } = makeDb(row({ answers: { title: 'Fee review' } }));
    await HostSchedulingService.moveDirect(db, { uid: 'uid-1', hostProfileId: HOST, startIso: NEW_START, durationMin: 30 });
    expect(sentEmails.map((e) => e.to).sort()).toEqual(['director@jkkn.ac.in', 'parent@gmail.com']);
  });
});

describe('cancelling a directly scheduled meeting tells everyone', () => {
  it('emails every invitee with the meeting\'s own title', async () => {
    const { db } = makeDb(row());
    const r = await NativeSchedulingService.cancelBooking(db, 'uid-1', { actorProfileId: HOST }, 'Parent unwell');
    expect(r.success).toBe(true);
    const invitees = sentEmails.filter((e) => e.to !== 'director@jkkn.ac.in');
    expect(invitees.map((e) => e.to).sort()).toEqual(['parent@gmail.com', 'viswanathan.s@jkkn.ac.in']);
    expect(invitees.every((e) => e.subject === 'Meeting Cancelled – Fee review')).toBe(true);
    // each invitee has their own key, so Resend sends both
    expect(new Set(invitees.map((e) => e.key)).size).toBe(2);
    expect(markEventCancelled.mock.calls[0][3]).toBe('Cancelled: Fee review — A Parent');
  });

  it('the host gets ONE cancel email, and one invitee failing does not stop the rest', async () => {
    throwFor.add('parent@gmail.com');
    const { db } = makeDb(row());
    const r = await NativeSchedulingService.cancelBooking(db, 'uid-1', { actorProfileId: HOST });
    expect(r.success).toBe(true);
    expect(sentEmails.filter((e) => e.to === 'director@jkkn.ac.in')).toHaveLength(1);
    expect(sentEmails.map((e) => e.to)).toContain('viswanathan.s@jkkn.ac.in');
  });

  it('a booking with no type that the server did NOT mark host-direct does not use its answers', async () => {
    const { db } = makeDb(row({ source: 'routing-form', answers: { title: 'Forged', participants: [{ email: 'victim@example.com' }] } }));
    await NativeSchedulingService.cancelBooking(db, 'uid-1', { actorProfileId: HOST });
    expect(sentEmails.filter((e) => e.to !== 'director@jkkn.ac.in').map((e) => e.to)).toEqual(['parent@gmail.com']);
  });

  it('a TYPED booking whose form answers carry a forged invitee list and title emails only its real attendee', async () => {
    const { db } = makeDb(
      row({
        meeting_type_id: 't1',
        answers: {
          title: 'You won a prize',
          participants: [{ email: 'victim@example.com', name: 'Victim' }, { email: 'other@example.com' }],
        },
      })
    );
    await NativeSchedulingService.cancelBooking(db, 'uid-1', { actorProfileId: HOST });
    const invitees = sentEmails.filter((e) => e.to !== 'director@jkkn.ac.in');
    expect(invitees.map((e) => e.to)).toEqual(['parent@gmail.com']);
    expect(invitees[0].subject).toBe('Meeting Cancelled – Meeting');
    expect(markEventCancelled.mock.calls[0][3]).toBe('Cancelled: Meeting — A Parent');
  });

  it('a typed meeting with no participant list still emails its one attendee', async () => {
    const { db } = makeDb(row({ meeting_type_id: 't1', answers: {} }));
    await NativeSchedulingService.cancelBooking(db, 'uid-1', { actorProfileId: HOST });
    expect(sentEmails.filter((e) => e.to !== 'director@jkkn.ac.in').map((e) => e.to)).toEqual(['parent@gmail.com']);
  });
});
