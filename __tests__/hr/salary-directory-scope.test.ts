/**
 * Employee Salaries — WHICH PEOPLE THE SCREEN COUNTS.
 *
 * THE NUMBERS HERE ARE PRODUCTION FIGURES, measured 2026-08-31, not invented:
 *
 *   755  active staff, all employment categories
 *  -161  active staff in categories with included_in_hr = false
 *        (Ayaah 105, Driver 31, Security 15, Warden 5, Hostel 4, Cooking 1)
 *   ----
 *   594  active HR staff  <- what HR Directory and Payroll Organisation show
 *   + 22  RELIEVED staff still carrying an unsuperseded salary
 *   ----
 *   616  rows hr_staff_salary_directory() returns
 *
 * The category half of that subtraction is enforced in Postgres — the RPC
 * selects FROM v_hr_staff — and is not what this file tests. What it pins down
 * is the second half: the screen used to open on all 616 and therefore
 * disagreed with the other two HR screens by 22 people, which read as a
 * category leak and was not one.
 *
 * THE REGRESSION THIS GUARDS is someone setting the default status back to
 * 'all'. That is a one-word edit with no type error, no test failure anywhere
 * else, and no visible symptom beyond a headcount that quietly stops matching
 * the rest of HR.
 *
 * Run: npx vitest run __tests__/hr/salary-directory-scope.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SALARY_FILTERS,
  matchesSalaryFilters,
  type SalaryFilterState,
} from '@/app/(routes)/hr/payroll/salaries/_components/salary-filters';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

const ACTIVE = 594;
const RELIEVED = 22;
const ACTIVE_SALARIED = 347;
const ACTIVE_NO_PAYER = 16;

function row(i: number, over: Partial<StaffSalaryDirectoryRow>): StaffSalaryDirectoryRow {
  return {
    staff_uuid: `staff-${i}`,
    staff_code: `NOT${i}`,
    person_name: `Person ${i}`,
    role_title: null,
    is_active: true,
    works_at_id: 'inst-1',
    works_at_name: 'JKKN Main Office',
    payer_org_id: 'org-1',
    payer_org_name: 'JKKN Educational Trust',
    salary_id: null,
    salary_structure: null,
    monthly_gross: null,
    annual_gross: null,
    overtime_level: null,
    overtime_amount: null,
    eligible_for_pf: false,
    exempt_edli: false,
    eligible_for_insurance: false,
    eligible_for_gratuity: false,
    eligible_for_etf: false,
    effective_from: null,
    notes: null,
    ...over,
  };
}

/**
 * The RPC payload as production returns it: 594 active (347 of them salaried,
 * 16 of them without a payer) plus the 22 relieved, every one of which is
 * salaried — that is the only reason `OR sal.id IS NOT NULL` admits them.
 */
const directory: StaffSalaryDirectoryRow[] = [
  ...Array.from({ length: ACTIVE }, (_, i) =>
    row(i, {
      is_active: true,
      salary_id: i < ACTIVE_SALARIED ? `sal-${i}` : null,
      monthly_gross: i < ACTIVE_SALARIED ? 15_000 : null,
      payer_org_id: i < ACTIVE_NO_PAYER ? null : 'org-1',
    }),
  ),
  ...Array.from({ length: RELIEVED }, (_, i) =>
    row(1000 + i, { is_active: false, salary_id: `sal-r-${i}`, monthly_gross: 28_792 }),
  ),
];

const scope = (f: Partial<SalaryFilterState> = {}) =>
  directory.filter((r) => matchesSalaryFilters(r, { ...DEFAULT_SALARY_FILTERS, ...f }));

describe('the default scope matches the rest of the HR module', () => {
  it('opens on active employees, not every row the RPC returned', () => {
    expect(DEFAULT_SALARY_FILTERS.status).toBe('active');
  });

  it('counts 594 by default — the same population HR Directory shows', () => {
    expect(scope()).toHaveLength(ACTIVE);
  });

  it('does not count the 22 relieved employees the RPC still returns', () => {
    expect(directory).toHaveLength(ACTIVE + RELIEVED);
    expect(scope().every((r) => r.is_active)).toBe(true);
  });
});

describe('the relieved employees stay reachable', () => {
  it('is one filter change away, not dropped from the module', () => {
    expect(scope({ status: 'relieved' })).toHaveLength(RELIEVED);
  });

  it('still has an unsuperseded salary — which is why the RPC admits them', () => {
    expect(scope({ status: 'relieved' }).every((r) => r.salary_id !== null)).toBe(true);
  });

  it("'all' widens back to the full RPC payload", () => {
    expect(scope({ status: 'all' })).toHaveLength(ACTIVE + RELIEVED);
  });
});

describe('the money the cards report', () => {
  /**
   * Not a restatement of the reducer — the point is the DELTA. Summing the
   * whole payload put 6,33,440 a month (76 lakh a year) against a card labelled
   * "Monthly commitment" for people the organisation no longer pays.
   */
  it('excludes salaries still attached to relieved staff', () => {
    const monthlyOver = (rows: StaffSalaryDirectoryRow[]) =>
      rows.reduce((sum, r) => sum + (r.monthly_gross ?? 0), 0);

    const active = monthlyOver(scope());
    const everything = monthlyOver(scope({ status: 'all' }));

    expect(active).toBe(ACTIVE_SALARIED * 15_000);
    expect(everything - active).toBe(RELIEVED * 28_792);
    expect(everything).toBeGreaterThan(active);
  });
});

describe('the other statuses are unchanged', () => {
  it("'awaiting' still means active with no salary", () => {
    expect(scope({ status: 'awaiting' })).toHaveLength(ACTIVE - ACTIVE_SALARIED);
  });

  it("'no_payer' reaches the 16 active people with nobody to pay them", () => {
    expect(scope({ status: 'no_payer' })).toHaveLength(ACTIVE_NO_PAYER);
  });

  it("'salaried' spans relieved staff too, since it releases the active test", () => {
    expect(scope({ status: 'salaried' })).toHaveLength(ACTIVE_SALARIED + RELIEVED);
  });
});
