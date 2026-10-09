/**
 * Salary start dates (2026-09-30).
 *
 * The database refuses a salary change that starts before today in India, and
 * the Director ruled that a raise entered late starts from the 1st of next
 * month. These are the dates every salary form uses, and the plan the staff
 * form follows so an unchanged old start date is not re-sent.
 */
import { describe, it, expect } from 'vitest';

import {
  firstOfNextMonthIST,
  isBeforeTodayIST,
  salaryDialogStart,
  todayIST,
} from '@/lib/hr/payroll/salary-start-date';
import {
  emptyOfficeValues,
  isDateOnlySalaryChange,
  salaryWritePlan,
  type OfficeSalaryValues,
} from '@/lib/hr/payroll/staff-office';

// 30 Sep 2026, 11:30 in India.
const MIDDAY = new Date('2026-09-30T06:00:00Z');
// 1 Oct 2026, 00:30 in India, but still 30 Sep in UTC.
const JUST_AFTER_MIDNIGHT_IST = new Date('2026-09-30T19:00:00Z');
// 31 Dec 2026, 18:00 in India.
const NEW_YEARS_EVE = new Date('2026-12-31T12:30:00Z');

describe('salary start dates, India time', () => {
  it('today is the India date, not the UTC date', () => {
    expect(todayIST(MIDDAY)).toBe('2026-09-30');
    expect(todayIST(JUST_AFTER_MIDNIGHT_IST)).toBe('2026-10-01');
  });

  it('the 1st of next month rolls over the year', () => {
    expect(firstOfNextMonthIST(MIDDAY)).toBe('2026-10-01');
    expect(firstOfNextMonthIST(JUST_AFTER_MIDNIGHT_IST)).toBe('2026-11-01');
    expect(firstOfNextMonthIST(NEW_YEARS_EVE)).toBe('2027-01-01');
  });

  it('today is not in the past; yesterday is; blank is not', () => {
    expect(isBeforeTodayIST('2026-09-30', MIDDAY)).toBe(false);
    expect(isBeforeTodayIST('2026-09-29', MIDDAY)).toBe(true);
    expect(isBeforeTodayIST('2026-09-30', JUST_AFTER_MIDNIGHT_IST)).toBe(true);
    expect(isBeforeTodayIST('', MIDDAY)).toBe(false);
  });
});

function salary(over: Partial<OfficeSalaryValues> = {}): OfficeSalaryValues {
  return { ...emptyOfficeValues().salary, monthly_gross: '7000', effective_from: '2026-09-01', ...over };
}

describe('team member form: which date the salary is sent with', () => {
  it('an edit that changes nothing in the salary (and not the payer) writes nothing', () => {
    const initial = salary();
    expect(salaryWritePlan(salary(), initial, false, MIDDAY)).toEqual({
      send: false,
      effectiveFrom: '2026-09-01',
    });
  });

  it('a notes-only edit with the old past date left as it was starts on the 1st of next month', () => {
    const initial = salary();
    expect(salaryWritePlan(salary({ notes: 'NOT240' }), initial, false, MIDDAY)).toEqual({
      send: true,
      effectiveFrom: '2026-10-01',
    });
  });

  it('a change of payer with the salary untouched is sent from the 1st of next month', () => {
    const initial = salary();
    expect(salaryWritePlan(salary(), initial, true, MIDDAY)).toEqual({
      send: true,
      effectiveFrom: '2026-10-01',
    });
  });

  it('a pay change keeps a start date the user typed', () => {
    const initial = salary();
    expect(
      salaryWritePlan(salary({ monthly_gross: '8000', effective_from: '2026-10-15' }), initial, false, MIDDAY)
    ).toEqual({ send: true, effectiveFrom: '2026-10-15' });
  });

  it('a start date the user typed is sent as typed even if past (the database refuses it, not a silent move)', () => {
    const initial = salary();
    expect(
      salaryWritePlan(salary({ monthly_gross: '8000', effective_from: '2026-09-15' }), initial, false, MIDDAY)
    ).toEqual({ send: true, effectiveFrom: '2026-09-15' });
  });

  it('an untouched FUTURE start is kept', () => {
    const initial = salary({ effective_from: '2026-11-01' });
    expect(
      salaryWritePlan(salary({ effective_from: '2026-11-01', monthly_gross: '9000' }), initial, false, MIDDAY)
    ).toEqual({ send: true, effectiveFrom: '2026-11-01' });
  });

  it('an untouched start of TODAY is kept (today is allowed)', () => {
    const initial = salary({ effective_from: '2026-09-30' });
    expect(
      salaryWritePlan(salary({ effective_from: '2026-09-30', monthly_gross: '9000' }), initial, false, MIDDAY)
    ).toEqual({ send: true, effectiveFrom: '2026-09-30' });
  });

  it('a row with no start recorded, edited, starts on the 1st of next month', () => {
    const initial = salary({ effective_from: '' });
    expect(
      salaryWritePlan(salary({ effective_from: '', monthly_gross: '9000' }), initial, false, MIDDAY)
    ).toEqual({ send: true, effectiveFrom: '2026-10-01' });
  });

  it('a new team member (nothing on record): a past or blank date becomes the 1st of next month', () => {
    expect(salaryWritePlan(salary({ effective_from: '2026-09-10' }), null, false, MIDDAY)).toEqual({
      send: true,
      effectiveFrom: '2026-10-01',
    });
    expect(salaryWritePlan(salary({ effective_from: '' }), null, false, MIDDAY)).toEqual({
      send: true,
      effectiveFrom: '2026-10-01',
    });
    expect(salaryWritePlan(salary({ effective_from: '2026-10-05' }), null, false, MIDDAY)).toEqual({
      send: true,
      effectiveFrom: '2026-10-05',
    });
  });
});

describe('team member form: a change of the start date alone (2026-10-08 ruling)', () => {
  it('is not sent, whether the new date is today, later, or the old one was in the past', () => {
    const initial = salary();
    for (const d of ['2026-09-30', '2026-10-01', '2026-12-15']) {
      expect(salaryWritePlan(salary({ effective_from: d }), initial, false, MIDDAY)).toEqual({
        send: false,
        effectiveFrom: d,
      });
    }
  });

  it('a new date with any figure, flag or note changed is a change, sent from that date', () => {
    const initial = salary();
    for (const over of [
      { monthly_gross: '7100' },
      { eligible_for_pf: true },
      { allowance_amount: '500' },
      { notes: 'Revised' },
    ] as Array<Partial<OfficeSalaryValues>>) {
      expect(
        salaryWritePlan(salary({ ...over, effective_from: '2026-10-15' }), initial, false, MIDDAY)
      ).toEqual({ send: true, effectiveFrom: '2026-10-15' });
    }
  });

  it('a new date with a change of payer is sent (the payer is on the salary row)', () => {
    expect(salaryWritePlan(salary({ effective_from: '2026-10-15' }), salary(), true, MIDDAY)).toEqual({
      send: true,
      effectiveFrom: '2026-10-15',
    });
  });

  it('isDateOnlySalaryChange: only when the date differs and nothing else does', () => {
    expect(isDateOnlySalaryChange(salary({ effective_from: '2026-10-15' }), salary())).toBe(true);
    expect(isDateOnlySalaryChange(salary(), salary())).toBe(false);
    expect(isDateOnlySalaryChange(salary({ effective_from: '2026-10-15', monthly_gross: '8000' }), salary())).toBe(false);
    expect(isDateOnlySalaryChange(salary({ effective_from: '2026-10-15' }), null)).toBe(false);
  });
});

// Panel round 1 (2026-10-09): Employee Salaries' dialog must not pull a change
// already saved for later into another month.
describe('salaryDialogStart: the date the salary dialog opens on', () => {
  it('a raise saved for 1 Dec keeps 1 Dec (not 1 Nov)', () => {
    expect(salaryDialogStart('2026-12-01', MIDDAY)).toBe('2026-12-01');
  });
  it('a change saved for later this month keeps its own date', () => {
    expect(salaryDialogStart('2026-10-20', new Date('2026-10-09T06:00:00Z'))).toBe('2026-10-20');
  });
  it('a change starting today keeps today', () => {
    expect(salaryDialogStart('2026-09-30', MIDDAY)).toBe('2026-09-30');
  });
  it('a row that has started, has no start, or none at all: the 1st of next month', () => {
    expect(salaryDialogStart('2026-04-01', MIDDAY)).toBe('2026-10-01');
    expect(salaryDialogStart('2026-09-29', MIDDAY)).toBe('2026-10-01');
    expect(salaryDialogStart(null, MIDDAY)).toBe('2026-10-01');
    expect(salaryDialogStart('', MIDDAY)).toBe('2026-10-01');
  });
});
