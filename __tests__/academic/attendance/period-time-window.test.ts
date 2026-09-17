import { describe, it, expect } from 'vitest';
import {
  parsePeriodTimeToMinutes,
  periodStartInstant,
  isPeriodNotStarted,
  getPeriodTimeStatus,
  formatPeriodTime,
  MARK_GRACE_MINUTES
} from '@/lib/utils/academic/period-time-window';

describe('parsePeriodTimeToMinutes', () => {
  it('parses the 24h form stored on the periods table', () => {
    expect(parsePeriodTimeToMinutes('15:45:00')).toBe(15 * 60 + 45);
    expect(parsePeriodTimeToMinutes('09:15:00')).toBe(9 * 60 + 15);
    expect(parsePeriodTimeToMinutes('15:45')).toBe(15 * 60 + 45);
  });

  // Both formats coexist inside a single attendance_data record in prod
  // (record 65ffd95f holds "16:30:00" on one slot and "2:45 PM" on another),
  // so a guard that reads only one of them is half a guard.
  it('parses the 12h form that display code persisted', () => {
    expect(parsePeriodTimeToMinutes('2:45 PM')).toBe(14 * 60 + 45);
    expect(parsePeriodTimeToMinutes('10:45 AM')).toBe(10 * 60 + 45);
    expect(parsePeriodTimeToMinutes('12:00 AM')).toBe(0);
    expect(parsePeriodTimeToMinutes('12:30 PM')).toBe(12 * 60 + 30);
    expect(parsePeriodTimeToMinutes('2:45PM')).toBe(14 * 60 + 45);
  });

  it('returns null rather than a wrong number for junk', () => {
    expect(parsePeriodTimeToMinutes('')).toBeNull();
    expect(parsePeriodTimeToMinutes(null)).toBeNull();
    expect(parsePeriodTimeToMinutes(undefined)).toBeNull();
    expect(parsePeriodTimeToMinutes('not a time')).toBeNull();
    expect(parsePeriodTimeToMinutes('25:00:00')).toBeNull();
    expect(parsePeriodTimeToMinutes('10:75')).toBeNull();
    expect(parsePeriodTimeToMinutes('13:00 PM')).toBeNull();
  });
});

describe('periodStartInstant', () => {
  it('anchors the time in IST, not the runtime timezone', () => {
    // 15:45 IST on 2026-09-16 is 10:15 UTC.
    expect(periodStartInstant('2026-09-16', '15:45:00')?.toISOString()).toBe(
      '2026-09-16T10:15:00.000Z'
    );
  });

  it('handles an early-morning period that lands on the previous UTC day', () => {
    // 05:00 IST is 23:30 UTC the day before.
    expect(periodStartInstant('2026-09-16', '05:00:00')?.toISOString()).toBe(
      '2026-09-15T23:30:00.000Z'
    );
  });

  it('returns null for an unusable date or time', () => {
    expect(periodStartInstant('', '15:45:00')).toBeNull();
    expect(periodStartInstant('16-09-2026', '15:45:00')).toBeNull();
    expect(periodStartInstant('2026-09-16', 'nonsense')).toBeNull();
  });
});

describe('isPeriodNotStarted — the BUG-006133 scenario', () => {
  // Reproduction of the reported incident, with the real production values:
  // student_attendance 65ffd95f, slot 04f71bf6 = CET P8, Wednesday 15:45–16:30
  // IST, written at 2026-09-16T07:39:52Z (13:09 IST) by the assigned faculty.
  const ATTENDANCE_DATE = '2026-09-16';
  const P8_START = '15:45:00';
  const ACTUAL_MARK_TIME = new Date('2026-09-16T07:39:52.259Z');

  it('rejects the write that actually happened', () => {
    expect(isPeriodNotStarted(ATTENDANCE_DATE, P8_START, ACTUAL_MARK_TIME)).toBe(true);
  });

  it('allows marking once the period has begun', () => {
    const duringClass = new Date('2026-09-16T10:20:00.000Z'); // 15:50 IST
    expect(isPeriodNotStarted(ATTENDANCE_DATE, P8_START, duringClass)).toBe(false);
  });

  it('allows marking inside the grace window just before the bell', () => {
    // 15:42 IST — three minutes early, inside the five-minute grace.
    const justBefore = new Date('2026-09-16T10:12:00.000Z');
    expect(isPeriodNotStarted(ATTENDANCE_DATE, P8_START, justBefore)).toBe(false);
  });

  it('rejects one minute outside the grace window', () => {
    // 15:39 IST — six minutes early.
    const tooEarly = new Date('2026-09-16T10:09:00.000Z');
    expect(isPeriodNotStarted(ATTENDANCE_DATE, P8_START, tooEarly)).toBe(true);
  });

  it('still allows late marking hours after the class ended', () => {
    const nextMorning = new Date('2026-09-17T04:00:00.000Z');
    expect(isPeriodNotStarted(ATTENDANCE_DATE, P8_START, nextMorning)).toBe(false);
  });

  it('rejects a period on a future date even at a past-looking hour', () => {
    const now = new Date('2026-09-16T10:20:00.000Z'); // 15:50 IST on the 16th
    expect(isPeriodNotStarted('2026-09-17', '09:15:00', now)).toBe(true);
  });

  it('fails open on unparseable data instead of blocking a real class', () => {
    expect(isPeriodNotStarted(ATTENDANCE_DATE, '', ACTUAL_MARK_TIME)).toBe(false);
    expect(isPeriodNotStarted(ATTENDANCE_DATE, undefined, ACTUAL_MARK_TIME)).toBe(false);
  });

  it('applies the same rule to the 12h stored format', () => {
    // 2:45 PM period, evaluated at 10:03 IST — the format the sibling slot uses.
    const morning = new Date('2026-09-16T04:33:00.000Z');
    expect(isPeriodNotStarted(ATTENDANCE_DATE, '2:45 PM', morning)).toBe(true);
  });

  it('exposes a grace constant the service and UI can share', () => {
    expect(MARK_GRACE_MINUTES).toBe(5);
  });
});

describe('getPeriodTimeStatus', () => {
  const DATE = '2026-09-16';

  it('reports upcoming before the period opens', () => {
    const at1309 = new Date('2026-09-16T07:39:52.259Z');
    expect(getPeriodTimeStatus(DATE, '15:45:00', '16:30:00', at1309)).toBe('upcoming');
  });

  it('reports current while the period runs', () => {
    const at1550 = new Date('2026-09-16T10:20:00.000Z');
    expect(getPeriodTimeStatus(DATE, '15:45:00', '16:30:00', at1550)).toBe('current');
  });

  it('reports past after the period ends', () => {
    const at1700 = new Date('2026-09-16T11:30:00.000Z');
    expect(getPeriodTimeStatus(DATE, '15:45:00', '16:30:00', at1700)).toBe('past');
  });

  it('never reports upcoming when the time cannot be read', () => {
    const at1309 = new Date('2026-09-16T07:39:52.259Z');
    expect(getPeriodTimeStatus(DATE, 'junk', 'junk', at1309)).toBe('current');
  });
});

describe('formatPeriodTime', () => {
  it('renders both stored formats the same human way', () => {
    expect(formatPeriodTime('15:45:00')).toBe('3:45 PM');
    expect(formatPeriodTime('2:45 PM')).toBe('2:45 PM');
    expect(formatPeriodTime('09:15:00')).toBe('9:15 AM');
    expect(formatPeriodTime('00:30:00')).toBe('12:30 AM');
    expect(formatPeriodTime('12:00:00')).toBe('12:00 PM');
  });

  it('returns an empty string for junk so callers can omit it', () => {
    expect(formatPeriodTime('junk')).toBe('');
    expect(formatPeriodTime(null)).toBe('');
  });
});
