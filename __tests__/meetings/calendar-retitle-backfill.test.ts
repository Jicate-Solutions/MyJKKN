// __tests__/meetings/calendar-retitle-backfill.test.ts
//
// The backfill that renames calendar events booked before #3168 put the guest's
// name first. #3168 fixed the code; every event already on the Director's
// calendar still carries the old order, and this script is what reaches them.
//
// It writes to a LIVE calendar with real external guests on it, so the two
// things worth pinning are not "does it build a string" but:
//
//   1. a re-run must be a no-op — never a second write, never a doubled title;
//   2. it must refuse anything it did not write — a title the host edited by
//      hand is data, not a target.
//
// Both are decided by classify(), so that is what these tests exercise.

import { describe, it, expect, vi } from 'vitest';

// The script's import chain reaches native-scheduling-service, which builds
// Resend and a browser Supabase client at import time and throws without their
// env. The helpers under test are pure; these stubs only get the module loaded.
vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {
    sendBookingConfirmedEmails: vi.fn(),
    sendBookingRescheduledEmails: vi.fn(),
    sendBookingCancelledEmails: vi.fn(),
  },
}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn(() => ({})) }));
vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: {
    getEvent: vi.fn(),
    patchEventSummarySilently: vi.fn(),
    busyForHost: vi.fn(async () => ({ status: 'ok', busy: [] })),
  },
  isGoogleCalConfigured: vi.fn(() => false),
}));

import {
  CANCELLED_PREFIX,
  classify,
  legacyTitles,
  parseArgs,
  proposedTitle,
  type RetitleBooking,
} from '@/scripts/retitle-calendar-events-guest-first';

const TYPE = 'One to One Meeting with Ommsharravana 5 Minutes'; // 46 chars, real

function booking(over: Partial<RetitleBooking> = {}): RetitleBooking {
  return {
    uid: 'abc123',
    attendeeName: 'Nazarkhan K',
    typeTitle: TYPE,
    note: null,
    showNote: false,
    status: 'confirmed',
    typeKnown: true,
    ...over,
  };
}

describe('the title it proposes', () => {
  it('is the guest-first title the booking path itself writes', () => {
    expect(proposedTitle(booking())).toBe(`Nazarkhan K — ${TYPE}`);
  });

  it('uses the note instead of the type when the host opted in', () => {
    expect(proposedTitle(booking({ attendeeName: 'KTHIRESAN', note: 'medical', showNote: true })))
      .toBe('KTHIRESAN — medical');
  });

  it('keeps the note out of the title when the host did not opt in', () => {
    const t = proposedTitle(booking({ note: 'regarding the transfer', showNote: false }));
    expect(t).not.toContain('regarding the transfer');
  });

  it('keeps a cancelled booking marked as cancelled', () => {
    // Dropping the prefix while renaming would quietly un-cancel the row.
    expect(proposedTitle(booking({ status: 'cancelled' })))
      .toBe(`${CANCELLED_PREFIX}Nazarkhan K — ${TYPE}`);
  });
});

describe('re-running changes nothing', () => {
  it('reports a title already in the new format as already done', () => {
    const b = booking();
    expect(classify(proposedTitle(b), b)).toBe('already');
  });

  it('reports an already-retitled CANCELLED event as already done', () => {
    // The path that would double the prefix if 'already' were checked second.
    const b = booking({ status: 'cancelled' });
    expect(classify(proposedTitle(b), b)).toBe('already');
  });

  it('would have FAILED to notice, had it only looked for the old shape', () => {
    // Proves the check discriminates: the new title is NOT a legacy title, so
    // a legacy-only test would have fallen through and written a second time.
    const b = booking();
    expect(legacyTitles(b)).not.toContain(proposedTitle(b));
  });

  it('is stable across a third pass', () => {
    const b = booking({ note: 'medical', showNote: true });
    let title = proposedTitle(b);
    for (let i = 0; i < 3; i++) {
      expect(classify(title, b)).toBe('already');
      title = classify(title, b) === 'retitle' ? proposedTitle(b) : title;
    }
    expect(title).toBe('Nazarkhan K — medical');
  });
});

describe('what it agrees to rewrite', () => {
  it('rewrites the ordinary old title', () => {
    const b = booking();
    expect(classify(`${TYPE} — Nazarkhan K`, b)).toBe('retitle');
  });

  it('rewrites the old three-part title a note-opted-in host produced', () => {
    const b = booking({ note: 'medical', showNote: true });
    expect(classify(`${TYPE} — Nazarkhan K — medical`, b)).toBe('retitle');
  });

  it('rewrites a cancelled event still carrying the old order', () => {
    // markEventCancelled builds its own string and STILL uses the old order on
    // main today, so these exist and keep being created.
    const b = booking({ status: 'cancelled' });
    expect(classify(`${CANCELLED_PREFIX}${TYPE} — Nazarkhan K`, b)).toBe('retitle');
  });

  it('tolerates surrounding whitespace on the live summary', () => {
    const b = booking();
    expect(classify(`  ${TYPE} — Nazarkhan K  `, b)).toBe('retitle');
  });
});

describe('what it refuses to touch', () => {
  it('leaves a title the host edited by hand alone', () => {
    const b = booking();
    expect(classify('Nazarkhan — bring the transfer file', b)).toBe('unrecognised');
  });

  it('leaves an unrelated calendar entry alone', () => {
    const b = booking();
    expect(classify('Dentist', b)).toBe('unrecognised');
  });

  it.each([null, '', '   '])('treats an empty summary as unrecognised (%s)', (s) => {
    expect(classify(s, booking())).toBe('unrecognised');
  });

  it('does not rewrite a legacy title belonging to a DIFFERENT booking', () => {
    // The guard is per-booking: matching "some old title" is not enough.
    const b = booking();
    expect(classify(`${TYPE} — Somebody Else`, b)).toBe('unrecognised');
  });
});

describe('when the meeting type was deleted after the booking', () => {
  // meeting_type_id is ON DELETE SET NULL, so the type name is gone from the
  // database while the event on Google still carries it. 3 of the 12 future
  // events are in this state, and they are the worst-reading rows of the lot.
  const deleted = () =>
    booking({ typeTitle: 'Meeting', typeKnown: false, attendeeName: 'DR.K.L.SENTHIL KUMAR' });

  it('still rewrites a title whose type name can no longer be reconstructed', () => {
    expect(classify('Some Since-Deleted Type — DR.K.L.SENTHIL KUMAR', deleted())).toBe('retitle');
  });

  it('still rewrites the three-part note variant', () => {
    const b = booking({
      typeTitle: 'Meeting',
      typeKnown: false,
      attendeeName: 'KTHIRESAN',
      note: 'medical',
      showNote: true,
    });
    expect(classify('Gone Type — KTHIRESAN — medical', b)).toBe('retitle');
  });

  it('proposes the guest-first title with the Meeting fallback', () => {
    expect(proposedTitle(deleted())).toBe('DR.K.L.SENTHIL KUMAR — Meeting');
  });

  it('is still a no-op on a second run', () => {
    const b = deleted();
    expect(classify(proposedTitle(b), b)).toBe('already');
  });

  it('does NOT accept a title merely mentioning the guest', () => {
    // The allowance is on the TAIL, not on the name appearing anywhere.
    expect(classify('DR.K.L.SENTHIL KUMAR wants to discuss fees', deleted()))
      .toBe('unrecognised');
  });

  it('does NOT accept another booking-s guest in the tail', () => {
    expect(classify('Some Since-Deleted Type — Somebody Else', deleted())).toBe('unrecognised');
  });

  it('stays OFF when the type IS known, so the strict gate still applies', () => {
    // Same tail, but reconstructable type — must not be loosened.
    const known = booking({ attendeeName: 'DR.K.L.SENTHIL KUMAR' });
    expect(classify('A Completely Different Type — DR.K.L.SENTHIL KUMAR', known))
      .toBe('unrecognised');
  });
});

describe('the flags', () => {
  it('is a dry run over future events with no flags at all', () => {
    expect(parseArgs([])).toEqual({ apply: false, scope: 'future' });
  });

  it('only writes when --apply is passed', () => {
    expect(parseArgs(['--apply']).apply).toBe(true);
    expect(parseArgs(['--scope', 'all']).apply).toBe(false);
  });

  it('accepts the wider scope', () => {
    expect(parseArgs(['--scope', 'all'])).toEqual({ apply: false, scope: 'all' });
  });

  it('refuses a scope it does not understand rather than guessing', () => {
    expect(() => parseArgs(['--scope', 'past'])).toThrow(/future/);
  });
});
