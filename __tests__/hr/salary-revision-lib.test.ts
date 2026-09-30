/**
 * Salary revisions — the plain-words rules (lib/hr/salary-revision.ts) and the
 * register's month end (salary-register-service.ts).
 *
 *   ruling 7   a PAY CUT is marked, and the Director's own figure decides once given
 *   ruling 9   asking for oneself / for a senior is flagged
 *   ruling 6   "Above the band by ₹X" from #4103's checker — and nothing when inside
 *   ruling 13  a reason is required before sending
 *   ruling 4   the register reads the pay in force on the LAST day of its month
 *
 * Run: npx vitest run __tests__/hr/salary-revision-lib.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  bandWarning,
  changeText,
  checkAsk,
  decisionSummary,
  flagsFor,
  STATUS_LABELS,
  isOpen,
  longDate,
  toAmount,
} from '@/lib/hr/salary-revision';
import { registerMonthEnd, SALARIES_IN_FORCE_RPC } from '@/lib/services/hr/payroll/salary-register-service';

const base = { is_cut: false, final_is_cut: null, final_monthly_gross: null, is_self: false, is_for_senior: false };

describe('flags (rulings 7 and 9)', () => {
  it('marks a cut that was asked for', () => {
    expect(flagsFor({ ...base, is_cut: true }).map((f) => f.kind)).toEqual(['cut']);
  });
  it('once the Director gives a figure, HIS figure decides whether it is a cut', () => {
    // Asked as a raise, he approved it lower than the pay now: a cut.
    expect(flagsFor({ ...base, is_cut: false, final_monthly_gross: '30000', final_is_cut: true })
      .map((f) => f.kind)).toEqual(['cut']);
    // Asked as a cut, he approved it as a raise: not a cut.
    expect(flagsFor({ ...base, is_cut: true, final_monthly_gross: 60000, final_is_cut: false })).toEqual([]);
  });
  it('flags asking for oneself and for a senior, with the cut first', () => {
    expect(flagsFor({ ...base, is_cut: true, is_self: true, is_for_senior: true }).map((f) => f.label))
      .toEqual(['PAY CUT', 'Asking for self', 'Asking for a senior']);
  });
});

describe('band warning (ruling 6)', () => {
  const band = {
    rungs: [
      { designation: 'Office Assistant', qualification: null, basicPay: 40000 },
      { designation: 'Office Assistant', qualification: null, basicPay: 50000 },
    ],
    guaranteedMinimum: null,
  };
  it('says how far above the band maximum the figure is', () => {
    expect(bandWarning('Office Assistant', 56500, band)).toBe('Above the band by ₹6,500');
  });
  it('says nothing inside the band, at the maximum, below it, or when the band is unknown', () => {
    expect(bandWarning('Office Assistant', 45000, band)).toBeNull();
    expect(bandWarning('Office Assistant', 50000, band)).toBeNull();
    expect(bandWarning('Office Assistant', 30000, band)).toBeNull();
    expect(bandWarning('Typist', 90000, band)).toBeNull();
    expect(bandWarning('Office Assistant', 90000, null)).toBeNull();
    expect(bandWarning('Office Assistant', null, band)).toBeNull();
  });
});

describe('the ask form (ruling 13)', () => {
  it('refuses a blank reason', () => {
    expect(checkAsk({ figure: '52000', reason: '   ', currentPay: 48000 }).reason)
      .toMatch(/Write a reason/);
  });
  it('refuses a missing, zero or same-as-now figure', () => {
    expect(checkAsk({ figure: '', reason: 'x', currentPay: 48000 }).figure).toMatch(/new monthly pay/);
    expect(checkAsk({ figure: '0', reason: 'x', currentPay: 48000 }).figure).toMatch(/new monthly pay/);
    expect(checkAsk({ figure: '48,000', reason: 'x', currentPay: 48000 }).figure).toMatch(/same as the pay now/);
  });
  it('accepts a cut (ruling 7) and rupee formatting', () => {
    expect(checkAsk({ figure: '₹30,000', reason: 'Half-time now', currentPay: 48000 })).toEqual({});
  });
});

describe('words on screen', () => {
  it('shows the change and calls a cut a cut', () => {
    expect(changeText(48000, 52000)).toBe('+₹4,000 (8.3%)');
    expect(changeText(48000, 30000)).toBe('−₹18,000 (38%) — a pay cut');
    expect(changeText(null, 30000)).toBe('—');
  });
  it('treats approved (not yet in the pay) as still open (ruling 10)', () => {
    expect(isOpen('approved')).toBe(true);
    expect(isOpen('applied')).toBe(false);
    expect(isOpen('cancelled')).toBe(false);
  });

  it('30 Sep: a principal who is also the head of department is flagged; a cancelled raise has its own label', () => {
    expect(flagsFor({ ...base, asker_is_also_hod: true }).map((f) => f.kind)).toEqual(['also_hod']);
    expect(flagsFor({ ...base, asker_is_also_hod: false })).toEqual([]);
    expect(STATUS_LABELS.cancelled).toContain('left');
    expect(isOpen('refused')).toBe(false);
  });
  it('names the Director’s figure when he changed it (ruling 12)', () => {
    expect(decisionSummary({ status: 'approved', final_monthly_gross: '52500.00', asked_monthly_gross: '50000.00', starts_on: '2026-10-01' }))
      .toBe('Approved at ₹52,500 a month from 1 October 2026 (asked: ₹50,000).');
    expect(decisionSummary({ status: 'applied', final_monthly_gross: 50000, asked_monthly_gross: 50000, starts_on: '2026-10-01' }))
      .toBe('Approved at ₹50,000 a month from 1 October 2026. It is now in the pay.');
  });
  it('reads numeric strings and refuses junk', () => {
    expect(toAmount('52500.00')).toBe(52500);
    expect(toAmount('abc')).toBeNull();
    expect(longDate('2027-01-01')).toBe('1 January 2027');
  });
});

describe('the register reads the pay in force on the last day of its month', () => {
  it('knows month lengths, leap years and December', () => {
    expect(registerMonthEnd(2026, 9)).toBe('2026-09-30');
    expect(registerMonthEnd(2026, 10)).toBe('2026-10-31');
    expect(registerMonthEnd(2028, 2)).toBe('2028-02-29');
    expect(registerMonthEnd(2027, 2)).toBe('2027-02-28');
    expect(registerMonthEnd(2026, 12)).toBe('2026-12-31');
  });
  it('names the in-force function the migration creates', () => {
    expect(SALARIES_IN_FORCE_RPC).toBe('hr_staff_salaries_in_force');
  });
});
