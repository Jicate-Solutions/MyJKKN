// __tests__/meetings/my-bookings-query.test.ts
//
// The list behind /meetings/my-bookings.
//
// The load-bearing fact these tests pin is a POLICY, not a preference. The
// only SELECT policy on meeting_bookings is:
//
//   mb_host_select : is_super_admin() OR is_admin()
//                    OR host_profile_id = auth.uid()
//
// It never mentions attendee_profile_id. Two consequences follow, and both are
// invisible in a screenshot:
//
//   1. A meeting you are only ATTENDING cannot be read through the session
//      client at all, which is why the read runs service-role behind an
//      explicit participant predicate.
//   2. /meetings/[uid] reads through the session client, so an attendee who
//      follows a link there gets notFound(). Linking attendee rows to the
//      detail page would look correct in review and dead-end every attendee in
//      production.
//
// canOpenDetail is that second rule. A test asserting only "hosts get a link"
// would pass on code that linked everyone.

import { describe, it, expect, vi } from 'vitest';

// The meetings services build Resend and a browser Supabase client at import
// time and throw without their env. Nothing under test touches them; these
// stubs only keep the module graph loadable.
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

import {
  BOOKING_STATUSES,
  MY_BOOKING_FILTERS,
  buildParticipantOr,
  canOpenDetail,
  isAwaitingOutcome,
  resolveFilter,
  viewerRole,
} from '@/lib/services/meetings/my-bookings-query';

const ME = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';

describe('an attendee must not be linked into the host-only detail page', () => {
  it('offers the detail page to the host', () => {
    expect(canOpenDetail('host')).toBe(true);
  });

  it('withholds it from the attendee, because RLS answers them notFound()', () => {
    expect(canOpenDetail('attendee')).toBe(false);
  });

  it('withholds it from someone with no role at all', () => {
    expect(canOpenDetail(null)).toBe(false);
  });
});

describe('which side of the meeting the viewer is on', () => {
  it('reads host when the viewer hosts it', () => {
    expect(viewerRole({ host_profile_id: ME, attendee_profile_id: OTHER }, ME)).toBe('host');
  });

  it('reads attendee when the viewer was booked into it', () => {
    expect(viewerRole({ host_profile_id: OTHER, attendee_profile_id: ME }, ME)).toBe('attendee');
  });

  it('prefers host when the viewer is somehow both', () => {
    // Self-bookings exist; hosting is the stronger claim because it is the one
    // that carries cancel and reschedule.
    expect(viewerRole({ host_profile_id: ME, attendee_profile_id: ME }, ME)).toBe('host');
  });

  it('returns null for a stranger, so the row is dropped rather than rendered', () => {
    expect(viewerRole({ host_profile_id: OTHER, attendee_profile_id: OTHER }, ME)).toBeNull();
  });

  it('does not match a row whose ids are null against a null-ish viewer', () => {
    expect(viewerRole({ host_profile_id: null, attendee_profile_id: null }, ME)).toBeNull();
  });
});

describe('the participant predicate', () => {
  it('asks for both sides of the meeting, not just the host side', () => {
    const or = buildParticipantOr(ME);
    expect(or).toContain(`host_profile_id.eq.${ME}`);
    expect(or).toContain(`attendee_profile_id.eq.${ME}`);
  });

  it('refuses anything that is not a uuid', () => {
    // The id is interpolated into a PostgREST filter expression, so a
    // malformed value would not narrow the query — it would change what the
    // expression means. Failing loudly beats querying something else.
    expect(() => buildParticipantOr('')).toThrow();
    expect(() => buildParticipantOr('me')).toThrow();
    expect(() => buildParticipantOr(`${ME},status.eq.confirmed`)).toThrow();
  });
});

describe('filters match the status values the database actually permits', () => {
  it('knows exactly the four values of meeting_bookings_status_check', () => {
    expect([...BOOKING_STATUSES]).toEqual(['confirmed', 'cancelled', 'completed', 'no_show']);
  });

  it('never filters on a status the CHECK constraint would reject', () => {
    for (const f of MY_BOOKING_FILTERS) {
      for (const s of f.statuses ?? []) {
        expect(BOOKING_STATUSES).toContain(s);
      }
    }
  });

  it('separates upcoming from past by TIME, not by status', () => {
    // Nothing transitions a booking to 'completed' on its own, so a meeting
    // held last month is still 'confirmed'. A status-only split listed every
    // past meeting under Upcoming and left Past permanently empty.
    const upcoming = MY_BOOKING_FILTERS.find((f) => f.key === 'upcoming');
    const past = MY_BOOKING_FILTERS.find((f) => f.key === 'past');
    expect(upcoming?.when).toBe('future');
    expect(past?.when).toBe('past');
    expect(upcoming?.statuses).toContain('confirmed');
    expect(past?.statuses).toContain('confirmed');
  });

  it('reads upcoming soonest-first and history newest-first', () => {
    expect(MY_BOOKING_FILTERS.find((f) => f.key === 'upcoming')?.ascending).toBe(true);
    expect(MY_BOOKING_FILTERS.find((f) => f.key === 'past')?.ascending).toBe(false);
  });

  it('leaves cancelled unbounded in time, so an old cancellation is still findable', () => {
    expect(MY_BOOKING_FILTERS.find((f) => f.key === 'cancelled')?.when).toBeNull();
  });
});

describe('an unknown ?status= shows the default rather than nothing', () => {
  it('falls back to upcoming', () => {
    expect(resolveFilter(undefined).key).toBe('upcoming');
    expect(resolveFilter(null).key).toBe('upcoming');
    expect(resolveFilter('').key).toBe('upcoming');
    expect(resolveFilter('nonsense').key).toBe('upcoming');
  });

  it('honours a real one', () => {
    expect(resolveFilter('cancelled').key).toBe('cancelled');
    expect(resolveFilter('all').key).toBe('all');
  });
});

describe('meetings that ended with nobody saying what happened', () => {
  const NOW = new Date('2026-08-24T12:00:00Z');

  it('flags a confirmed meeting whose start is behind us', () => {
    expect(isAwaitingOutcome({ status: 'confirmed', start_time: '2026-08-24T09:00:00Z' }, NOW)).toBe(
      true,
    );
  });

  it('does not flag one that has not started', () => {
    expect(isAwaitingOutcome({ status: 'confirmed', start_time: '2026-08-24T15:00:00Z' }, NOW)).toBe(
      false,
    );
  });

  it('does not flag a meeting somebody already answered for', () => {
    expect(isAwaitingOutcome({ status: 'completed', start_time: '2026-08-24T09:00:00Z' }, NOW)).toBe(
      false,
    );
    expect(isAwaitingOutcome({ status: 'no_show', start_time: '2026-08-24T09:00:00Z' }, NOW)).toBe(
      false,
    );
    expect(isAwaitingOutcome({ status: 'cancelled', start_time: '2026-08-24T09:00:00Z' }, NOW)).toBe(
      false,
    );
  });

  it('does not flag a row with no start time', () => {
    expect(isAwaitingOutcome({ status: 'confirmed', start_time: null }, NOW)).toBe(false);
  });
});
