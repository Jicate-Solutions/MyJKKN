import { describe, it, expect } from 'vitest';
import {
  quotaWindowStart,
  slotEndTime,
  expenseTotal,
  canLearnerCancel,
  isLiveStatus,
  bookingErrorMessage,
  holdMessage,
  typeQuota,
  canReschedule,
  rescheduleNeedsNote,
  RESCHEDULE_REASON_CODES,
  RESCHEDULE_REASON_LABEL,
} from '@/lib/services/campus-living/housekeeping-rules';

// quotaWindowStart mirrors the CASE inside fn_cl_housekeeping_book. The SQL's
// own output for these dates was checked against these expectations; if this
// block fails, the UI and the RPC disagree about how much quota is left.
describe('quotaWindowStart — must mirror fn_cl_housekeeping_book exactly', () => {
  it('day: the window is the booking date itself', () => {
    expect(quotaWindowStart('2026-09-15', 'day')).toBe('2026-09-15');
  });

  it('week: 7 days INCLUSIVE, so the start is date - 6', () => {
    expect(quotaWindowStart('2026-09-15', 'week')).toBe('2026-09-09');
  });

  it('month: 30 days INCLUSIVE, so the start is date - 29', () => {
    expect(quotaWindowStart('2026-09-15', 'month')).toBe('2026-08-17');
  });

  it('crosses a month boundary correctly', () => {
    expect(quotaWindowStart('2026-03-03', 'week')).toBe('2026-02-25');
  });

  it('crosses a year boundary correctly', () => {
    expect(quotaWindowStart('2027-01-02', 'week')).toBe('2026-12-27');
  });

  it('handles a leap day without drifting', () => {
    expect(quotaWindowStart('2028-03-01', 'week')).toBe('2028-02-24');
  });
});

describe('slotEndTime', () => {
  it('adds the duration to the start', () => {
    expect(slotEndTime('09:00', 30)).toBe('09:30');
  });

  it('rolls the hour over', () => {
    expect(slotEndTime('09:45', 30)).toBe('10:15');
  });

  it('handles a 90-minute deep clean', () => {
    expect(slotEndTime('10:30', 90)).toBe('12:00');
  });

  it('accepts a HH:MM:SS input and still returns HH:MM', () => {
    expect(slotEndTime('09:00:00', 45)).toBe('09:45');
  });
});

describe('expenseTotal', () => {
  it('sums quantity x unit cost across lines', () => {
    expect(
      expenseTotal([
        { quantity: 2, unit_cost_inr: 45.5 },
        { quantity: 1, unit_cost_inr: 120 },
      ]),
    ).toBe(211);
  });

  it('is 0 for no lines, not NaN — a type with no expenses is valid', () => {
    expect(expenseTotal([])).toBe(0);
  });

  it('rounds to 2 decimals rather than carrying float noise', () => {
    expect(expenseTotal([{ quantity: 3, unit_cost_inr: 33.33 }])).toBe(99.99);
  });
});

describe('canLearnerCancel — only while nobody is assigned', () => {
  it('allows cancelling a fresh booking', () => {
    expect(canLearnerCancel('booked')).toBe(true);
  });

  it.each(['assigned', 'in_progress', 'awaiting_feedback', 'completed', 'cancelled'] as const)(
    'refuses once status is %s',
    (status) => {
      expect(canLearnerCancel(status)).toBe(false);
    },
  );
});

// isLiveStatus mirrors the WHERE of ux_hk_one_live_booking_per_room. If these
// drift apart the UI will offer a Book button the database then refuses.
describe('isLiveStatus — must match ux_hk_one_live_booking_per_room exactly', () => {
  it.each(['booked', 'assigned', 'in_progress', 'awaiting_feedback'] as const)(
    '%s holds the room lock',
    (status) => {
      expect(isLiveStatus(status)).toBe(true);
    },
  );

  it.each(['completed', 'cancelled'] as const)('%s releases the room lock', (status) => {
    expect(isLiveStatus(status)).toBe(false);
  });
});

describe('bookingErrorMessage', () => {
  it('translates room_locked into something a learner can act on', () => {
    expect(bookingErrorMessage('room_locked', 'fallback')).toMatch(/roommate/i);
  });

  it('translates category_not_eligible without blaming the learner', () => {
    expect(bookingErrorMessage('category_not_eligible', 'fallback')).toMatch(/room type/i);
  });

  it('falls back for an unknown code rather than showing the raw code', () => {
    expect(bookingErrorMessage('some_new_code', 'Could not book')).toBe('Could not book');
  });
});

describe('holdMessage', () => {
  it('names the cleaning and the date so the warden knows what to chase', () => {
    const msg = holdMessage({
      learner_id: 'l1',
      room_id: 'r1',
      booking_id: 'b1',
      booking_date: '2026-09-12',
      type_name: 'Toilet Cleaning',
    });
    expect(msg).toContain('Toilet Cleaning');
    expect(msg).toContain('12 Sep 2026');
  });
});


// typeQuota mirrors step 6 of fn_cl_housekeeping_book. The bug it exists to stop:
// the page counted only bookings dated up to TODAY, so a 1-per-week type looked
// free the moment its single booking moved into the future. The picker offered
// it and the RPC then refused with quota_exhausted.
describe('typeQuota — the window is SYMMETRIC about the date being booked', () => {
  const base = { typeId: 't1', usageLimit: 1, usagePeriod: 'week' as const, today: '2026-09-07' };

  it('counts a booking dated in the FUTURE against today, because the window is symmetric', () => {
    // The whole point of migration 20260909150000. Today (7th) has window
    // [1st, 13th], which DOES contain the 8th -- so a 1-per-week type booked for
    // tomorrow is used up today too. Before it was symmetric this returned 1 and
    // the picker offered a slot the RPC would then have refused.
    const q = typeQuota({
      ...base,
      bookings: [{ type_id: 't1', status: 'completed', booking_date: '2026-09-08' }],
    });
    expect(q.remainingToday).toBe(0);
    expect(q.bookable).toBe(false);
  });

  it('a booking just outside the window on either side does not count', () => {
    const q = typeQuota({
      ...base,
      bookings: [
        { type_id: 't1', status: 'completed', booking_date: '2026-08-31' }, // today - 7
        { type_id: 't1', status: 'booked', booking_date: '2026-09-14' },    // today + 7
      ],
    });
    expect(q.remainingToday).toBe(1);
  });

  it('counts a completed booking, not just a live one', () => {
    const q = typeQuota({
      ...base,
      bookings: [{ type_id: 't1', status: 'completed', booking_date: '2026-09-07' }],
    });
    expect(q.remainingToday).toBe(0);
  });

  it('ignores a cancelled booking, matching the RPC', () => {
    const q = typeQuota({
      ...base,
      bookings: [{ type_id: 't1', status: 'cancelled', booking_date: '2026-09-07' }],
    });
    expect(q.remainingToday).toBe(1);
    expect(q.bookable).toBe(true);
  });

  it('ignores other types', () => {
    const q = typeQuota({
      ...base,
      bookings: [{ type_id: 't2', status: 'completed', booking_date: '2026-09-07' }],
    });
    expect(q.remainingToday).toBe(1);
  });

  it('stays bookable when today is full but a later date in the horizon is free', () => {
    // One booking on the 7th. Booking on the 14th has window [8th, 14th], which
    // excludes it, so the 14th is free and the type must stay selectable.
    const q = typeQuota({
      ...base,
      bookings: [{ type_id: 't1', status: 'completed', booking_date: '2026-09-07' }],
    });
    expect(q.remainingToday).toBe(0);
    expect(q.bookable).toBe(true);
    expect(q.nextAvailableDate).toBe('2026-09-14');
  });

  it('is not bookable at all when every date in the horizon is full', () => {
    // Two bookings a week apart cover the whole 8-day horizon for a 1/week type.
    const q = typeQuota({
      ...base,
      bookings: [
        { type_id: 't1', status: 'completed', booking_date: '2026-09-07' },
        { type_id: 't1', status: 'booked', booking_date: '2026-09-14' },
      ],
    });
    expect(q.bookable).toBe(false);
    expect(q.nextAvailableDate).toBeNull();
  });

  it('a 2-per-week type still has one left after a single booking', () => {
    const q = typeQuota({
      ...base,
      usageLimit: 2,
      bookings: [{ type_id: 't1', status: 'completed', booking_date: '2026-09-07' }],
    });
    expect(q.remainingToday).toBe(1);
    expect(q.nextAvailableDate).toBeNull();
  });
});

// canReschedule mirrors the status gate in fn_cl_housekeeping_reschedule. If
// these disagree the dialog offers a move the RPC then refuses.
describe('canReschedule — must mirror fn_cl_housekeeping_reschedule', () => {
  it('allows a booking nobody has started yet', () => {
    expect(canReschedule('booked')).toBe(true);
    expect(canReschedule('assigned')).toBe(true);
  });

  it('refuses once the cleaning is under way or done', () => {
    expect(canReschedule('in_progress')).toBe(false);
    expect(canReschedule('awaiting_feedback')).toBe(false);
    expect(canReschedule('completed')).toBe(false);
    expect(canReschedule('cancelled')).toBe(false);
  });
});

describe('reschedule reasons', () => {
  it('every reason code carries learner-facing copy', () => {
    for (const code of RESCHEDULE_REASON_CODES) {
      expect(RESCHEDULE_REASON_LABEL[code]).toBeTruthy();
    }
  });

  it('only "other" demands a note, matching the ck_hk_reschedule_note_for_other CHECK', () => {
    expect(rescheduleNeedsNote('other')).toBe(true);
    expect(rescheduleNeedsNote('cleaner_unavailable')).toBe(false);
    expect(rescheduleNeedsNote('learner_requested')).toBe(false);
  });

  it('the RPC refusals all have copy, so no learner sees a raw error_code', () => {
    for (const code of ['not_reschedulable', 'date_in_past', 'invalid_reason', 'reason_note_required', 'slot_unchanged']) {
      expect(bookingErrorMessage(code, 'FALLBACK')).not.toBe('FALLBACK');
    }
  });
});
