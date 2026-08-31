// __tests__/meetings/booking-event-title.test.ts
//
// The host's calendar entry for a booking. The bug this fixes was not missing
// data — it was ORDER.
//
// The title read `${meetingType} — ${guest}`. Every one of the Director's
// one-to-one types is 47-48 characters ("One to One Meeting with Ommsharravana
// 5 Minutes"), and a phone truncates a calendar row well before that. So four
// back-to-back bookings on 24 Aug 2026 rendered as four identical rows reading
// "One to One Meeting with Ommsharrava…" — the guest's name was in the string
// the whole time, just past the cut. The host walked in blind.
//
// The target format is what he had before this system replaced Calendly:
//
//     Nazarkhan K — To discuss regarding the transfer
//     KTHIRESAN — medical
//
// These tests pin the ORDER, because that is the whole fix. A test that only
// asserted "the name appears somewhere" would have passed on the broken code.

import { describe, it, expect, vi } from 'vitest';

// The service's import chain builds Resend and a browser Supabase client at
// import time and throws without their env. bookingEventTitle is a pure
// function and touches neither; these stubs only get the module loaded.
vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {
    sendBookingConfirmedEmails: vi.fn(),
    sendBookingRescheduledEmails: vi.fn(),
    sendBookingCancelledEmails: vi.fn(),
  },
}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn(() => ({})) }));
vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: { busyForHost: vi.fn(async () => ({ status: 'ok', busy: [] })) },
}));

import { bookingEventTitle } from '@/lib/services/meetings/native-scheduling-service';

const LONG_TYPE = 'One to One Meeting with Ommsharravana 5 Minutes'; // 46 chars, real

describe('the guest comes first', () => {
  it('leads with the name, not the meeting type', () => {
    const t = bookingEventTitle({ attendeeName: 'Nazarkhan K', typeTitle: LONG_TYPE });
    expect(t.startsWith('Nazarkhan K')).toBe(true);
  });

  it('puts the name inside the first 30 characters a phone shows', () => {
    // The regression guard. On the old format the name began at character 49.
    const t = bookingEventTitle({ attendeeName: 'Nazarkhan K', typeTitle: LONG_TYPE });
    expect(t.slice(0, 30)).toContain('Nazarkhan K');
  });

  it('would have FAILED on the old format', () => {
    // Proves the check discriminates rather than agreeing with anything.
    const old = `${LONG_TYPE} — Nazarkhan K`;
    expect(old.slice(0, 30)).not.toContain('Nazarkhan K');
  });
});

describe('what the meeting is about', () => {
  it('replaces the type name with the note when the host opted in', () => {
    expect(bookingEventTitle({
      attendeeName: 'KTHIRESAN', typeTitle: LONG_TYPE, note: 'medical', showNote: true,
    })).toBe('KTHIRESAN — medical');
  });

  it('falls back to the type name when there is no note', () => {
    expect(bookingEventTitle({
      attendeeName: 'Nalini Mam', typeTitle: LONG_TYPE, showNote: true,
    })).toBe(`Nalini Mam — ${LONG_TYPE}`);
  });

  it('keeps the note OUT of the title unless the host opted in', () => {
    // The guest is an attendee: this title is on THEIR lock screen too.
    const t = bookingEventTitle({
      attendeeName: 'Nalini Mam', typeTitle: LONG_TYPE, note: 'regarding meeting minutes', showNote: false,
    });
    expect(t).not.toContain('regarding meeting minutes');
    expect(t).toBe(`Nalini Mam — ${LONG_TYPE}`);
  });

  it('ignores a note that is only whitespace', () => {
    expect(bookingEventTitle({
      attendeeName: 'Dr C Dhinesh', typeTitle: LONG_TYPE, note: '   ', showNote: true,
    })).toBe(`Dr C Dhinesh — ${LONG_TYPE}`);
  });
});

describe('missing guest name', () => {
  it.each([null, undefined, '', '   '])('says Guest rather than starting with a dash (%s)', (n) => {
    const t = bookingEventTitle({ attendeeName: n as string | null, typeTitle: LONG_TYPE });
    expect(t).toBe(`Guest — ${LONG_TYPE}`);
    expect(t.startsWith('—')).toBe(false);
  });
});
