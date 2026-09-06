// __tests__/meetings/host-scheduling-service.test.ts
//
// Contracts for HOST-INITIATED scheduling. The load-bearing guarantees:
//
//   1. An ONLINE meeting asks Google for a Meet link; in-person/phone do NOT.
//   2. The booking survives every downstream failure — a Google outage or a
//      dead mailer must never lose a meeting the host was told was booked.
//      That is the whole reason the external calls run AFTER the insert.
//   3. A slot clash (23P01, the mb_no_double_booking gist exclusion) is
//      REPORTED, never silently moved. The host chose that time.
//   4. Every invitee reaches the Google event and the row's participant list —
//      a group meeting must not quietly shrink to its first attendee.

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  HostSchedulingService,
  validateScheduleInput,
  type ScheduleDirectInput,
} from '@/lib/services/meetings/host-scheduling-service';

const createEvent = vi.fn();
const getConnection = vi.fn();
const sendEmails = vi.fn();

vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: {
    createEvent: (...a: unknown[]) => createEvent(...a),
    getConnection: (...a: unknown[]) => getConnection(...a),
  },
}));

vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {
    sendBookingConfirmedEmails: (...a: unknown[]) => sendEmails(...a),
  },
}));

/** Minimal Supabase stub: profiles read, bookings insert, bookings update. */
function makeDb(opts: { insertError?: { code?: string; message: string } } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];

  const db = {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  institution_id: 'inst-1',
                  full_name: 'Ommsharravana S',
                  email: 'director@jkkn.ac.in',
                },
              }),
            }),
          }),
        };
      }
      // meeting_bookings
      return {
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return {
            select: () => ({
              single: async () =>
                opts.insertError
                  ? { data: null, error: opts.insertError }
                  : { data: { id: 'booking-1' }, error: null },
            }),
          };
        },
        update(patch: Record<string, unknown>) {
          updated.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  return { db: db as never, inserted, updated };
}

const base: ScheduleDirectInput = {
  hostProfileId: 'host-1',
  title: 'Admission review',
  startIso: '2026-09-01T04:30:00.000Z',
  durationMin: 30,
  locationMode: 'online',
  attendees: [
    { email: 'A@jkkn.ac.in', name: 'Anitha', profileId: 'p-1' },
    { email: 'b@example.com', name: 'Bala', profileId: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getConnection.mockResolvedValue({ status: 'active' });
  createEvent.mockResolvedValue({ eventId: 'gcal-1', meetUrl: 'https://meet.google.com/abc-defg-hij' });
  sendEmails.mockResolvedValue(undefined);
});

describe('validateScheduleInput', () => {
  it('rejects an empty attendee list', () => {
    expect(validateScheduleInput({ ...base, attendees: [] })?.code).toBe('VALIDATION');
  });

  it('rejects a malformed address', () => {
    const r = validateScheduleInput({
      ...base,
      attendees: [{ email: 'not-an-email', name: 'X' }],
    });
    expect(r?.code).toBe('VALIDATION');
    expect(r?.message).toContain('not-an-email');
  });

  it('rejects the same person listed twice', () => {
    const r = validateScheduleInput({
      ...base,
      attendees: [
        { email: 'a@jkkn.ac.in', name: 'A' },
        { email: 'A@JKKN.ac.in', name: 'A again' },
      ],
    });
    expect(r?.code).toBe('VALIDATION');
  });

  it('requires a place for an in-person meeting', () => {
    expect(
      validateScheduleInput({ ...base, locationMode: 'in_person', locationText: '  ' })?.code,
    ).toBe('VALIDATION');
  });

  it('accepts a well-formed online meeting', () => {
    expect(validateScheduleInput(base)).toBeNull();
  });
});

describe('scheduleDirect — Meet links', () => {
  it('ONLINE asks Google for a Meet link and writes it back', async () => {
    const { db, updated } = makeDb();
    const res = await HostSchedulingService.scheduleDirect(db, base);

    expect(res.ok).toBe(true);
    expect(createEvent.mock.calls[0][2].withMeet).toBe(true);
    expect(updated[0]).toMatchObject({
      video_url: 'https://meet.google.com/abc-defg-hij',
      google_event_id: 'gcal-1',
    });
    if (res.ok) expect(res.data.videoUrl).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('IN-PERSON does NOT request a Meet link, and passes the venue as the location', async () => {
    const { db } = makeDb();
    createEvent.mockResolvedValue({ eventId: 'gcal-2', meetUrl: null });

    const res = await HostSchedulingService.scheduleDirect(db, {
      ...base,
      locationMode: 'in_person',
      locationText: 'Board Room',
    });

    expect(res.ok).toBe(true);
    expect(createEvent.mock.calls[0][2].withMeet).toBe(false);
    expect(createEvent.mock.calls[0][2].location).toBe('Board Room');
    if (res.ok) expect(res.data.videoUrl).toBeNull();
  });

  it('PHONE does not request a link and carries no location', async () => {
    const { db } = makeDb();
    createEvent.mockResolvedValue({ eventId: 'gcal-3', meetUrl: null });

    await HostSchedulingService.scheduleDirect(db, { ...base, locationMode: 'phone' });
    expect(createEvent.mock.calls[0][2].withMeet).toBe(false);
    expect(createEvent.mock.calls[0][2].location).toBeUndefined();
  });

  it('warns when an ONLINE meeting comes back without a link rather than reporting clean success', async () => {
    const { db } = makeDb();
    createEvent.mockResolvedValue({ eventId: 'gcal-4', meetUrl: null });

    const res = await HostSchedulingService.scheduleDirect(db, base);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.warning).toMatch(/did not return a Meet link/i);
  });
});

describe('scheduleDirect — the booking survives downstream failure', () => {
  it('a thrown Google error still leaves a booked meeting, with a warning', async () => {
    const { db } = makeDb();
    createEvent.mockRejectedValue(new Error('google exploded'));

    const res = await HostSchedulingService.scheduleDirect(db, base);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.uid).toBeTruthy();
      expect(res.data.warning).toMatch(/could not be created/i);
    }
  });

  it('no Google connection still books, and says invitations were not sent', async () => {
    const { db } = makeDb();
    getConnection.mockResolvedValue({ status: 'broken' });

    const res = await HostSchedulingService.scheduleDirect(db, base);
    expect(res.ok).toBe(true);
    expect(createEvent).not.toHaveBeenCalled();
    if (res.ok) expect(res.data.warning).toMatch(/not connected/i);
  });

  it('a dead mailer never fails the booking', async () => {
    const { db } = makeDb();
    sendEmails.mockRejectedValue(new Error('resend down'));

    const res = await HostSchedulingService.scheduleDirect(db, base);
    expect(res.ok).toBe(true);
  });
});

describe('scheduleDirect — slot clash', () => {
  it('maps 23P01 to SLOT_TAKEN and does NOT move the meeting', async () => {
    const { db } = makeDb({ insertError: { code: '23P01', message: 'conflicting key' } });

    const res = await HostSchedulingService.scheduleDirect(db, base);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('SLOT_TAKEN');
      expect(res.error.message).toMatch(/already have a meeting/i);
    }
    // Nothing external may happen for a meeting that was never created.
    expect(createEvent).not.toHaveBeenCalled();
    expect(sendEmails).not.toHaveBeenCalled();
  });

  it('an unrelated insert error is reported as itself, not as a clash', async () => {
    const { db } = makeDb({ insertError: { code: '42501', message: 'permission denied' } });
    const res = await HostSchedulingService.scheduleDirect(db, base);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('UNKNOWN');
  });
});

describe('scheduleDirect — group meetings keep everyone', () => {
  it('puts EVERY invitee on the Google event and in the row participant list', async () => {
    const { db, inserted } = makeDb();
    await HostSchedulingService.scheduleDirect(db, base);

    const eventAttendees = createEvent.mock.calls[0][2].attendees;
    expect(eventAttendees).toHaveLength(2);
    expect(eventAttendees.map((a: { email: string }) => a.email)).toEqual([
      'a@jkkn.ac.in',
      'b@example.com',
    ]);

    const answers = inserted[0].answers as Record<string, unknown>;
    expect(answers.participants).toHaveLength(2);
    // Only the JKKN person contributes a profile id.
    expect(answers.participant_profile_ids).toEqual(['p-1']);
    // The row's own attendee columns hold the FIRST person, lowercased.
    expect(inserted[0].attendee_email).toBe('a@jkkn.ac.in');
    expect(inserted[0].meeting_type_id).toBeNull();
    expect(inserted[0].source).toBe('host-direct');
  });

  it('emails every attendee, not just the primary', async () => {
    const { db } = makeDb();
    await HostSchedulingService.scheduleDirect(db, base);
    expect(sendEmails).toHaveBeenCalledTimes(2);
    expect(sendEmails.mock.calls.map((c) => c[0].attendeeEmail)).toEqual([
      'a@jkkn.ac.in',
      'b@example.com',
    ]);
  });

  it('computes end_time from the duration', async () => {
    const { db, inserted } = makeDb();
    await HostSchedulingService.scheduleDirect(db, { ...base, durationMin: 45 });
    expect(inserted[0].start_time).toBe('2026-09-01T04:30:00.000Z');
    expect(inserted[0].end_time).toBe('2026-09-01T05:15:00.000Z');
  });
});
