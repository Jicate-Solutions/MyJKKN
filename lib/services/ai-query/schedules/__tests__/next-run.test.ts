/**
 * next_run_at maths for scheduled AI Assistant questions (the TypeScript mirror).
 * The SQL original is proved against the same cases, and against this mirror on
 * a grid of dates, in schedules-sql.pg.test.ts.
 *
 * All instants are written in UTC; IST = UTC+05:30, so 09:00 IST = 03:30Z.
 */
import { describe, expect, it } from 'vitest';
import {
  computeNextRun,
  describeSchedule,
  formatTimeIst,
  parseTimeIst,
} from '../next-run';

const at = (iso: string) => new Date(iso);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

describe('daily', () => {
  it('runs later today when the time is still ahead', () => {
    expect(iso(computeNextRun('daily', null, null, '09:00', at('2026-09-23T03:00:00Z')))).toBe(
      '2026-09-23T03:30:00.000Z',
    );
  });
  it('runs tomorrow when the time has passed', () => {
    expect(iso(computeNextRun('daily', null, null, '09:00', at('2026-09-23T03:31:00Z')))).toBe(
      '2026-09-24T03:30:00.000Z',
    );
  });
  it('is strictly after: exactly at the run time means the next day', () => {
    expect(iso(computeNextRun('daily', null, null, '09:00', at('2026-09-23T03:30:00Z')))).toBe(
      '2026-09-24T03:30:00.000Z',
    );
  });
  it('uses the IST date, not the UTC date, near midnight', () => {
    // 20:00Z on the 23rd is 01:30 IST on the 24th → 09:00 IST on the 24th
    expect(iso(computeNextRun('daily', null, null, '09:00', at('2026-09-23T20:00:00Z')))).toBe(
      '2026-09-24T03:30:00.000Z',
    );
  });
  it('handles a late-evening IST time that falls on the previous UTC day', () => {
    // 23:30 IST on the 23rd = 18:00Z on the 23rd
    expect(iso(computeNextRun('daily', null, null, '23:30', at('2026-09-23T10:00:00Z')))).toBe(
      '2026-09-23T18:00:00.000Z',
    );
  });
});

describe('weekly', () => {
  // 2026-09-23 is a Wednesday
  it('runs on the next chosen weekday', () => {
    expect(iso(computeNextRun('weekly', 1, null, '09:00', at('2026-09-23T03:00:00Z')))).toBe(
      '2026-09-28T03:30:00.000Z', // Monday
    );
  });
  it('runs today when today is the weekday and the time is ahead', () => {
    expect(iso(computeNextRun('weekly', 3, null, '09:00', at('2026-09-23T03:00:00Z')))).toBe(
      '2026-09-23T03:30:00.000Z',
    );
  });
  it('runs a week later when today is the weekday and the time has passed', () => {
    expect(iso(computeNextRun('weekly', 3, null, '09:00', at('2026-09-23T04:00:00Z')))).toBe(
      '2026-09-30T03:30:00.000Z',
    );
  });
  it('Sunday (0) and Saturday (6) both work across a month end', () => {
    expect(iso(computeNextRun('weekly', 0, null, '18:00', at('2026-09-29T00:00:00Z')))).toBe(
      '2026-10-04T12:30:00.000Z',
    );
    expect(iso(computeNextRun('weekly', 6, null, '07:30', at('2026-09-29T00:00:00Z')))).toBe(
      '2026-10-03T02:00:00.000Z',
    );
  });
  it('refuses a missing or impossible weekday', () => {
    expect(computeNextRun('weekly', null, null, '09:00', at('2026-09-23T00:00:00Z'))).toBeNull();
    expect(computeNextRun('weekly', 7, null, '09:00', at('2026-09-23T00:00:00Z'))).toBeNull();
  });
});

describe('monthly', () => {
  it('runs on the chosen date this month when it is still ahead', () => {
    expect(iso(computeNextRun('monthly', null, 25, '09:00', at('2026-09-23T00:00:00Z')))).toBe(
      '2026-09-25T03:30:00.000Z',
    );
  });
  it('runs next month when the date has passed', () => {
    expect(iso(computeNextRun('monthly', null, 5, '09:00', at('2026-09-23T00:00:00Z')))).toBe(
      '2026-10-05T03:30:00.000Z',
    );
  });
  it('the 31st runs on 30 September (a 30-day month)', () => {
    expect(iso(computeNextRun('monthly', null, 31, '09:00', at('2026-09-23T00:00:00Z')))).toBe(
      '2026-09-30T03:30:00.000Z',
    );
  });
  it('the 31st runs on 28 February in a common year, then 31 March', () => {
    expect(iso(computeNextRun('monthly', null, 31, '09:00', at('2026-02-01T00:00:00Z')))).toBe(
      '2026-02-28T03:30:00.000Z',
    );
    expect(iso(computeNextRun('monthly', null, 31, '09:00', at('2026-02-28T04:00:00Z')))).toBe(
      '2026-03-31T03:30:00.000Z',
    );
  });
  it('the 30th runs on 29 February in a leap year', () => {
    expect(iso(computeNextRun('monthly', null, 30, '09:00', at('2028-02-10T00:00:00Z')))).toBe(
      '2028-02-29T03:30:00.000Z',
    );
  });
  it('rolls over the year end', () => {
    // 23:30 IST on 31 Dec = 18:00Z; asked after it → 31 Jan
    expect(iso(computeNextRun('monthly', null, 31, '23:30', at('2026-12-31T18:30:00Z')))).toBe(
      '2027-01-31T18:00:00.000Z',
    );
  });
  it('the 1st at 00:00 IST is the previous UTC evening', () => {
    expect(iso(computeNextRun('monthly', null, 1, '00:00', at('2026-09-23T00:00:00Z')))).toBe(
      '2026-09-30T18:30:00.000Z',
    );
  });
  it('refuses a missing or impossible date', () => {
    expect(computeNextRun('monthly', null, null, '09:00', at('2026-09-23T00:00:00Z'))).toBeNull();
    expect(computeNextRun('monthly', null, 32, '09:00', at('2026-09-23T00:00:00Z'))).toBeNull();
    expect(computeNextRun('monthly', null, 0, '09:00', at('2026-09-23T00:00:00Z'))).toBeNull();
  });
});

describe('time and wording', () => {
  it('parses HH:MM and HH:MM:SS (the database returns seconds)', () => {
    expect(parseTimeIst('09:00')).toBe(540);
    expect(parseTimeIst('23:30:00')).toBe(1410);
    expect(parseTimeIst('24:00')).toBeNull();
    expect(parseTimeIst('9am')).toBeNull();
  });
  it('formats times for people', () => {
    expect(formatTimeIst('00:00')).toBe('12:00 am');
    expect(formatTimeIst('09:30:00')).toBe('9:30 am');
    expect(formatTimeIst('12:00')).toBe('12:00 pm');
    expect(formatTimeIst('18:00')).toBe('6:00 pm');
  });
  it('describes each cadence in plain English', () => {
    expect(describeSchedule({ cadence: 'daily', weekday: null, day_of_month: null, time_ist: '09:00' })).toBe(
      'every day at 9:00 am (IST)',
    );
    expect(describeSchedule({ cadence: 'weekly', weekday: 1, day_of_month: null, time_ist: '09:00:00' })).toBe(
      'every Monday at 9:00 am (IST)',
    );
    expect(describeSchedule({ cadence: 'monthly', weekday: null, day_of_month: 31, time_ist: '09:00' })).toBe(
      'every month on the 31st (or the last day of a shorter month) at 9:00 am (IST)',
    );
    expect(describeSchedule({ cadence: 'monthly', weekday: null, day_of_month: 2, time_ist: '09:00' })).toBe(
      'every month on the 2nd at 9:00 am (IST)',
    );
  });
});
