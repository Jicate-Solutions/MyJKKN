// __tests__/meetings/person-history.test.ts
//
// "Past meetings with this person" — the panel on /meetings/[uid].
//
// The load-bearing facts here are about HONESTY, and they were read off
// production on 2026-08-25:
//
//   * outcome_marked_by is NULL on ALL 128 bookings. The 62 rows with
//     status='completed' were all closed by one bulk backfill at the same
//     instant (2026-08-18 02:54:56.7029+00). Nobody ever confirmed a single
//     one of those meetings took place.
//   * The Dental Principal has 11 bookings with the Director — and 5 of them
//     are cancelled. A summary reading "you have met him 11 times" would be
//     wrong about nearly half of them.
//
// So the tests that matter are the ones that would PASS on a naive
// implementation and must not: mapping 'completed' to "happened", and counting
// cancelled bookings as meetings. Each has a companion assertion proving the
// check discriminates rather than agreeing with anything.

import { describe, it, expect, vi } from 'vitest';

// The meetings module graph builds Resend and a browser Supabase client at
// import time and throws without their env. Nothing under test touches them;
// these stubs only keep the graph loadable.
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
  buildHistory,
  deriveOutcome,
  extractNote,
  outcomeLabel,
  summarize,
  HISTORY_LIMIT,
} from '@/lib/services/meetings/meeting-person-history-service';

// A prior-booking row, shaped like the production select.
function row(
  over: Partial<{
    uid: string;
    start_time: string;
    status: string | null;
    outcome_marked_by: string | null;
    answers: unknown;
    meeting_type_id: string | null;
  }> = {},
) {
  return {
    uid: 'u1',
    start_time: '2026-08-01T06:00:00+00:00',
    status: 'completed',
    outcome_marked_by: null,
    answers: {},
    meeting_type_id: null,
    ...over,
  };
}

// ============================================================================

describe('outcome is never claimed more confidently than the record allows', () => {
  it('says NOT RECORDED for a completed meeting nobody closed', () => {
    // This is the real production shape: status='completed', marked_by NULL.
    // All 62 completed rows look exactly like this.
    expect(deriveOutcome({ status: 'completed', outcomeMarkedBy: null })).toBe('not_recorded');
  });

  it('would have FAILED on the naive status===completed reading', () => {
    // Proves the test above discriminates: the obvious implementation maps
    // 'completed' straight to "happened" and would light up all 62 rows green.
    const naive = (s: string) => (s === 'completed' ? 'happened' : 'not_recorded');
    expect(naive('completed')).toBe('happened');
    expect(deriveOutcome({ status: 'completed', outcomeMarkedBy: null })).not.toBe('happened');
  });

  it('says NOT RECORDED when the auto-closer closed it', () => {
    // 'system' is the third legal value of mb_outcome_marked_by_chk. The detail
    // page already words this as "nobody confirmed it took place".
    expect(deriveOutcome({ status: 'completed', outcomeMarkedBy: 'system' })).toBe('not_recorded');
  });

  it('says HAPPENED only when a person recorded it', () => {
    expect(deriveOutcome({ status: 'completed', outcomeMarkedBy: 'host' })).toBe('happened');
    expect(deriveOutcome({ status: 'completed', outcomeMarkedBy: 'admin' })).toBe('happened');
  });

  it('trusts cancelled and no_show, because those are acts somebody performed', () => {
    expect(deriveOutcome({ status: 'cancelled', outcomeMarkedBy: null })).toBe('cancelled');
    expect(deriveOutcome({ status: 'no_show', outcomeMarkedBy: null })).toBe('no_show');
  });

  it('treats a still-confirmed past meeting as not recorded', () => {
    expect(deriveOutcome({ status: 'confirmed', outcomeMarkedBy: null })).toBe('not_recorded');
  });

  it.each([null, undefined, '', 'something_new'])(
    'falls back to not recorded for an unknown status (%s)',
    (s) => {
      expect(deriveOutcome({ status: s as string | null, outcomeMarkedBy: null })).toBe(
        'not_recorded',
      );
    },
  );

  it('never renders an outcome as a raw enum', () => {
    expect(outcomeLabel('not_recorded')).toBe('Not recorded');
    expect(outcomeLabel('happened')).toBe('Happened');
    expect(outcomeLabel('no_show')).toBe('No-show');
    expect(outcomeLabel('cancelled')).toBe('Cancelled');
  });
});

// ============================================================================

describe('the summary line does not count a cancelled meeting as a meeting', () => {
  // The Dental Principal's real shape: 10 priors, 5 of them cancelled.
  const dental = buildHistory('Dr Dhanasekar Balakrishnan', [
    ...Array.from({ length: 5 }, (_, i) =>
      row({ uid: `c${i}`, status: 'cancelled', start_time: `2026-08-19T0${i}:00:00+00:00` }),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      row({ uid: `d${i}`, status: 'completed', start_time: `2026-07-1${i}T06:00:00+00:00` }),
    ),
  ]);

  it('counts only the ones that were not called off', () => {
    expect(dental.metCount).toBe(5);
    expect(dental.cancelledCount).toBe(5);
  });

  it('says 5, not 10', () => {
    const s = summarize(dental);
    expect(s).toContain('You have met Dr Dhanasekar Balakrishnan 5 times before');
    expect(s).not.toContain('10 times');
  });

  it('names the cancelled ones rather than hiding them', () => {
    expect(summarize(dental)).toContain('5 more were cancelled');
  });

  it('dates the relationship from the first meeting that was not cancelled', () => {
    // The cancelled block is in August; the meetings that happened start in
    // July. "since" must name July, or it credits a date whose only meeting
    // was called off.
    expect(dental.metSince).toBe('2026-07-10T06:00:00+00:00');
    expect(summarize(dental)).toContain('since 10 July 2026');
  });

  it('refuses to say "you have met" when every prior meeting was cancelled', () => {
    const allOff = buildHistory('Someone', [
      row({ uid: 'a', status: 'cancelled' }),
      row({ uid: 'b', status: 'cancelled', start_time: '2026-08-02T06:00:00+00:00' }),
    ]);
    const s = summarize(allOff);
    expect(s).not.toContain('You have met');
    expect(s).toBe('You have 2 earlier meetings with Someone — all cancelled.');
  });

  it('reads naturally for a single prior meeting', () => {
    const once = buildHistory('Nalini Mam', [row({ uid: 'a', outcome_marked_by: 'host' })]);
    expect(summarize(once)).toBe('You have met Nalini Mam once before since 1 August 2026.');
  });

  it('falls back to "this person" rather than an empty name', () => {
    expect(summarize(buildHistory('   ', [row()]))).toContain('this person');
  });
});

// ============================================================================

describe('ordering and the cap', () => {
  const many = Array.from({ length: 14 }, (_, i) =>
    row({ uid: `m${i}`, start_time: `2026-08-${String(i + 1).padStart(2, '0')}T06:00:00+00:00` }),
  );

  it('lists most recent first even when the input is not sorted', () => {
    const h = buildHistory('X', [...many].reverse());
    expect(h.meetings[0].uid).toBe('m13'); // 14 August, the latest
    expect(h.meetings[1].uid).toBe('m12');
  });

  it('caps the list at HISTORY_LIMIT', () => {
    expect(HISTORY_LIMIT).toBe(10);
    expect(buildHistory('X', many).meetings).toHaveLength(10);
  });

  it('reports what it hid instead of truncating silently', () => {
    const h = buildHistory('X', many);
    expect(h.hiddenCount).toBe(4);
    expect(h.meetings.length + h.hiddenCount).toBe(14);
  });

  it('hides the OLDEST, not whatever happened to be last in the array', () => {
    const shown = buildHistory('X', [...many].reverse()).meetings.map((m) => m.uid);
    expect(shown).toContain('m13'); // newest kept
    expect(shown).not.toContain('m0'); // oldest dropped
  });

  it('counts every prior meeting in the summary, including the capped-off ones', () => {
    // The cap is a display limit. A summary that counted only the visible rows
    // would under-report the relationship.
    expect(buildHistory('X', many).metCount).toBe(14);
  });

  it('sets hiddenCount to 0 when everything fits', () => {
    expect(buildHistory('X', many.slice(0, 3)).hiddenCount).toBe(0);
  });
});

// ============================================================================

describe('renders nothing when there is no history', () => {
  it('produces an empty meeting list from no rows', () => {
    // The page decides not to render on a null service result; this is the
    // second line of defence, and it is what the component checks.
    const h = buildHistory('X', []);
    expect(h.meetings).toHaveLength(0);
    expect(h.hiddenCount).toBe(0);
    expect(h.metCount).toBe(0);
    expect(h.metSince).toBeNull();
  });
});

// ============================================================================

describe('the booking note, from a JSONB column with two possible shapes', () => {
  it('reads the object shape production actually stores', () => {
    expect(extractNote({ note: 'ICOI MoU, NDC Inspections, Case-Based Learning' })).toBe(
      'ICOI MoU, NDC Inspections, Case-Based Learning',
    );
  });

  it('reads the array shape', () => {
    expect(extractNote([{ note: 'medical' }])).toBe('medical');
  });

  it('reads the question-list array shape', () => {
    expect(extractNote([{ question: 'Note', answer: 'transfer request' }])).toBe(
      'transfer request',
    );
  });

  it('returns null for the auto-booked rows that carry trigger metadata and no note', () => {
    // 10 of 128 production rows look exactly like this.
    expect(
      extractNote({
        breach_date: '2026-08-22',
        auto_booked_by: 'meeting-trigger-engine',
        trigger_event_ids: ['a0bd1c04-af03-4b9a-8191-bd8398856ab1'],
      }),
    ).toBeNull();
  });

  it.each([null, undefined, {}, [], '', 0, { note: '   ' }, { note: 42 }])(
    'returns null rather than a placeholder for %s',
    (v) => {
      expect(extractNote(v)).toBeNull();
    },
  );

  it('carries the note through buildHistory', () => {
    const h = buildHistory('X', [row({ answers: { note: 'Orientation for 2, 3 and 4th BDS' } })]);
    expect(h.meetings[0].note).toBe('Orientation for 2, 3 and 4th BDS');
  });
});

// ============================================================================

describe('meeting type titles', () => {
  it('uses the title when the type still exists', () => {
    const h = buildHistory(
      'X',
      [row({ meeting_type_id: 't1' })],
      new Map([['t1', 'Quick question']]),
    );
    expect(h.meetings[0].typeTitle).toBe('Quick question');
  });

  it('is null for a deleted type rather than showing a raw uuid', () => {
    const h = buildHistory('X', [row({ meeting_type_id: 't-gone' })], new Map());
    expect(h.meetings[0].typeTitle).toBeNull();
  });

  it('is null when the booking never had a type (auto-booked rows)', () => {
    const h = buildHistory('X', [row({ meeting_type_id: null })]);
    expect(h.meetings[0].typeTitle).toBeNull();
  });
});
