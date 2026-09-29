/**
 * Payroll loss-of-pay — the arithmetic that decides how much of a month a
 * person is actually paid for.
 *
 * WHERE THE EXPECTED FIGURES COME FROM. The spec nine payroll files cite,
 * specs/t4-payroll-design-lock-2026-05-15.md, has never existed in this
 * repository, so there is no document to pin against. What does exist is the
 * shipped salary register, whose own figures are pinned to a hand-kept
 * spreadsheet to the paisa in __tests__/hr/salary-register-line.test.ts. The
 * "agrees with the shipped salary register" block below takes its six rows
 * straight from that file and requires this engine to reach the same rupee by a
 * different route — the register subtracts a day-rated deduction, this engine
 * multiplies by a paid-days factor. Two screens must not disagree about one
 * person's pay, and this is the test that would catch it if they started to.
 *
 * The end-to-end block drives the real PayslipGenerator against a stub
 * Supabase client, because the pure functions passing is not evidence that the
 * generator calls them: it is possible to have perfect arithmetic and a payroll
 * that never reads the attendance month.
 *
 * Run: npx vitest run __tests__/hr/payroll-lop.test.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyLop,
  capDeductionsToGross,
  computeLopDays,
  LOP_SKIP_REASONS,
} from '@/lib/hr/payroll/lop-engine';
import type { PayrollPolicies } from '@/lib/services/hr/payroll/deduction-engine';
import type { PayrollPeriodRow } from '@/lib/services/hr/payroll/payslip-generator';

// ============================================================================
// Policies — the statutory shapes the deduction engine expects.
// Representative of the seeded rows; the exact rates are not what is under test
// here, the RESPONSE of the tax to a smaller gross is.
// ============================================================================

const POLICIES: PayrollPolicies = {
  tds: {
    regime: 'new',
    fiscal_year: '2026-27',
    slabs: [
      { upto_inr: 400000, rate_pct: 0 },
      { upto_inr: 800000, rate_pct: 5 },
      { upto_inr: 1200000, rate_pct: 10 },
      { upto_inr: null, rate_pct: 30 },
    ],
    rebate_87a_threshold_inr: 1200000,
    rebate_87a_amount_inr: 60000,
    surcharge_thresholds: [],
    cess_pct: 4,
  },
  pf: { employee_pct: 12, employer_pct: 12, ceiling_inr: 15000, applies_above_ceiling: false },
  esi: { employee_pct: 0.75, employer_pct: 3.25, ceiling_inr: 21000, applies_above_ceiling: false },
  pt: {
    state: 'Tamil Nadu',
    frequency: 'monthly',
    slabs_monthly: [
      { upto_inr: 21000, amount_inr: 0 },
      { upto_inr: 30000, amount_inr: 135 },
      { upto_inr: null, amount_inr: 315 },
    ],
  },
  standardDeduction: {
    amount_inr: 75000,
    applies_to_regime: 'new',
    applies_to_old_regime_amount_inr: 50000,
    section: '16(ia)',
  },
};

// The generator loads policies through Supabase. Stub only the LOADER — the
// computation stays real, because the tax's reaction to a docked gross is one
// of the things being tested.
vi.mock('@/lib/services/hr/payroll/deduction-engine', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/services/hr/payroll/deduction-engine')
  >();
  return { ...actual, loadPayrollPolicies: vi.fn(async () => POLICIES) };
});

// Imported AFTER the mock declaration so the generator picks up the stub loader.
const { PayslipGenerator } = await import('@/lib/services/hr/payroll/payslip-generator');

// ============================================================================
// 1. Day counting
// ============================================================================

describe('computeLopDays', () => {
  it('pays for the whole month when nobody is absent', () => {
    const d = computeLopDays({ basis: 22, payableDays: 22 });
    expect(d.lopDays).toBe(0);
    expect(d.paidDays).toBe(22);
    expect(d.factor).toBe(1);
  });

  it('counts the days the month does not pay for', () => {
    const d = computeLopDays({ basis: 22, payableDays: 19 });
    expect(d.lopDays).toBe(3);
    expect(d.paidDays).toBe(19);
  });

  it('pays nothing when somebody is absent for the entire month', () => {
    const d = computeLopDays({ basis: 22, payableDays: 0 });
    expect(d.lopDays).toBe(22);
    expect(d.paidDays).toBe(0);
    expect(d.factor).toBe(0);
  });

  it('never pays for more than a full month, even when more days are credited', () => {
    // A six-day-week work location under a five-day-week payer.
    const d = computeLopDays({ basis: 22, payableDays: 26 });
    expect(d.paidDays).toBe(22);
    expect(d.lopDays).toBe(0);
    expect(d.factor).toBe(1);
  });

  it('keeps half days', () => {
    const d = computeLopDays({ basis: 22, payableDays: 20.5 });
    expect(d.lopDays).toBe(1.5);
  });

  it('returns a zero basis rather than dividing by it', () => {
    const d = computeLopDays({ basis: 0, payableDays: 0 });
    expect(d.basis).toBe(0);
    expect(d.factor).toBe(0);
  });
});

// ============================================================================
// 2. The rupee effect, pinned against the shipped salary register
// ============================================================================

describe('applyLop — agrees with the shipped salary register to the rupee', () => {
  // The six rows of __tests__/hr/salary-register-line.test.ts, which are
  // themselves rows of the hand-kept "Salary Register EDITED (1).xlsx".
  //   name, monthly gross, working days, payable days, register's net earnings
  const REGISTER_ROWS: Array<[string, number, number, number, number]> = [
    ['MANIKANDAN P', 15000, 22, 21, 14318],
    ['PRISKALA M', 15000, 22, 20, 13636],
    ['SHANTHINI B', 16000, 22, 16, 11636],
    ['POOJA S', 35000, 22, 17, 27045],
    ['HARINI E', 15000, 22, 17, 11591],
    ['POOMIGA G', 15000, 22, 19, 12955],
  ];

  it.each(REGISTER_ROWS)(
    '%s',
    (_name, gross, basis, payable, registerNetEarnings) => {
      const days = computeLopDays({ basis, payableDays: payable });
      const pay = applyLop({
        basicPay: gross,
        earnings: [{ component_id: 'c-basic', code: 'BASIC', amount: gross }],
        factor: days.factor,
      });

      // The register reaches the same figure the other way round: it computes a
      // day rate (gross / working days), multiplies by the unpaid days, and
      // subtracts. Both must land on the same rupee.
      const registerDayRate = gross / basis;
      const registerDeduction = registerDayRate * days.lopDays;
      expect(pay.lopAdjustedGross).toBe(Math.round(gross - registerDeduction));
      expect(pay.lopAdjustedGross).toBe(registerNetEarnings);
      expect(pay.lopAmount).toBe(gross - registerNetEarnings);
    },
  );
});

describe('applyLop', () => {
  const EARNINGS = [
    { component_id: 'c1', code: 'BASIC', amount: 20000 },
    { component_id: 'c2', code: 'DA', amount: 6000 },
    { component_id: 'c3', code: 'HRA', amount: 5000 },
  ];

  it('changes nothing when nobody is absent', () => {
    const pay = applyLop({ basicPay: 20000, earnings: EARNINGS, factor: 1 });
    expect(pay.lopAdjustedGross).toBe(31000);
    expect(pay.lopAdjustedBasic).toBe(20000);
    expect(pay.lopAmount).toBe(0);
  });

  it('cuts every earning, not just basic', () => {
    // 2 days unpaid out of 22 working days.
    const days = computeLopDays({ basis: 22, payableDays: 20 });
    const pay = applyLop({ basicPay: 20000, earnings: EARNINGS, factor: days.factor });

    expect(pay.adjustedEarnings.map((e) => e.amount)).toEqual([
      Math.round(20000 * (20 / 22)),
      Math.round(6000 * (20 / 22)),
      Math.round(5000 * (20 / 22)),
    ]);
    expect(pay.lopAdjustedBasic).toBe(Math.round(20000 * (20 / 22)));
  });

  it('pays nothing to somebody absent for the whole month', () => {
    const pay = applyLop({ basicPay: 20000, earnings: EARNINGS, factor: 0 });
    expect(pay.lopAdjustedGross).toBe(0);
    expect(pay.lopAdjustedBasic).toBe(0);
    expect(pay.lopAmount).toBe(31000);
  });

  it('the line items always add up to the gross', () => {
    for (const payable of [22, 21.5, 20, 17, 11, 0.5, 0]) {
      const days = computeLopDays({ basis: 22, payableDays: payable });
      const pay = applyLop({ basicPay: 20000, earnings: EARNINGS, factor: days.factor });
      const sum = pay.adjustedEarnings.reduce((t, e) => t + e.amount, 0);
      expect(sum).toBe(pay.lopAdjustedGross);
    }
  });

  it('THE DIVISOR IS THE WORKING DAYS, so the same absence costs more in a shorter month', () => {
    const twoDaysIn22 = applyLop({
      basicPay: 20000,
      earnings: EARNINGS,
      factor: computeLopDays({ basis: 22, payableDays: 20 }).factor,
    });
    const twoDaysIn26 = applyLop({
      basicPay: 20000,
      earnings: EARNINGS,
      factor: computeLopDays({ basis: 26, payableDays: 24 }).factor,
    });

    expect(twoDaysIn22.lopAmount).toBeGreaterThan(twoDaysIn26.lopAmount);
    // And each is exactly the day rate times the days, to the rupee.
    expect(twoDaysIn22.lopAmount).toBe(Math.round((31000 / 22) * 2));
    expect(twoDaysIn26.lopAmount).toBe(Math.round((31000 / 26) * 2));
  });
});

// ============================================================================
// 3. Nobody is ever paid a negative amount
// ============================================================================

describe('capDeductionsToGross', () => {
  it('leaves an ordinary month alone', () => {
    const c = capDeductionsToGross({ pf: 1800, esi: 0, tds: 900, pt: 135 }, 40000);
    expect(c.total).toBe(2835);
    expect(c.netPay).toBe(37165);
    expect(c.dropped).toBe(0);
  });

  it('never returns a negative net pay when the month earns nothing', () => {
    // Professional tax is a FLAT slab, so it survives a gross of zero unless capped.
    const c = capDeductionsToGross({ pf: 0, esi: 0, tds: 0, pt: 315 }, 0);
    expect(c.netPay).toBe(0);
    expect(c.total).toBe(0);
    expect(c.dropped).toBe(315);
  });

  it('drops the income tax first and protects the provident fund last', () => {
    const c = capDeductionsToGross({ pf: 1000, esi: 100, tds: 5000, pt: 200 }, 1200);
    expect(c.pf).toBe(1000);
    expect(c.esi).toBe(100);
    expect(c.pt).toBe(100);
    expect(c.tds).toBe(0);
    expect(c.netPay).toBe(0);
    expect(c.dropped).toBe(5100);
  });
});

// ============================================================================
// 4. End to end through the real generator, against a stub database
// ============================================================================

interface Fixture {
  period: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
  rpc?: Record<string, unknown>;
}

/**
 * A stub PostgREST builder: chainable, awaitable, and filter-blind.
 *
 * Filter-blind on purpose — the fixtures are small enough that returning the
 * whole table for a query is the same answer, and a stub that reimplemented
 * PostgREST's filtering would be a second thing that can be wrong.
 */
function stubSupabase(fx: Fixture) {
  const rpcDefaults: Record<string, unknown> = {
    user_has_permission: true,
    is_super_admin: false,
    auth_hr_organization_id: 'org-1',
    ...(fx.rpc ?? {}),
  };

  const resultFor = (table: string) => {
    if (table === 'hr_payroll_periods') return { data: fx.period, error: null, count: 1 };
    const rows = fx.tables[table] ?? [];
    return { data: rows, error: null, count: rows.length };
  };

  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'neq', 'not', 'limit', 'update']) {
      b[m] = () => b;
    }
    b.single = () => Promise.resolve(resultFor(table));
    b.maybeSingle = () => Promise.resolve(resultFor(table));
    b.then = (
      onOk: (v: unknown) => unknown,
      onErr?: (e: unknown) => unknown,
    ) => Promise.resolve(resultFor(table)).then(onOk, onErr);
    return b;
  };

  return {
    from: (table: string) => builder(table),
    // An rpc value may be a function of the call's arguments, so one test can
    // grant one permission and withhold another.
    rpc: (name: string, args?: Record<string, unknown>) => {
      const v = rpcDefaults[name];
      const data = typeof v === 'function' ? (v as (a?: unknown) => unknown)(args) : v;
      return Promise.resolve({ data: data ?? null, error: null });
    },
  } as unknown as Parameters<typeof PayslipGenerator.previewLop>[0] & {
    from: (table: string) => unknown;
  };
}

/** A period, a roster, pay scales and components — everything but attendance. */
function baseFixture(): Fixture {
  return {
    period: {
      id: 'period-1',
      hr_organization_id: 'org-1',
      institution_id: 'inst-1',
      engine_type: 'non_teaching',
      period_year: 2026,
      period_month: 8,
      status: 'prepared',
      working_days_count: 22,
      total_calendar_days: 31,
    },
    tables: {
      hr_staff_payroll: [{ staff_id: 'staff-present' }, { staff_id: 'staff-absent' }],
      staff: [
        {
          id: 'staff-present',
          first_name: 'Fully',
          last_name: 'Present',
          institution_id: 'inst-1',
        },
        {
          id: 'staff-absent',
          first_name: 'Three',
          last_name: 'Days Absent',
          institution_id: 'inst-1',
        },
      ],
      hr_staff_details: [
        { staff_id: 'staff-present', designation_id: 'desig-1', cadre_id: null },
        { staff_id: 'staff-absent', designation_id: 'desig-1', cadre_id: null },
      ],
      hr_pay_scales: [
        { id: 'scale-1', designation_id: 'desig-1', cadre_id: null, basic_pay: 95000, grade_pay: 0 },
      ],
      hr_pay_components: [
        {
          id: 'c-basic',
          code: 'BASIC',
          component_type: 'earning',
          calculation_basis: 'flat',
          default_amount_or_percent: 0,
          applies_to_engine_types: ['faculty', 'non_teaching'],
        },
        {
          id: 'c-da',
          code: 'DA',
          component_type: 'earning',
          calculation_basis: 'percent_of_basic',
          default_amount_or_percent: 30,
          applies_to_engine_types: ['faculty', 'non_teaching'],
        },
        {
          id: 'c-hra',
          code: 'HRA',
          component_type: 'earning',
          calculation_basis: 'percent_of_basic',
          default_amount_or_percent: 25,
          applies_to_engine_types: ['faculty', 'non_teaching'],
        },
      ],
      hr_attendance_periods: [
        {
          id: 'att-1',
          institution_id: 'inst-1',
          status: 'locked',
          working_days_count: 22,
        },
      ],
      hr_attendance_period_summaries: [
        {
          staff_id: 'staff-present',
          payable_days: 22,
          scheduled_days: 22,
          unprocessed_days: 0,
          present_days: 22,
          leave_days: 0,
          on_duty_days: 0,
          comp_off_days: 0,
        },
        {
          staff_id: 'staff-absent',
          payable_days: 19,
          scheduled_days: 22,
          unprocessed_days: 0,
          present_days: 19,
          leave_days: 0,
          on_duty_days: 0,
          comp_off_days: 0,
        },
      ],
    },
  };
}

const FULL_GROSS = 95000 + Math.round((95000 * 30) / 100) + Math.round((95000 * 25) / 100);

describe('PayslipGenerator.previewLop — the generator actually reads attendance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pays a present person the whole month and an absent one less', async () => {
    const preview = await PayslipGenerator.previewLop(stubSupabase(baseFixture()), 'period-1');

    expect(preview.payable_count).toBe(2);
    expect(preview.skipped_count).toBe(0);

    const present = preview.rows.find((r) => r.staff_id === 'staff-present')!;
    const absent = preview.rows.find((r) => r.staff_id === 'staff-absent')!;

    expect(present.lop_days).toBe(0);
    expect(present.gross_after_lop).toBe(FULL_GROSS);
    expect(present.lop_amount).toBe(0);

    expect(absent.lop_days).toBe(3);
    expect(absent.paid_days).toBe(19);
    expect(absent.business_working_days).toBe(22);
    expect(absent.gross_after_lop).toBeLessThan(FULL_GROSS);
    expect(absent.lop_amount).toBe(FULL_GROSS - absent.gross_after_lop);
    expect(absent.net_pay).toBeLessThan(present.net_pay);

    expect(preview.total_lop_days).toBe(3);
    expect(preview.totals.lop_amount).toBe(absent.lop_amount);
  });

  it('A SMALLER GROSS PRODUCES SMALLER DEDUCTIONS — the LOP cut reaches the tax', async () => {
    const preview = await PayslipGenerator.previewLop(stubSupabase(baseFixture()), 'period-1');
    const present = preview.rows.find((r) => r.staff_id === 'staff-present')!;
    const absent = preview.rows.find((r) => r.staff_id === 'staff-absent')!;

    // The whole point of LOP-adjusting BEFORE the deduction engine runs. If the
    // engine were handed the full gross, these two would be equal. (Income tax
    // falls further than the month's real share: the engine annualises this
    // month's gross × 12. Pre-existing; see the note in the generator.)
    expect(absent.total_deductions).toBeLessThan(present.total_deductions);
    expect(present.total_deductions).toBeGreaterThan(0);
  });

  it('pays nothing, and nothing negative, to somebody absent all month', async () => {
    const fx = baseFixture();
    fx.tables.hr_attendance_period_summaries = [
      {
        staff_id: 'staff-present',
        payable_days: 22,
        scheduled_days: 22,
        unprocessed_days: 0,
        present_days: 22,
        leave_days: 0,
        on_duty_days: 0,
        comp_off_days: 0,
      },
      {
        staff_id: 'staff-absent',
        payable_days: 0,
        scheduled_days: 22,
        unprocessed_days: 0,
        present_days: 0,
        leave_days: 0,
        on_duty_days: 0,
        comp_off_days: 0,
      },
    ];

    const preview = await PayslipGenerator.previewLop(stubSupabase(fx), 'period-1');
    const absent = preview.rows.find((r) => r.staff_id === 'staff-absent')!;

    expect(absent.lop_days).toBe(22);
    expect(absent.gross_after_lop).toBe(0);
    expect(absent.net_pay).toBe(0);
    expect(absent.net_pay).toBeGreaterThanOrEqual(0);
    expect(preview.warnings.join(' ')).toContain('no paid days');
  });

  it('a month with a different working-day count prices an absent day differently', async () => {
    const twentyTwo = await PayslipGenerator.previewLop(
      stubSupabase(baseFixture()),
      'period-1',
    );

    const fx = baseFixture();
    // February: 24 working days for this person, same three days missed.
    fx.tables.hr_attendance_periods = [
      { id: 'att-1', institution_id: 'inst-1', status: 'locked', working_days_count: 24 },
    ];
    fx.tables.hr_attendance_period_summaries = (
      fx.tables.hr_attendance_period_summaries as Record<string, unknown>[]
    ).map((s) =>
      s.staff_id === 'staff-absent'
        ? { ...s, scheduled_days: 24, payable_days: 21 }
        : { ...s, scheduled_days: 24, payable_days: 24 },
    );
    const twentyFour = await PayslipGenerator.previewLop(stubSupabase(fx), 'period-1');

    const a22 = twentyTwo.rows.find((r) => r.staff_id === 'staff-absent')!;
    const a24 = twentyFour.rows.find((r) => r.staff_id === 'staff-absent')!;

    expect(a22.lop_days).toBe(3);
    expect(a24.lop_days).toBe(3);
    // Same three days, a longer month, so each day is worth less.
    expect(a24.lop_amount).toBeLessThan(a22.lop_amount);
    expect(a22.lop_amount).toBe(Math.round((FULL_GROSS / 22) * 3));
    expect(a24.lop_amount).toBe(Math.round((FULL_GROSS / 24) * 3));
  });

  it('REFUSES to pay somebody with no attendance record at all', async () => {
    const fx = baseFixture();
    fx.tables.hr_attendance_period_summaries = (
      fx.tables.hr_attendance_period_summaries as Record<string, unknown>[]
    ).filter((s) => s.staff_id !== 'staff-absent');

    const preview = await PayslipGenerator.previewLop(stubSupabase(fx), 'period-1');
    const absent = preview.rows.find((r) => r.staff_id === 'staff-absent')!;

    expect(absent.payable).toBe(false);
    expect(absent.reason).toBe(LOP_SKIP_REASONS.noSummary);
    expect(absent.net_pay).toBe(0);
    expect(preview.payable_count).toBe(1);
    expect(preview.skipped_count).toBe(1);
    // And the totals must not carry a figure for somebody nobody is paying.
    expect(preview.totals.net).toBe(
      preview.rows.find((r) => r.staff_id === 'staff-present')!.net_pay,
    );
  });

  it('REFUSES to pay anybody when the work location has not closed the month', async () => {
    const fx = baseFixture();
    fx.tables.hr_attendance_periods = [
      { id: 'att-1', institution_id: 'inst-1', status: 'open', working_days_count: 22 },
    ];

    const preview = await PayslipGenerator.previewLop(stubSupabase(fx), 'period-1');

    expect(preview.payable_count).toBe(0);
    expect(preview.skipped_count).toBe(2);
    for (const r of preview.rows) {
      expect(r.reason).toBe(LOP_SKIP_REASONS.monthNotClosed);
    }
    expect(preview.warnings.join(' ')).toContain('not closed attendance');
  });

  it('REFUSES when the closed month records no working days for a person', async () => {
    const fx = baseFixture();
    fx.tables.hr_attendance_periods = [
      { id: 'att-1', institution_id: 'inst-1', status: 'locked', working_days_count: 0 },
    ];
    fx.tables.hr_attendance_period_summaries = (
      fx.tables.hr_attendance_period_summaries as Record<string, unknown>[]
    ).map((s) => ({ ...s, scheduled_days: null }));

    const preview = await PayslipGenerator.previewLop(stubSupabase(fx), 'period-1');

    expect(preview.payable_count).toBe(0);
    for (const r of preview.rows) {
      expect(r.reason).toBe(LOP_SKIP_REASONS.basisMissing);
    }
  });

  it('refuses to run at all when the closed month is invisible to the account', async () => {
    const fx = baseFixture();
    fx.tables.hr_attendance_period_summaries = [];
    fx.rpc = { user_has_permission: false, is_super_admin: false };

    await expect(
      PayslipGenerator.previewLop(stubSupabase(fx), 'period-1'),
    ).rejects.toThrow(/hr\.attendance\.period\.view/);
  });

  it('an operator WITHOUT the key who sees only their OWN row is told the permission is missing, not "no attendance record"', async () => {
    // The summaries SELECT policy also returns the caller's own row
    // (staff_id IN fn_my_staff_ids()). So an operator on the payroll who lacks
    // hr.attendance.period.view reads exactly ONE row — theirs — and no error.
    // A check keyed on "zero rows came back" never fires, and everybody else
    // would be skipped as "No attendance record". The permission, not the row
    // count, must decide.
    const fx = baseFixture();
    fx.tables.hr_attendance_period_summaries = (
      fx.tables.hr_attendance_period_summaries as Record<string, unknown>[]
    ).filter((s) => s.staff_id === 'staff-present');
    fx.rpc = {
      user_has_permission: (args?: { permission_name?: string }) =>
        args?.permission_name !== 'hr.attendance.period.view',
      is_super_admin: false,
    };

    await expect(
      PayslipGenerator.previewLop(stubSupabase(fx), 'period-1'),
    ).rejects.toThrow(/missing hr\.attendance\.period\.view/);
  });

  it('WITH the key, a genuinely missing record still says "No attendance record"', async () => {
    const fx = baseFixture();
    fx.tables.hr_attendance_period_summaries = (
      fx.tables.hr_attendance_period_summaries as Record<string, unknown>[]
    ).filter((s) => s.staff_id === 'staff-present');
    fx.rpc = { user_has_permission: true, is_super_admin: false };

    const preview = await PayslipGenerator.previewLop(stubSupabase(fx), 'period-1');
    const absent = preview.rows.find((r) => r.staff_id === 'staff-absent')!;
    expect(absent.payable).toBe(false);
    expect(absent.reason).toBe(LOP_SKIP_REASONS.noSummary);
    expect(preview.payable_count).toBe(1);
  });

  it('a super admin without the key is not refused (the policy lets them read every row)', async () => {
    const fx = baseFixture();
    fx.rpc = {
      user_has_permission: (args?: { permission_name?: string }) =>
        args?.permission_name !== 'hr.attendance.period.view',
      is_super_admin: true,
    };

    const preview = await PayslipGenerator.previewLop(stubSupabase(fx), 'period-1');
    expect(preview.payable_count).toBe(2);
  });

  it('accepts an already-loaded period row and does not fetch it again', async () => {
    const fx = baseFixture();
    const client = stubSupabase(fx);
    const touched: string[] = [];
    const realFrom = client.from;
    client.from = (table: string) => {
      touched.push(table);
      return realFrom(table);
    };

    const preview = await PayslipGenerator.previewLop(
      client,
      fx.period as PayrollPeriodRow,
    );

    expect(touched).not.toContain('hr_payroll_periods');
    expect(preview.payable_count).toBe(2);
  });

  it('reports days the attendance evaluator could not judge', async () => {
    const fx = baseFixture();
    fx.tables.hr_attendance_period_summaries = (
      fx.tables.hr_attendance_period_summaries as Record<string, unknown>[]
    ).map((s) => (s.staff_id === 'staff-absent' ? { ...s, unprocessed_days: 2 } : s));

    const preview = await PayslipGenerator.previewLop(stubSupabase(fx), 'period-1');
    expect(preview.warnings.join(' ')).toContain('could not be judged');
    expect(
      preview.rows.find((r) => r.staff_id === 'staff-absent')!.unprocessed_days,
    ).toBe(2);
  });

  it('the preview writes nothing', async () => {
    const fx = baseFixture();
    const client = stubSupabase(fx);
    const touched: string[] = [];
    const realFrom = client.from;
    client.from = (table: string) => {
      touched.push(table);
      return realFrom(table);
    };

    await PayslipGenerator.previewLop(client, 'period-1');

    expect(touched).not.toContain('hr_payslips');
    expect(touched).not.toContain('hr_payslip_line_items');
  });
});
