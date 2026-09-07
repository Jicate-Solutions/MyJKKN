import { describe, it, expect } from 'vitest';
import {
  quotaWindowStart,
  slotEndTime,
  expenseTotal,
  canLearnerCancel,
  isLiveStatus,
  bookingErrorMessage,
  holdMessage,
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
