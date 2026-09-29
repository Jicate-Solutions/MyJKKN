/**
 * The attendance page's month cards — the figures payroll reads off it.
 *
 * THE RULE (HR, 2026-09-22): Business Working Days = calendar days − week-offs
 * − holidays, and Total Paid = present + paid leave (every paid type, on duty
 * and comp-off included) + half a day per half day. Holidays are neither
 * counted nor paid — the same unit the salary register divides by, so the two
 * screens print the same numbers for the same person. Pharmacy August 2026,
 * DR. SEKAR V: 31 − 5 − 3 = 23 business days, 21 present + CL 1 + OD 1 = 23 paid.
 *
 * Run: npx vitest run __tests__/hr/attendance-month-summary.test.ts
 */

import { describe, expect, it } from 'vitest';
import { summariseDays, type AttendanceDay, type DayRequest } from '@/types/hr-attendance';

function leave(code: string, name: string, category: DayRequest['category'] = 'leave'): DayRequest {
  return {
    id: `${code}-1`,
    category,
    type_name: name,
    type_code: code,
    start_time: null,
    end_time: null,
    multi_day: false,
    decision: 'approved',
  } as DayRequest;
}

function day(token: string, o: Partial<AttendanceDay> = {}): AttendanceDay {
  return {
    date: '2026-08-01',
    token,
    inMonth: true,
    isFuture: false,
    effectiveMinutes: 0,
    requests: [],
    ...o,
  } as unknown as AttendanceDay;
}

function repeat(n: number, token: string, o: Partial<AttendanceDay> = {}): AttendanceDay[] {
  return Array.from({ length: n }, () => day(token, o));
}

describe('summariseDays — business working days exclude week-offs AND holidays', () => {
  const sekarAugust = [
    ...repeat(21, 'PRESENT'),
    ...repeat(5, 'WEEKLY_OFF'),
    ...repeat(3, 'HOLIDAY'),
    day('LEAVE', { requests: [leave('CL', 'Casual Leave')] }),
    day('LEAVE', { requests: [leave('OD', 'On-Duty Leave')] }),
  ];

  it('reads DR. SEKAR V, Pharmacy August 2026 as 23 business days, 23 paid', () => {
    const s = summariseDays(sekarAugust);
    expect(s.workingDays).toBe(23);
    expect(s.holiday).toBe(3);
    expect(s.weeklyOff).toBe(5);
    expect(s.paidLeaveTotal).toBe(2);
    expect(s.totalPaid).toBe(23);
    expect(s.lop).toBe(0);
  });

  it('keeps the identity paid + lop + pending = business working days', () => {
    const days = [
      ...repeat(18, 'PRESENT'),
      ...repeat(2, 'ABSENT'),
      day('HALF_DAY'),
      ...repeat(5, 'WEEKLY_OFF'),
      ...repeat(3, 'HOLIDAY'),
      day('LEAVE', { requests: [leave('CL', 'Casual Leave')] }),
      day('AEYP'),
    ];
    const s = summariseDays(days);
    expect(s.workingDays).toBe(23);
    expect(s.totalPaid).toBe(19.5);
    expect(s.lop).toBe(2.5);
    expect(s.pending).toBe(1);
    expect(s.totalPaid + s.lop + s.pending).toBe(s.workingDays);
  });
});

describe('summariseDays — every paid leave type counts, by its own code', () => {
  it('buckets institution-specific types alongside CL and OD', () => {
    const s = summariseDays([
      day('LEAVE', { requests: [leave('CL', 'Casual Leave')] }),
      day('LEAVE', { requests: [leave('PHD', 'PH.D')] }),
      day('LEAVE', { requests: [leave('WFH', 'Work From Home')] }),
      day('ON_DUTY', { requests: [leave('OD', 'On-Duty Leave')] }),
      day('LEAVE', { requests: [leave('COMP_OFF', 'Compensatory Off', 'compensatory_off')] }),
    ]);
    expect(s.paidLeaveTotal).toBe(5);
    expect(s.totalPaid).toBe(5);
    expect(s.paidLeaveByType.map((b) => b.code).sort()).toEqual(
      ['CL', 'COMP_OFF', 'OD', 'PHD', 'WFH'],
    );
  });

  it('names a day the status set directly, rather than dropping it', () => {
    const s = summariseDays([day('ON_DUTY'), day('LEAVE')]);
    expect(s.paidLeaveByType.map((b) => b.code).sort()).toEqual(['L', 'OD']);
    expect(s.totalPaid).toBe(2);
  });
});
