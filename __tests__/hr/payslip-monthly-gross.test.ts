/**
 * Payslips take pay from each person's monthly gross (Director rulings,
 * 30 Sep 2026):
 *
 *   - Which month: the pay IN FORCE FOR THAT MONTH, by effective_from, not the
 *     latest row. The salary register follows the SAME month rule.
 *   - PF: the flat PF amount HR typed on the salary row (epf_amount), as the
 *     register does. No Basic is recorded anywhere; never guess one.
 *   - Allowance: PAY IT (monthly gross + allowance_amount), as the register.
 *
 * And the W12 review of #4123: HR's eligible_for_pf / eligible_for_esi flags
 * decide; a manual override treats a blank field as unchanged, never 0.
 *
 * What is pinned here:
 *   1. The month rule (pure): a raise dated 1 Oct does not pay September; an
 *      empty effective_from is in force since forever; chain order breaks ties.
 *   2. The shared loader reads history in chunks and pages.
 *   3. payslipPayFor: PF from epf_amount, flags honoured, allowance paid and
 *      cut for loss of pay, no basic ever.
 *   4. The generator end to end, and the register agreeing with it for the
 *      same month.
 *   5. The override: blank = unchanged.
 *
 * The stub below HONOURS the eq / in / is / range filters, because "the row in
 * force" is only testable against a stub that returns every row.
 *
 * Run: npx vitest run __tests__/hr/payslip-monthly-gross.test.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PayrollPolicies } from '@/lib/services/hr/payroll/deduction-engine';
import { BASIC_NOT_RECORDED } from '@/lib/hr/payroll/lop-engine';
import {
  lastDayOfMonth,
  pickSalaryInForce,
  salaryChainNewestFirst,
} from '@/lib/hr/payroll/salary-in-force';

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

vi.mock('@/lib/services/hr/payroll/deduction-engine', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/services/hr/payroll/deduction-engine')
  >();
  return { ...actual, loadPayrollPolicies: vi.fn(async () => POLICIES) };
});

const {
  PayslipGenerator,
  PayrollPermissionError,
  PayslipOverrideRefusal,
  SALARY_SKIP_REASONS,
  SALARY_STARTS_LATER_PREFIX,
  payslipPayFor,
  resolveDeductionOverrides,
} = await import('@/lib/services/hr/payroll/payslip-generator');
const { loadSalaryRowsInForce, SalaryRegisterService } = await import(
  '@/lib/services/hr/payroll/salary-register-service'
);

// ============================================================================
// A filter-honouring stub
// ============================================================================

type Row = Record<string, unknown>;

interface Recorded {
  touched: string[];
  filters: { table: string; op: string; col: string; val: unknown }[];
  inserts: { table: string; rows: Row[] }[];
  updates: { table: string; patch: Row }[];
}

function stub(tables: Record<string, Row[]>, rpc: Record<string, unknown> = {}) {
  const rec: Recorded = { touched: [], filters: [], inserts: [], updates: [] };
  const rpcValues: Record<string, unknown> = {
    user_has_permission: true,
    is_super_admin: false,
    ...rpc,
  };

  const builder = (table: string) => {
    rec.touched.push(table);
    const preds: ((r: Row) => boolean)[] = [];
    let headCount = false;
    let range: [number, number] | null = null;
    const b: Record<string, unknown> = {};
    const add = (op: string, col: string, val: unknown, p: (r: Row) => boolean) => {
      rec.filters.push({ table, op, col, val });
      preds.push(p);
      return b;
    };
    b.select = (_cols?: string, opts?: { head?: boolean }) => {
      headCount = !!opts?.head;
      return b;
    };
    b.eq = (col: string, val: unknown) => add('eq', col, val, (r) => r[col] === val);
    b.in = (col: string, vals: unknown[]) => add('in', col, vals, (r) => vals.includes(r[col]));
    b.is = (col: string, val: unknown) =>
      add('is', col, val, (r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
    b.order = () => b;
    b.limit = () => b;
    b.range = (from: number, to: number) => {
      range = [from, to];
      return b;
    };
    b.insert = (rows: Row | Row[]) => {
      rec.inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
      return Promise.resolve({ data: null, error: null });
    };
    b.update = (patch: Row) => {
      rec.updates.push({ table, patch });
      return b;
    };
    const run = () => {
      let rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: headCount ? null : rows, error: null, count: rows.length };
    };
    b.single = () => {
      const r = run();
      return Promise.resolve({ data: (r.data ?? [])[0] ?? null, error: null });
    };
    b.maybeSingle = b.single;
    b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(ok, err);
    return b;
  };

  const client = {
    from: (t: string) => builder(t),
    rpc: (name: string, args?: Record<string, unknown>) => {
      const v = rpcValues[name];
      const data = typeof v === 'function' ? (v as (a?: unknown) => unknown)(args) : v;
      return Promise.resolve({ data: data ?? null, error: null });
    },
  };
  return { client: client as never, rec };
}

const salary = (over: Row): Row => ({
  id: `sal-${String(over.staff_id)}-${String(over.monthly_gross)}`,
  eligible_for_pf: true,
  epf_amount: 1800,
  eligible_for_esi: false,
  esi_amount: 0,
  allowance_amount: 0,
  superseded_by: null,
  effective_from: '2026-04-01',
  created_at: '2026-04-01T09:00:00Z',
  ...over,
});

const PEOPLE = ['raised', 'no-start-date', 'no-salary', 'starts-later', 'exempt', 'allowance'];

function fixture(month = 8): Record<string, Row[]> {
  return {
    hr_payroll_periods: [
      {
        id: 'period-1',
        hr_organization_id: 'org-1',
        institution_id: 'inst-1',
        engine_type: 'non_teaching',
        period_year: 2026,
        period_month: month,
        status: 'prepared',
      },
    ],
    hr_payslips: [],
    hr_staff_payroll: PEOPLE.map((id) => ({ staff_id: id, hr_organization_id: 'org-1' })),
    staff: [
      { id: 'raised', first_name: 'Raised', last_name: 'Once', institution_id: 'inst-1', is_active: true },
      { id: 'no-start-date', first_name: 'Old', last_name: 'Row', institution_id: 'inst-1', is_active: true },
      { id: 'no-salary', first_name: 'Nila', last_name: 'S', institution_id: 'inst-1', is_active: true },
      { id: 'starts-later', first_name: 'New', last_name: 'Joiner', institution_id: 'inst-1', is_active: true },
      { id: 'exempt', first_name: 'Exempt', last_name: 'Person', institution_id: 'inst-1', is_active: true },
      { id: 'allowance', first_name: 'With', last_name: 'Allowance', institution_id: 'inst-1', is_active: true },
    ],
    hr_staff_salaries: [
      // A raise recorded on 29 Sep, dated to start 1 Sep: the 6000 row is
      // superseded by the 7000 row. August pays 6000; September pays 7000.
      salary({
        staff_id: 'raised',
        monthly_gross: 6000,
        superseded_by: 'sal-raised-7000',
        effective_from: '2026-04-01',
      }),
      salary({
        staff_id: 'raised',
        monthly_gross: 7000,
        effective_from: '2026-09-01',
        created_at: '2026-09-29T11:15:00Z',
      }),
      // An older row with no start date recorded: in force since forever.
      salary({ staff_id: 'no-start-date', monthly_gross: '22000.00', effective_from: null }),
      // No salary rows at all.
      // Only a row that starts in October.
      salary({ staff_id: 'starts-later', monthly_gross: 25000, effective_from: '2026-10-01' }),
      // HR marked this person NOT eligible for PF or ESI, but a PF figure sits
      // on the row anyway. The flag decides.
      salary({
        staff_id: 'exempt',
        monthly_gross: 15000,
        eligible_for_pf: false,
        epf_amount: 1800,
        eligible_for_esi: false,
      }),
      // An allowance on top of the gross, and ESI-eligible.
      salary({
        staff_id: 'allowance',
        monthly_gross: 18000,
        allowance_amount: '2000.00',
        eligible_for_esi: true,
        epf_amount: '1500.00',
      }),
    ],
    hr_attendance_periods: [
      { id: 'att-1', institution_id: 'inst-1', status: 'locked', working_days_count: 22, period_year: 2026, period_month: month },
    ],
    hr_attendance_period_summaries: PEOPLE.map((id) => ({
      period_id: 'att-1',
      staff_id: id,
      payable_days: 22,
      scheduled_days: 22,
      unprocessed_days: 0,
      present_days: 22,
      leave_days: 0,
      on_duty_days: 0,
      comp_off_days: 0,
    })),
  };
}

// ============================================================================
// 1. The month rule — pure
// ============================================================================

describe('the month rule: the pay in force for the month, by effective_from', () => {
  const chain = [
    { id: 'a', staff_id: 'p', effective_from: '2026-04-01', superseded_by: 'b', gross: 6000 },
    { id: 'b', staff_id: 'p', effective_from: '2026-10-01', superseded_by: null, gross: 7000 },
  ];

  it('a raise dated 1 October does NOT pay September, even though it is the newest row', () => {
    expect(pickSalaryInForce(chain, '2026-09-30').row?.gross).toBe(6000);
  });

  it('the raise pays October and every month after', () => {
    expect(pickSalaryInForce(chain, '2026-10-31').row?.gross).toBe(7000);
    expect(pickSalaryInForce(chain, '2027-03-31').row?.gross).toBe(7000);
  });

  it('a raise starting mid-month pays that whole month (in force by its last day)', () => {
    const mid = [chain[0], { ...chain[1], effective_from: '2026-09-15' }];
    expect(pickSalaryInForce(mid, '2026-09-30').row?.gross).toBe(7000);
  });

  it('an empty effective_from counts as in force since forever', () => {
    const rows = [{ id: 'x', staff_id: 'p', effective_from: null, superseded_by: null, gross: 22000 }];
    expect(pickSalaryInForce(rows, '1999-01-31').row?.gross).toBe(22000);
  });

  it('an empty effective_from on an OLD row still yields to a newer row that has started', () => {
    const rows = [
      { id: 'old', staff_id: 'p', effective_from: null, superseded_by: 'new', gross: 5000 },
      { id: 'new', staff_id: 'p', effective_from: '2026-06-01', superseded_by: null, gross: 9000 },
    ];
    expect(pickSalaryInForce(rows, '2026-05-31').row?.gross).toBe(5000);
    expect(pickSalaryInForce(rows, '2026-06-30').row?.gross).toBe(9000);
  });

  it('two rows with the same start date: the one that replaced the other wins (a correction)', () => {
    const rows = [
      { id: 'typo', staff_id: 'p', effective_from: '2026-09-01', superseded_by: 'fixed', gross: 70000 },
      { id: 'fixed', staff_id: 'p', effective_from: '2026-09-01', superseded_by: null, gross: 7000 },
    ];
    expect(pickSalaryInForce(rows, '2026-09-30').row?.gross).toBe(7000);
  });

  it('nothing started by the month: no row, and the date pay starts', () => {
    const rows = [{ id: 'x', staff_id: 'p', effective_from: '2026-10-01', superseded_by: null }];
    expect(pickSalaryInForce(rows, '2026-09-30')).toEqual({ row: null, startsAfter: '2026-10-01' });
    expect(pickSalaryInForce([], '2026-09-30')).toEqual({ row: null, startsAfter: null });
  });

  it('a pointer loop cannot hang the payroll', () => {
    const rows = [
      { id: 'a', staff_id: 'p', effective_from: '2026-01-01', superseded_by: 'b' },
      { id: 'b', staff_id: 'p', effective_from: '2026-02-01', superseded_by: 'a' },
    ];
    expect(salaryChainNewestFirst(rows)).toHaveLength(2);
    expect(pickSalaryInForce(rows, '2026-03-31').row?.id).toBe('b');
  });

  it('the last day of a month, leap years included', () => {
    expect(lastDayOfMonth(2026, 9)).toBe('2026-09-30');
    expect(lastDayOfMonth(2026, 2)).toBe('2026-02-28');
    expect(lastDayOfMonth(2028, 2)).toBe('2028-02-29');
    expect(lastDayOfMonth(2026, 12)).toBe('2026-12-31');
  });
});

// ============================================================================
// 2. The shared loader
// ============================================================================

describe('loadSalaryRowsInForce — the one loader both screens use', () => {
  it('returns the row in force for the month, and who starts later', async () => {
    const { client } = stub(fixture());
    const aug = await loadSalaryRowsInForce(client, PEOPLE, 2026, 8);
    const byStaff = new Map(aug.rows.map((r) => [r.staff_id, r]));

    expect(byStaff.get('raised')?.monthly_gross).toBe(6000);
    expect(byStaff.get('no-start-date')?.monthly_gross).toBe('22000.00');
    expect(byStaff.has('no-salary')).toBe(false);
    expect(byStaff.has('starts-later')).toBe(false);
    expect(aug.startsAfterMonth.get('starts-later')).toBe('2026-10-01');
    expect(aug.rows.filter((r) => r.staff_id === 'raised')).toHaveLength(1);

    const sep = await loadSalaryRowsInForce(client, PEOPLE, 2026, 9);
    expect(sep.rows.find((r) => r.staff_id === 'raised')?.monthly_gross).toBe(7000);
  });

  it('reads the whole history, not only superseded_by IS NULL', async () => {
    const { client, rec } = stub(fixture());
    await loadSalaryRowsInForce(client, ['raised'], 2026, 8);
    const salaryFilters = rec.filters.filter((f) => f.table === 'hr_staff_salaries');
    expect(salaryFilters.some((f) => f.op === 'is' && f.col === 'superseded_by')).toBe(false);
  });

  it('reads in chunks, so a big organisation cannot truncate silently', async () => {
    const { client, rec } = stub(fixture());
    const ids = Array.from({ length: 250 }, (_, i) => `s${i}`);
    await loadSalaryRowsInForce(client, ids, 2026, 8);
    expect(rec.touched.filter((t) => t === 'hr_staff_salaries')).toHaveLength(3);
  });

  it('pages through a long history instead of stopping at the first page', async () => {
    const fx = fixture();
    // 600 rows for one person: the newest is the only one that has started.
    const long: Row[] = Array.from({ length: 599 }, (_, i) =>
      salary({ id: `h${String(i).padStart(4, '0')}`, staff_id: 'raised', monthly_gross: 100 + i, superseded_by: `h${String(i + 1).padStart(4, '0')}`, effective_from: '2030-01-01' }),
    );
    long.push(salary({ id: 'h0599', staff_id: 'raised', monthly_gross: 9999, effective_from: null }));
    fx.hr_staff_salaries = long;
    const { client, rec } = stub(fx);
    const r = await loadSalaryRowsInForce(client, ['raised'], 2026, 8);
    expect(rec.touched.filter((t) => t === 'hr_staff_salaries')).toHaveLength(2);
    expect(r.rows[0]?.monthly_gross).toBe(9999);
  });
});

// ============================================================================
// 3. payslipPayFor — PF from HR's amount, flags, allowance
// ============================================================================

const base = {
  monthlyGross: 30000,
  allowance: 0,
  eligibleForPf: true,
  epfAmount: 1800,
  eligibleForEsi: false,
  factor: 1,
  policies: POLICIES,
};

describe('payslipPayFor — PF is the amount HR typed, never worked out from a basic', () => {
  it('PF is the flat epf_amount, and basic stays not recorded', () => {
    const pay = payslipPayFor(base);
    expect(pay.basicPay).toBeNull();
    expect(pay.deductions.pf).toBe(1800);
    // PT slab 135 at 30000; no ESI (not eligible); no tax at this gross.
    expect(pay.deductions.total).toBe(1800 + 135);
    expect(pay.deductions.netPay).toBe(30000 - 1935);
  });

  it('PF is NOT pro-rated for loss of pay (the register takes it in full)', () => {
    const pay = payslipPayFor({ ...base, monthlyGross: 22000, factor: 19 / 22 });
    expect(pay.lopAdjustedGross).toBe(19000);
    expect(pay.deductions.pf).toBe(1800);
  });

  it('eligible_for_pf off: no PF at all, even with an amount typed', () => {
    const pay = payslipPayFor({ ...base, eligibleForPf: false });
    expect(pay.deductions.pf).toBe(0);
    expect(pay.pfExempt).toBe(true);
  });

  it('eligible_for_esi off: no ESI; on: ESI from the policy on the monthly gross', () => {
    const off = payslipPayFor({ ...base, monthlyGross: 15000 });
    expect(off.deductions.esi).toBe(0);
    expect(off.esiExempt).toBe(true);

    const on = payslipPayFor({ ...base, monthlyGross: 15000, eligibleForEsi: true });
    expect(on.esiExempt).toBe(false);
    expect(on.deductions.esi).toBeGreaterThan(0);
  });

  it('the allowance is PAID on top of the gross and cut for loss of pay with it', () => {
    const full = payslipPayFor({ ...base, monthlyGross: 18000, allowance: 2000 });
    expect(full.fullGross).toBe(20000);
    expect(full.lopAdjustedGross).toBe(20000);
    expect(full.allowancePaid).toBe(2000);

    const cut = payslipPayFor({ ...base, monthlyGross: 18000, allowance: 2000, factor: 11 / 22 });
    expect(cut.lopAdjustedGross).toBe(10000);
    expect(cut.allowancePaid).toBe(1000);
  });

  it('the allowance is not in the base for ESI and the taxes (the register leaves it out of tax too)', () => {
    const without = payslipPayFor({ ...base, monthlyGross: 18000, eligibleForEsi: true });
    const withAllowance = payslipPayFor({ ...base, monthlyGross: 18000, allowance: 5000, eligibleForEsi: true });
    expect(withAllowance.deductions.esi).toBe(without.deductions.esi);
    expect(withAllowance.deductions.pt).toBe(without.deductions.pt);
    expect(withAllowance.deductions.tds).toBe(without.deductions.tds);
  });

  it('a month with no paid days: net pay held at zero, PF kept first', () => {
    const pay = payslipPayFor({ ...base, factor: 0 });
    expect(pay.lopAdjustedGross).toBe(0);
    expect(pay.deductions.netPay).toBe(0);
    expect(pay.deductions.total).toBe(0);
  });
});

// ============================================================================
// 4. The generator end to end
// ============================================================================

describe('PayslipGenerator — the pay in force for the month', () => {
  beforeEach(() => vi.clearAllMocks());

  it('August pays the August salary; the raise dated 1 September does not reach it', async () => {
    const { client, rec } = stub(fixture(8));
    const preview = await PayslipGenerator.previewLop(client, 'period-1');
    const row = (id: string) => preview.rows.find((r) => r.staff_id === id)!;

    expect(row('raised').payable).toBe(true);
    expect(row('raised').full_gross).toBe(6000);
    expect(row('raised').basic_pay).toBeNull();
    expect(row('raised').pf).toBe(1800);

    expect(row('no-start-date').full_gross).toBe(22000);

    expect(row('no-salary').payable).toBe(false);
    expect(row('no-salary').reason).toBe(SALARY_SKIP_REASONS.noSalary);

    expect(row('starts-later').payable).toBe(false);
    expect(row('starts-later').reason).toContain(SALARY_STARTS_LATER_PREFIX);
    expect(row('starts-later').reason).toContain('2026-10-01');

    expect(row('exempt').pf).toBe(0);
    expect(row('exempt').pf_exempt).toBe(true);
    expect(row('exempt').esi_exempt).toBe(true);

    expect(row('allowance').full_gross).toBe(20000);
    expect(row('allowance').allowance_paid).toBe(2000);
    expect(row('allowance').pf).toBe(1500);
    expect(row('allowance').esi_exempt).toBe(false);

    expect(preview.skipped_count).toBe(2);
    expect(preview.payable_count).toBe(4);
    expect(preview.warnings.join(' ')).toMatch(/1 person\(s\) have a salary that starts after this month/);
    // No warning pretends PF was not worked out any more.
    expect(preview.warnings.join(' ')).not.toMatch(/not worked out/i);
    expect(preview.warnings.join(' ')).not.toMatch(/allowance is not on these payslips/);

    expect(rec.touched).not.toContain('hr_pay_scales');
    expect(rec.touched).not.toContain('hr_pay_components');
  });

  it('September pays the raise', async () => {
    const { client } = stub(fixture(9));
    const preview = await PayslipGenerator.previewLop(client, 'period-1');
    expect(preview.rows.find((r) => r.staff_id === 'raised')!.full_gross).toBe(7000);
  });

  it('marked for PF with no amount typed: warned, not guessed', async () => {
    const fx = fixture();
    fx.hr_staff_salaries = fx.hr_staff_salaries.map((r) =>
      r.staff_id === 'no-start-date' ? { ...r, epf_amount: null } : r,
    );
    const { client } = stub(fx);
    const preview = await PayslipGenerator.previewLop(client, 'period-1');
    expect(preview.rows.find((r) => r.staff_id === 'no-start-date')!.pf).toBe(0);
    expect(preview.warnings.join(' ')).toMatch(/1 person\(s\) are marked for PF on their salary, but no PF amount is typed/);
  });

  it('a salary of 0 is skipped with its own reason', async () => {
    const fx = fixture();
    fx.hr_staff_salaries = [salary({ staff_id: 'raised', monthly_gross: 0 })];
    const { client } = stub(fx);
    const preview = await PayslipGenerator.previewLop(client, 'period-1');
    expect(preview.rows.find((r) => r.staff_id === 'raised')!.reason).toBe(SALARY_SKIP_REASONS.salaryIsZero);
  });

  it('a real run writes basic NULL, the allowance and every deduction one by one, and keeps its notes on the period', async () => {
    const { client, rec } = stub(fixture());
    const result = await PayslipGenerator.generate(client, 'period-1');

    expect(result.generated).toBe(4);
    expect(result.skipped).toBe(2);

    const slips = rec.inserts.filter((i) => i.table === 'hr_payslips').flatMap((i) => i.rows);
    expect(slips).toHaveLength(4);
    for (const s of slips) {
      expect(s.basic_pay).toBeNull();
      expect(s.pay_scale_snapshot_id).toBeNull();
      const parts =
        (s.pf_deduction as number) + (s.esi_deduction as number) + (s.tds_deduction as number) + (s.pt_deduction as number);
      expect(parts).toBe(s.total_deductions);
    }
    const allowanceSlip = slips.find((s) => s.staff_id === 'allowance')!;
    expect(allowanceSlip.gross_amount).toBe(20000);
    expect(allowanceSlip.allowance_paid).toBe(2000);
    expect(allowanceSlip.pf_deduction).toBe(1500);
    expect(slips.find((s) => s.staff_id === 'exempt')!.pf_deduction).toBe(0);
    expect(rec.inserts.some((i) => i.table === 'hr_payslip_line_items')).toBe(false);

    const periodUpdate = rec.updates.find((u) => u.table === 'hr_payroll_periods')!;
    const notes = periodUpdate.patch.generation_notes as {
      warnings: string[];
      skipped_people: { staff_id: string; reason: string }[];
      generated: number;
    };
    expect(notes.generated).toBe(4);
    expect(notes.warnings).toEqual(result.warnings);
    expect(notes.skipped_people.map((p) => p.staff_id).sort()).toEqual(['no-salary', 'starts-later']);
    expect(periodUpdate.patch.staff_count).toBe(4);
  });

  it('an account without hr.payroll.salary.view is refused, not shown everyone as "no salary"', async () => {
    const { client } = stub(fixture(), {
      user_has_permission: (a?: { permission_name?: string }) =>
        a?.permission_name !== 'hr.payroll.salary.view',
    });
    const err = await PayslipGenerator.previewLop(client, 'period-1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PayrollPermissionError);
    expect((err as InstanceType<typeof PayrollPermissionError>).missingPermission).toBe(
      'hr.payroll.salary.view',
    );
    expect((err as InstanceType<typeof PayrollPermissionError>).status).toBe(403);
  });

  it('a super admin without the salary key is not refused', async () => {
    const { client } = stub(fixture(), {
      user_has_permission: (a?: { permission_name?: string }) =>
        a?.permission_name !== 'hr.payroll.salary.view',
      is_super_admin: true,
    });
    const preview = await PayslipGenerator.previewLop(client, 'period-1');
    expect(preview.payable_count).toBe(4);
  });

  it('the basic words are unchanged', () => {
    expect(BASIC_NOT_RECORDED).toBe('basic not recorded');
  });
});

// ============================================================================
// 4b. The register and the payslip agree for the same month
// ============================================================================

function registerFixture(month: number): Record<string, Row[]> {
  const fx = fixture(month);
  return {
    ...fx,
    hr_organizations: [
      { id: 'org-1', name: 'Pharmacy', institution_id: 'inst-1', is_payroll_entity: true, included_in_hr: true },
    ],
    v_hr_staff: fx.staff.map((s) => ({
      ...s,
      staff_id: `E-${String(s.id)}`,
      designation: 'Clerk',
      date_of_joining: '2020-01-01',
      department_id: null,
    })),
    departments: [],
    hr_tds_slabs: [],
    hr_staff_bank_accounts: [],
  };
}

describe('the salary register uses the SAME month rule as the payslip', () => {
  for (const month of [8, 9]) {
    it(`month ${month}: every person's monthly gross is the same on both screens`, async () => {
      const fx = registerFixture(month);
      const projection = PEOPLE.map((id) => ({
        staff_id: id,
        present_days: 22,
        half_days: 0,
        leave_days: 0,
        on_duty_days: 0,
        comp_off_days: 0,
        lop_days: 0,
        payable_days: 22,
        leave_by_type: {},
        unprocessed_days: 0,
        scheduled_days: 22,
        work_pattern_id: null,
      }));
      const { client } = stub(fx, { fn_hr_attendance_period_projection: projection });

      const register = await SalaryRegisterService.previewForClose(client, {
        hrOrganizationId: 'org-1',
        year: 2026,
        month,
      });
      const payslips = await PayslipGenerator.previewLop(client, 'period-1');

      const registerGross = new Map(register.payable.map((r) => [r.staff_id, r.monthly_gross]));
      const payslipGross = new Map(
        payslips.rows
          .filter((r) => r.payable)
          .map((r) => [r.staff_id, r.full_gross - r.allowance_paid]),
      );
      expect(registerGross).toEqual(payslipGross);
      expect(registerGross.get('raised')).toBe(month === 8 ? 6000 : 7000);

      // Both leave off the same people.
      const registerOff = register.excluded.map((e) => e.staff_id).sort();
      const payslipOff = payslips.rows.filter((r) => !r.payable).map((r) => r.staff_id).sort();
      expect(registerOff).toEqual(payslipOff);
    });
  }

  it('the register preflight names the person whose salary starts later', async () => {
    const fx = registerFixture(8);
    fx.hr_attendance_periods = [
      { id: 'att-1', institution_id: 'inst-1', status: 'locked', working_days_count: 22, period_year: 2026, period_month: 8, locked_at: '2026-09-02' },
    ];
    fx.hr_attendance_period_summaries = fx.hr_attendance_period_summaries.map((s) => ({
      ...s,
      half_days: 0,
      lop_days: 0,
      leave_by_type: {},
    }));
    fx.hr_salary_register_runs = [];
    const { client } = stub(fx);
    const pre = await SalaryRegisterService.preflight(client, { hrOrganizationId: 'org-1', year: 2026, month: 8 });
    expect(pre.warnings.join(' ')).toMatch(/have a salary that starts after August 2026/);
    expect(pre.warnings.join(' ')).toContain('New Joiner (from 2026-10-01)');
  });
});

// ============================================================================
// 5. The override: a blank field is UNCHANGED, never 0
// ============================================================================

describe('overrideDeductions — a blank field keeps its amount', () => {
  const saved = { pf: 1800, esi: 113, tds: 0, pt: 135 };

  it('entering only PF keeps ESI, income tax and professional tax as they were', () => {
    expect(resolveDeductionOverrides(saved, { pf: 2000 })).toEqual({ pf: 2000, esi: 113, tds: 0, pt: 135 });
  });

  it('null and an empty string are blank too; 0 typed is a real 0', () => {
    expect(resolveDeductionOverrides(saved, { pf: null, esi: '', tds: undefined, pt: 0 })).toEqual({
      pf: 1800,
      esi: 113,
      tds: 0,
      pt: 0,
    });
  });

  it('a negative or non-number amount is refused', () => {
    expect(() => resolveDeductionOverrides(saved, { pf: -1 })).toThrow(PayslipOverrideRefusal);
    expect(() => resolveDeductionOverrides(saved, { esi: 'abc' })).toThrow(PayslipOverrideRefusal);
  });

  it('a slip with nothing saved: a blank field is refused, never read as 0', () => {
    const none = { pf: null, esi: null, tds: null, pt: null };
    expect(() => resolveDeductionOverrides(none, { pf: 2000 })).toThrow(/Fill in all four amounts/);
    expect(resolveDeductionOverrides(none, { pf: 1, esi: 2, tds: 3, pt: 4 })).toEqual({ pf: 1, esi: 2, tds: 3, pt: 4 });
  });

  it('end to end: the adjustment slip keeps the other three and saves all four', async () => {
    const { client, rec } = stub({
      hr_payslips: [
        {
          id: 'slip-1',
          period_id: 'period-1',
          staff_id: 'allowance',
          engine_type: 'non_teaching',
          basic_pay: null,
          pay_scale_snapshot_id: null,
          working_days_attended: 22,
          lop_days: 0,
          gross_amount: 20000,
          total_deductions: 1800 + 113 + 0 + 0,
          net_amount: 20000 - 1913,
          allowance_paid: 2000,
          pf_deduction: 1800,
          esi_deduction: 113,
          tds_deduction: 0,
          pt_deduction: 0,
          payment_mode: 'neft',
          superseded_by: null,
        },
      ],
      hr_payroll_periods: [],
    });

    await PayslipGenerator.overrideDeductions(client, 'slip-1', { pf: 2500 }, 'PF corrected to the form');
    const adj = rec.inserts.find((i) => i.table === 'hr_payslips')!.rows[0];
    expect(adj).toMatchObject({
      pf_deduction: 2500,
      esi_deduction: 113,
      tds_deduction: 0,
      pt_deduction: 0,
      total_deductions: 2613,
      net_amount: 20000 - 2613,
      allowance_paid: 2000,
      correction_type: 'adjustment',
    });
  });

  it('deductions above the pay are refused rather than written as a negative net', async () => {
    const { client, rec } = stub({
      hr_payslips: [
        {
          id: 'slip-1',
          period_id: 'period-1',
          staff_id: 'x',
          gross_amount: 1000,
          total_deductions: 0,
          net_amount: 1000,
          pf_deduction: 0,
          esi_deduction: 0,
          tds_deduction: 0,
          pt_deduction: 0,
          superseded_by: null,
        },
      ],
    });
    await expect(
      PayslipGenerator.overrideDeductions(client, 'slip-1', { pf: 5000 }, 'too much'),
    ).rejects.toBeInstanceOf(PayslipOverrideRefusal);
    expect(rec.inserts).toHaveLength(0);
  });
});
