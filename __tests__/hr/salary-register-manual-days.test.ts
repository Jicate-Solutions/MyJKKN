/**
 * Days entered by hand for staff with no biometric record (2026-10-07).
 *
 * The contract: a hand-entered row is paid by EXACTLY the register's formula
 * (computeRegisterLine) — manualSummary only builds the summary that formula
 * reads — so the days typed come back unchanged, the register identities hold,
 * and LOP costs the same as it does on a biometric row. And a biometric summary
 * always wins over an entry (resolveManualPay).
 *
 * Run: npx vitest run __tests__/hr/salary-register-manual-days.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  computeRegisterLine,
  manualSummary,
  resolveManualPay,
  validateManualDays,
} from '@/lib/services/hr/payroll/salary-register-service';
import { remarksFor } from '@/lib/services/hr/payroll/salary-register-workbook';
import type { ManualDaysInput } from '@/types/hr-payroll';

const days = (o: Partial<ManualDaysInput> = {}): ManualDaysInput => ({
  business_working_days: 23,
  casual_leave_days: 1,
  comp_off_days: 1,
  other_paid_leave_days: 0.5,
  on_duty_days: 2,
  unpaid_leave_days: 1.5,
  ...o,
});

function compute(d: ManualDaysInput, extra: { epf?: number; esi?: number; tds?: number; allowance?: number } = {}) {
  return computeRegisterLine({
    monthlyGross: 35000,
    workingDaysBasis: d.business_working_days,
    epfAmount: extra.epf ?? 0,
    esiAmount: extra.esi ?? 0,
    tdsAmount: extra.tds ?? 0,
    allowance: extra.allowance ?? 0,
    summary: manualSummary(d),
  });
}

describe('manualSummary -> computeRegisterLine', () => {
  it('hands back exactly the days that were typed', () => {
    const f = compute(days());
    expect(f.business_working_days).toBe(23);
    expect(f.casual_leave_days).toBe(1);
    expect(f.comp_off_days).toBe(1);
    expect(f.other_paid_leave_days).toBe(0.5);
    expect(f.on_duty_days).toBe(2);
    expect(f.unpaid_leave_days).toBe(1.5);
    // Derived: 23 − 1 − 1 − 0.5 − 2 − 1.5
    expect(f.worked_days).toBe(17);
  });

  it('keeps the four register identities', () => {
    const f = compute(days());
    expect(f.paid_days).toBe(f.business_working_days - f.unpaid_leave_days);
    expect(f.paid_days).toBe(f.worked_days + f.paid_leave_days + f.on_duty_days);
    expect(f.worked_days).toBe(
      f.business_working_days - f.paid_leave_days - f.unpaid_leave_days - f.on_duty_days,
    );
    expect(f.paid_leave_days).toBe(f.casual_leave_days + f.comp_off_days + f.other_paid_leave_days);
  });

  it('deducts LOP at the day rate, exactly like a biometric row', () => {
    const f = compute(days({ casual_leave_days: 0, comp_off_days: 0, other_paid_leave_days: 0, on_duty_days: 0, unpaid_leave_days: 2 }));
    expect(f.unpaid_leave_deduction).toBe(Math.round((35000 / 23) * 2 * 100) / 100);
    expect(f.net_pay).toBe(Math.round(35000 - (35000 / 23) * 2));
  });

  it('a full month with no leave pays the full gross', () => {
    const f = compute(days({ casual_leave_days: 0, comp_off_days: 0, other_paid_leave_days: 0, on_duty_days: 0, unpaid_leave_days: 0 }));
    expect(f.paid_days).toBe(23);
    expect(f.worked_days).toBe(23);
    expect(f.net_pay).toBe(35000);
  });

  it('still applies EPF / ESI / TDS, capped so net never goes negative', () => {
    const f = compute(days({ casual_leave_days: 0, comp_off_days: 0, other_paid_leave_days: 0, on_duty_days: 0, unpaid_leave_days: 0 }), {
      epf: 1800, esi: 0, tds: 500,
    });
    expect(f.epf_deduction).toBe(1800);
    expect(f.tds_deduction).toBe(500);
    expect(f.net_pay).toBe(35000 - 1800 - 500);

    const allLop = compute(days({ casual_leave_days: 0, comp_off_days: 0, other_paid_leave_days: 0, on_duty_days: 0, unpaid_leave_days: 23 }), {
      epf: 1800, tds: 500,
    });
    expect(allLop.paid_days).toBe(0);
    expect(allLop.epf_deduction).toBe(0);
    expect(allLop.net_pay).toBe(0);
  });
});

describe('validateManualDays', () => {
  it('accepts a sensible month', () => {
    expect(validateManualDays(days())).toEqual([]);
  });

  it('rejects negatives, quarter-days, and an impossible month', () => {
    expect(validateManualDays(days({ casual_leave_days: -1 })).join()).toMatch(/Casual leave cannot be negative/);
    expect(validateManualDays(days({ on_duty_days: 0.25 })).join()).toMatch(/On duty must be in whole or half days/);
    expect(validateManualDays(days({ business_working_days: 0 })).join()).toMatch(/more than 0/);
    expect(validateManualDays(days({ business_working_days: 32 })).join()).toMatch(/at most 31/);
  });

  it('rejects leave + on duty + LOP above the working days', () => {
    expect(
      validateManualDays(days({ business_working_days: 5, casual_leave_days: 3, unpaid_leave_days: 3, comp_off_days: 0, other_paid_leave_days: 0, on_duty_days: 0 })).join(),
    ).toMatch(/add up to 6, more than the 5 working days/);
  });
});

describe('resolveManualPay — biometric always wins', () => {
  it('ignores an entry when the person has an attendance summary', () => {
    expect(resolveManualPay({ hasSummary: true, recordedGross: 30000, manual: { monthly_gross: null } }).use).toBe(false);
  });

  it('uses the recorded salary over the entry’s own gross', () => {
    expect(resolveManualPay({ hasSummary: false, recordedGross: 30000, manual: { monthly_gross: 99999 } })).toEqual({
      use: true, gross: 30000, grossFromEntry: false,
    });
  });

  it('falls back to the entry’s gross only when no salary is recorded', () => {
    expect(resolveManualPay({ hasSummary: false, recordedGross: undefined, manual: { monthly_gross: 18000 } })).toEqual({
      use: true, gross: 18000, grossFromEntry: true,
    });
    expect(resolveManualPay({ hasSummary: false, recordedGross: 0, manual: { monthly_gross: null } }).use).toBe(false);
  });

  it('does nothing without an entry', () => {
    expect(resolveManualPay({ hasSummary: false, recordedGross: 30000, manual: undefined }).use).toBe(false);
  });
});

describe('workbook Remarks for a hand-entered row', () => {
  it('leads with the manual note, then the row’s own remark', () => {
    expect(remarksFor({ entry_source: 'manual', manual_reason: 'No biometric device', remarks: null })).toBe(
      'Manual entry: No biometric device',
    );
    expect(remarksFor({ entry_source: 'manual', manual_reason: 'No device', remarks: 'May recovery' })).toBe(
      'Manual entry: No device; May recovery',
    );
    expect(remarksFor({ entry_source: 'biometric', manual_reason: null, remarks: 'x' })).toBe('x');
  });
});
