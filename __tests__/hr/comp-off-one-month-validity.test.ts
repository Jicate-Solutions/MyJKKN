/**
 * Compensatory off credits are valid for ONE CALENDAR MONTH from the day worked,
 * and comp off can only be taken inside that window (2026-09-11).
 *
 * The database owns both rules (hr_comp_off_set_expiry, hr_trig_comp_off_consume).
 * These two helpers are how the claim dialog and the Apply drawer predict them,
 * so they must agree with Postgres to the day — especially at month ends, where
 * JS `setMonth` and Postgres `+ interval '1 month'` part ways.
 */

import { describe, expect, it } from 'vitest';

import { addOneMonth, isBookableCompOffDate } from '@/types/hr-comp-off';

describe('addOneMonth — mirrors worked_date + INTERVAL 1 month', () => {
  it.each([
    ['2026-09-06', '2026-10-06'],
    ['2026-01-31', '2026-02-28'], // clamped, not rolled into March
    ['2028-01-31', '2028-02-29'], // leap year
    ['2026-11-30', '2026-12-30'],
    ['2026-12-15', '2027-01-15'], // year boundary
    ['2026-08-31', '2026-09-30'],
  ])('%s -> %s', (from, to) => {
    expect(addOneMonth(from)).toBe(to);
  });
});

describe('isBookableCompOffDate — after the day worked, up to expiry', () => {
  const credit = {
    worked_date: '2026-09-06',
    expires_on: '2026-10-06',
    effective_status: 'approved' as const,
  };

  it('allows a day inside the window', () => {
    expect(isBookableCompOffDate('2026-09-20', [credit])).toBe(true);
  });

  it('allows the expiry day itself', () => {
    expect(isBookableCompOffDate('2026-10-06', [credit])).toBe(true);
  });

  it('refuses the day after expiry', () => {
    expect(isBookableCompOffDate('2026-10-07', [credit])).toBe(false);
  });

  it('refuses the worked day and anything before it', () => {
    expect(isBookableCompOffDate('2026-09-06', [credit])).toBe(false);
    expect(isBookableCompOffDate('2026-09-01', [credit])).toBe(false);
  });

  it('ignores credits that are pending, expired or already used', () => {
    for (const effective_status of ['pending', 'expired', 'consumed', 'rejected'] as const) {
      expect(isBookableCompOffDate('2026-09-20', [{ ...credit, effective_status }])).toBe(false);
    }
  });

  it('accepts a date any one of several credits covers', () => {
    const later = { worked_date: '2026-10-01', expires_on: '2026-11-01', effective_status: 'approved' as const };
    expect(isBookableCompOffDate('2026-10-20', [credit, later])).toBe(true);
  });
});
