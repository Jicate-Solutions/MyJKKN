/**
 * Payslips take pay from each person's CURRENT monthly gross (Director ruling,
 * 2026-09-30):
 *
 *   "Payslips: take pay from each person's current monthly gross
 *   (hr_staff_salaries), unblocking payslips; Basic comes from the basic HR
 *   already records, and where none is recorded the payslip shows 'basic not
 *   recorded' rather than guessing."
 *
 * What is pinned here:
 *   1. The current-row rule is the salary register's, shared — superseded rows
 *      are ignored, and effective_from (empty or later than the month) is not
 *      consulted, exactly as the register does.
 *   2. Basic: a recorded basic is used as recorded; none recorded prints
 *      "basic not recorded", no basic is computed, and the provident fund
 *      (worked out from basic) is reported as not worked out — never guessed.
 *   3. A person with no current salary is LISTED as skipped with a plain
 *      reason, never silently dropped.
 *   4. The run no longer reads hr_pay_scales, and a real run writes basic_pay
 *      NULL with no pay-scale pointer.
 *
 * Unlike __tests__/hr/payroll-lop.test.ts, the stub below HONOURS the eq / in /
 * is filters, because "superseded rows are ignored" is only testable against a
 * stub that can ignore them.
 *
 * Run: npx vitest run __tests__/hr/payslip-monthly-gross.test.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PayrollPolicies } from '@/lib/services/hr/payroll/deduction-engine';
import { BASIC_NOT_RECORDED, PF_NOT_WORKED_OUT } from '@/lib/hr/payroll/lop-engine';

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

const { PayslipGenerator, PayrollPermissionError, SALARY_SKIP_REASONS, payslipPayFor } =
  await import('@/lib/services/hr/payroll/payslip-generator');
const { loadCurrentSalaryRows } = await import('@/lib/services/hr/payroll/salary-register-service');

// ============================================================================
// A filter-honouring stub
// ============================================================================

type Row = Record<string, unknown>;

interface Recorded {
  touched: string[];
  filters: { table: string; op: string; col: string; val: unknown }[];
  inserts: { table: string; rows: Row[] }[];
}

function stub(tables: Record<string, Row[]>, rpc: Record<string, unknown> = {}) {
  const rec: Recorded = { touched: [], filters: [], inserts: [] };
  const rpcValues: Record<string, unknown> = {
    user_has_permission: true,
    is_super_admin: false,
    ...rpc,
  };

  const builder = (table: string) => {
    rec.touched.push(table);
    const preds: ((r: Row) => boolean)[] = [];
    let headCount = false;
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
    b.insert = (rows: Row | Row[]) => {
      rec.inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
      return Promise.resolve({ data: null, error: null });
    };
    b.update = () => b;
    const run = () => {
      const rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
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
  ...over,
});

function fixture(): Record<string, Row[]> {
  return {
    hr_payroll_periods: [
      {
        id: 'period-1',
        hr_organization_id: 'org-1',
        institution_id: 'inst-1',
        engine_type: 'non_teaching',
        period_year: 2026,
        period_month: 8,
        status: 'prepared',
      },
    ],
    hr_payslips: [],
    hr_staff_payroll: [
      { staff_id: 'raised', hr_organization_id: 'org-1' },
      { staff_id: 'no-start-date', hr_organization_id: 'org-1' },
      { staff_id: 'no-salary', hr_organization_id: 'org-1' },
    ],
    staff: [
      { id: 'raised', first_name: 'Raised', last_name: 'Once', institution_id: 'inst-1', is_active: true },
      { id: 'no-start-date', first_name: 'Old', last_name: 'Row', institution_id: 'inst-1', is_active: true },
      { id: 'no-salary', first_name: 'Nila', last_name: 'S', institution_id: 'inst-1', is_active: true },
    ],
    hr_staff_salaries: [
      // A raise: the 6000 row is superseded by the 7000 row, which is backdated
      // to start AFTER the month being paid. The register pays the row in force
      // (superseded_by IS NULL) regardless of its start date; so do payslips.
      salary({ staff_id: 'raised', monthly_gross: 6000, superseded_by: 'sal-raised-7000' }),
      salary({ staff_id: 'raised', monthly_gross: 7000, effective_from: '2026-09-01' }),
      // An older current row with no start date recorded.
      salary({ staff_id: 'no-start-date', monthly_gross: '22000.00', effective_from: null }),
      // Only a SUPERSEDED row: nothing is in force for this person.
      salary({ staff_id: 'no-salary', monthly_gross: 30000, superseded_by: 'gone' }),
    ],
    hr_attendance_periods: [
      { id: 'att-1', institution_id: 'inst-1', status: 'locked', working_days_count: 22, period_year: 2026, period_month: 8 },
    ],
    hr_attendance_period_summaries: ['raised', 'no-start-date', 'no-salary'].map((id) => ({
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
// 1. The current-row rule
// ============================================================================

describe('loadCurrentSalaryRows — the one current-salary rule, shared with the register', () => {
  it('ignores superseded rows and keeps the row in force', async () => {
    const { client } = stub(fixture());
    const rows = await loadCurrentSalaryRows(client, ['raised', 'no-start-date', 'no-salary']);
    const byStaff = new Map(rows.map((r) => [r.staff_id, r]));

    expect(byStaff.get('raised')?.monthly_gross).toBe(7000);
    expect(rows.filter((r) => r.staff_id === 'raised')).toHaveLength(1);
    expect(byStaff.has('no-salary')).toBe(false);
  });

  it('handles an empty effective_from the way the register does: it is not consulted', async () => {
    const { client, rec } = stub(fixture());
    const rows = await loadCurrentSalaryRows(client, ['no-start-date']);

    expect(rows).toHaveLength(1);
    expect(rows[0].monthly_gross).toBe('22000.00');
    // The rule is superseded_by IS NULL and nothing else.
    const salaryFilters = rec.filters.filter((f) => f.table === 'hr_staff_salaries');
    expect(salaryFilters.some((f) => f.op === 'is' && f.col === 'superseded_by' && f.val === null)).toBe(true);
    expect(salaryFilters.some((f) => f.col === 'effective_from')).toBe(false);
  });

  it('reads in chunks, so a big organisation cannot truncate silently', async () => {
    const { client, rec } = stub(fixture());
    const ids = Array.from({ length: 250 }, (_, i) => `s${i}`);
    await loadCurrentSalaryRows(client, ids);
    expect(rec.touched.filter((t) => t === 'hr_staff_salaries')).toHaveLength(3);
  });
});

// ============================================================================
// 2. Basic: recorded vs not recorded
// ============================================================================

describe('payslipPayFor — basic is used as recorded, never computed', () => {
  it('with a recorded basic, the provident fund is worked out from it', () => {
    const pay = payslipPayFor({ monthlyGross: 30000, recordedBasic: 12000, factor: 1, policies: POLICIES });

    expect(pay.basicPay).toBe(12000);
    expect(pay.notWorkedOut).toEqual([]);
    expect(pay.deductions.pf).toBe(1440); // 12% of 12000
    expect(pay.lopAdjustedGross).toBe(30000);
  });

  it('with NO recorded basic: basic is null, PF is not worked out and not deducted', () => {
    const pay = payslipPayFor({ monthlyGross: 30000, recordedBasic: null, factor: 1, policies: POLICIES });

    expect(pay.basicPay).toBeNull();
    expect(pay.notWorkedOut).toEqual(['PF']);
    expect(pay.deductions.pf).toBe(0);
    // Nothing else is invented from the gross either: the only deduction left
    // at this gross is the professional-tax slab.
    expect(pay.deductions.total).toBe(135);
    expect(pay.deductions.netPay).toBe(30000 - 135);
  });

  it('a basic of 0 counts as not recorded, not as "PF is 0"', () => {
    const pay = payslipPayFor({ monthlyGross: 30000, recordedBasic: 0, factor: 1, policies: POLICIES });
    expect(pay.basicPay).toBeNull();
    expect(pay.notWorkedOut).toEqual(['PF']);
  });

  it('keeps loss of pay: the gross is cut by the paid-days factor, the recorded basic is not', () => {
    const pay = payslipPayFor({ monthlyGross: 22000, recordedBasic: 10000, factor: 19 / 22, policies: POLICIES });

    expect(pay.lopAdjustedGross).toBe(19000);
    expect(pay.lopAmount).toBe(3000);
    expect(pay.basicPay).toBe(10000);
    // PF on the cut basic, not the full one.
    expect(pay.deductions.pf).toBe(Math.round((Math.round(10000 * (19 / 22)) * 12) / 100));
  });
});

// ============================================================================
// 3 + 4. End to end through the generator
// ============================================================================

describe('PayslipGenerator — pay from the current monthly gross', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pays from the row in force, lists the person with no current salary, and prints "basic not recorded"', async () => {
    const { client, rec } = stub(fixture());
    const preview = await PayslipGenerator.previewLop(client, 'period-1');

    const raised = preview.rows.find((r) => r.staff_id === 'raised')!;
    const noStart = preview.rows.find((r) => r.staff_id === 'no-start-date')!;
    const none = preview.rows.find((r) => r.staff_id === 'no-salary')!;

    expect(raised.payable).toBe(true);
    expect(raised.full_gross).toBe(7000);
    expect(raised.basic_pay).toBeNull();
    expect(raised.deductions_not_worked_out).toEqual(['PF']);

    expect(noStart.payable).toBe(true);
    expect(noStart.full_gross).toBe(22000);

    // Listed, with a reason a human can act on — not dropped.
    expect(none.payable).toBe(false);
    expect(none.reason).toBe(SALARY_SKIP_REASONS.noSalary);
    expect(preview.skipped_count).toBe(1);
    expect(preview.payable_count).toBe(2);

    expect(preview.warnings.join(' ')).toContain(BASIC_NOT_RECORDED);
    expect(preview.warnings.join(' ')).toContain('NOT taken off their net pay');
    expect(PF_NOT_WORKED_OUT).toContain('basic not recorded');

    // The never-written pay-scale table is no longer read at all.
    expect(rec.touched).not.toContain('hr_pay_scales');
    expect(rec.touched).not.toContain('hr_pay_components');
    expect(rec.touched).not.toContain('hr_staff_details');
  });

  it('a salary of 0 is skipped with its own reason', async () => {
    const fx = fixture();
    fx.hr_staff_salaries = [salary({ staff_id: 'raised', monthly_gross: 0 })];
    const { client } = stub(fx);
    const preview = await PayslipGenerator.previewLop(client, 'period-1');
    expect(preview.rows.find((r) => r.staff_id === 'raised')!.reason).toBe(SALARY_SKIP_REASONS.salaryIsZero);
  });

  it('a real run writes basic_pay NULL, no pay-scale pointer and no invented line items', async () => {
    const { client, rec } = stub(fixture());
    const result = await PayslipGenerator.generate(client, 'period-1');

    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toMatchObject({ staff_id: 'no-salary', reason: SALARY_SKIP_REASONS.noSalary });

    const slips = rec.inserts.filter((i) => i.table === 'hr_payslips').flatMap((i) => i.rows);
    expect(slips).toHaveLength(2);
    for (const s of slips) {
      expect(s.basic_pay).toBeNull();
      expect(s.pay_scale_snapshot_id).toBeNull();
    }
    expect(slips.find((s) => s.staff_id === 'raised')!.gross_amount).toBe(7000);
    expect(rec.inserts.some((i) => i.table === 'hr_payslip_line_items')).toBe(false);
  });

  it('an allowance recorded on the salary is named in a warning, not silently paid or dropped', async () => {
    const fx = fixture();
    fx.hr_staff_salaries = fx.hr_staff_salaries.map((r) =>
      r.staff_id === 'no-start-date' ? { ...r, allowance_amount: '1500.00' } : r,
    );
    const { client } = stub(fx);
    const preview = await PayslipGenerator.previewLop(client, 'period-1');

    expect(preview.rows.find((r) => r.staff_id === 'no-start-date')!.full_gross).toBe(22000);
    expect(preview.warnings.join(' ')).toMatch(/1 person\(s\) have an allowance recorded/);
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
  });

  it('a super admin without the salary key is not refused', async () => {
    const { client } = stub(fixture(), {
      user_has_permission: (a?: { permission_name?: string }) =>
        a?.permission_name !== 'hr.payroll.salary.view',
      is_super_admin: true,
    });
    const preview = await PayslipGenerator.previewLop(client, 'period-1');
    expect(preview.payable_count).toBe(2);
  });
});
