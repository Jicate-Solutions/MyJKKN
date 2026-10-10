// @vitest-environment jsdom
/**
 * Employee Salaries shows the pay in force TODAY (2026-10-09).
 *
 * A change saved today usually starts on the 1st of next month. The directory
 * used to read only the newest row, so that change showed as today's pay.
 * hr_staff_salary_directory() now also returns in_force_* (20270603090000,
 * rehearsed in supabase/tests/hr-salary-no-backdating/directory.sql). These
 * tests pin the app side:
 *  - the service turns the new numbers into numbers, and falls back to the
 *    newest row when the database still runs the older function;
 *  - the Monthly column shows today's pay and "₹X from 1 Nov 2026" under it;
 *  - a new joiner whose first pay starts next month shows a dash, not
 *    "Not set", with the scheduled line;
 *  - panel round 1 (2026-10-09): the phone card, the Excel export and the
 *    table's own sort read the pay in force too, not the newest row.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

import {
  getSalaryColumns,
  scheduledSalary,
} from '@/app/(routes)/hr/payroll/salaries/_components/salary-columns';
import {
  StaffSalaryService,
  type StaffSalaryDirectoryRow,
} from '@/lib/services/hr/payroll/staff-salary-service';

// The table component hands its rows, sort, phone card and export to DataTable;
// capture those props instead of rendering the whole grid.
let tableProps: any = null;
vi.mock('@/components/data-table/data-table', () => ({
  DataTable: (props: any) => {
    tableProps = props;
    return null;
  },
}));
vi.mock('@/hooks/hr/use-tds-slabs', () => ({ useTdsSlabs: () => ({ data: [] }) }));

import { SalaryDirectoryDataTable } from '@/app/(routes)/hr/payroll/salaries/_components/salary-directory-data-table';
import { DEFAULT_SALARY_FILTERS } from '@/app/(routes)/hr/payroll/salaries/_components/salary-filters';

afterEach(cleanup);

const BASE: StaffSalaryDirectoryRow = {
  staff_uuid: '11111111-1111-4111-8111-111111111111',
  staff_code: 'E001',
  person_name: 'Test Person',
  role_title: 'Office Assistant',
  is_active: true,
  works_at_id: 'inst-a',
  works_at_name: 'College A',
  payer_org_id: 'org-a',
  payer_org_name: 'Org A',
  salary_id: 'sal-new',
  salary_structure: 'Monthly',
  monthly_gross: 35000,
  annual_gross: 420000,
  overtime_level: 'No overtime',
  overtime_amount: null,
  eligible_for_pf: false,
  exempt_edli: false,
  eligible_for_insurance: false,
  eligible_for_gratuity: false,
  eligible_for_etf: false,
  epf_amount: null,
  eligible_for_esi: false,
  esi_amount: null,
  allowance_amount: 500,
  allowance_label: null,
  effective_from: '2026-11-01',
  notes: null,
  in_force_salary_id: 'sal-old',
  in_force_monthly_gross: 30000,
  in_force_annual_gross: 360000,
  in_force_allowance_amount: 250,
  in_force_effective_from: '2026-09-10',
};

const NEW_JOINER: StaffSalaryDirectoryRow = {
  ...BASE,
  salary_id: 'sal-first',
  monthly_gross: 18000,
  in_force_salary_id: null,
  in_force_monthly_gross: null,
  in_force_annual_gross: null,
  in_force_allowance_amount: null,
  in_force_effective_from: null,
};

const STARTED: StaffSalaryDirectoryRow = {
  ...BASE,
  effective_from: '2026-09-10',
  in_force_salary_id: 'sal-new',
  in_force_monthly_gross: 35000,
  in_force_annual_gross: 420000,
  in_force_allowance_amount: 500,
  in_force_effective_from: '2026-09-10',
};

const NO_SALARY: StaffSalaryDirectoryRow = {
  ...NEW_JOINER,
  salary_id: null,
  monthly_gross: null,
  annual_gross: null,
  effective_from: null,
};

function cell(id: string, row: StaffSalaryDirectoryRow) {
  const col = getSalaryColumns({
    canEdit: false,
    tdsSlabs: [],
    onEdit: () => {},
    onViewHistory: () => {},
    onSuggest: () => {},
  } as any).find((c) => (c as any).id === id || (c as any).accessorKey === id) as any;
  return render(<div>{col.cell({ row: { original: row } })}</div>);
}

function sortValue(id: string, row: StaffSalaryDirectoryRow) {
  const col = getSalaryColumns({
    canEdit: false,
    tdsSlabs: [],
    onEdit: () => {},
    onViewHistory: () => {},
    onSuggest: () => {},
  } as any).find((c) => (c as any).id === id) as any;
  return col.accessorFn(row, 0);
}

describe('scheduledSalary', () => {
  it('is the newest row when it is not the one in force', () => {
    expect(scheduledSalary(BASE)).toEqual({ monthlyGross: 35000, from: '2026-11-01' });
  });
  it('is the first pay of a new joiner that has not started', () => {
    expect(scheduledSalary(NEW_JOINER)).toEqual({ monthlyGross: 18000, from: '2026-11-01' });
  });
  it('is nothing when the newest row is in force, or there is no salary', () => {
    expect(scheduledSalary(STARTED)).toBeNull();
    expect(scheduledSalary(NO_SALARY)).toBeNull();
  });
});

describe('the Monthly column', () => {
  it("shows today's pay, with next month's raise and its start date under it", () => {
    cell('monthly_gross', BASE);
    expect(screen.getByText('₹30,000')).toBeTruthy();
    expect(screen.getByText(/₹35,000 from 1 Nov 2026/)).toBeTruthy();
  });

  it('shows one figure and no line when the newest row is in force', () => {
    cell('monthly_gross', STARTED);
    expect(screen.getByText('₹35,000')).toBeTruthy();
    expect(screen.queryByText(/ from /)).toBeNull();
  });

  it('shows a dash, not "Not set", for a new joiner whose first pay starts next month', () => {
    cell('monthly_gross', NEW_JOINER);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText(/₹18,000 from 1 Nov 2026/)).toBeTruthy();
    expect(screen.queryByText('Not set')).toBeNull();
  });

  it('shows "Not set" when no salary is recorded', () => {
    cell('monthly_gross', NO_SALARY);
    expect(screen.getByText('Not set')).toBeTruthy();
  });

  it('sorts by the pay in force', () => {
    expect(sortValue('monthly_gross', BASE)).toBe(30000);
  });
});

describe('Annual gross and Total monthly use the pay in force', () => {
  it('annual gross', () => {
    cell('annual_gross', BASE);
    expect(screen.getByText('₹3,60,000')).toBeTruthy();
  });
  it('total monthly = gross + allowance in force', () => {
    cell('total_monthly', BASE);
    expect(screen.getByText('₹30,250')).toBeTruthy();
    expect(sortValue('total_monthly', BASE)).toBe(30250);
  });
});

describe('StaffSalaryService.listDirectory', () => {
  const rpcReturning = (data: unknown[]) =>
    ({ rpc: async () => ({ data, error: null }) }) as any;

  it('turns the in-force numbers (strings over PostgREST) into numbers', async () => {
    const [r] = await StaffSalaryService.listDirectory(
      rpcReturning([
        {
          ...BASE,
          monthly_gross: '35000.00',
          in_force_monthly_gross: '30000.00',
          in_force_annual_gross: '360000.00',
          in_force_allowance_amount: '250.00',
        },
      ])
    );
    expect(r.in_force_monthly_gross).toBe(30000);
    expect(r.in_force_annual_gross).toBe(360000);
    expect(r.in_force_allowance_amount).toBe(250);
    expect(r.monthly_gross).toBe(35000);
  });

  it('keeps nothing-in-force as null', async () => {
    const [r] = await StaffSalaryService.listDirectory(rpcReturning([{ ...NEW_JOINER }]));
    expect(r.in_force_salary_id).toBeNull();
    expect(r.in_force_monthly_gross).toBeNull();
  });

  it('on the older function (no in_force_* columns), the newest row stands in', async () => {
    const old: Record<string, unknown> = { ...BASE, monthly_gross: '35000.00' };
    for (const k of Object.keys(old)) if (k.startsWith('in_force_')) delete old[k];
    const [r] = await StaffSalaryService.listDirectory(rpcReturning([old]));
    expect(r.in_force_salary_id).toBe('sal-new');
    expect(r.in_force_monthly_gross).toBe(35000);
    expect(scheduledSalary(r)).toBeNull();
  });
});

describe('the phone card, the export and the sort read the pay in force (panel round 1)', () => {
  function mountTable(rows: StaffSalaryDirectoryRow[]) {
    tableProps = null;
    render(
      <SalaryDirectoryDataTable
        rows={rows}
        filters={DEFAULT_SALARY_FILTERS}
        canEdit={false}
        onEdit={() => {}}
        onViewHistory={() => {}}
        onSuggest={() => {}}
      />
    );
    return tableProps;
  }

  it("the phone card shows today's pay, with the change saved for later under it", () => {
    const props = mountTable([BASE]);
    render(<div>{props.renderMobileRow(BASE)}</div>);
    expect(screen.getByText('₹30,000')).toBeTruthy();
    expect(screen.getByText(/₹35,000 from 1 Nov 2026/)).toBeTruthy();
    expect(screen.queryByText('₹35,000')).toBeNull();
  });

  it('the phone card shows a dash for a first pay that has not started, and "Not set" with no salary', () => {
    const props = mountTable([NEW_JOINER, NO_SALARY]);
    const { unmount } = render(<div>{props.renderMobileRow(NEW_JOINER)}</div>);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText(/₹18,000 from 1 Nov 2026/)).toBeTruthy();
    unmount();
    render(<div>{props.renderMobileRow(NO_SALARY)}</div>);
    expect(screen.getByText('Not set')).toBeTruthy();
  });

  it('the export gives the pay in force, and the change saved for later in its own columns', () => {
    const props = mountTable([BASE]);
    const out = props.exportConfig.transformFunction(BASE);
    expect(out).toMatchObject({
      monthly: 30000,
      annual: 360000,
      effective: '2026-09-10',
      next_monthly: 35000,
      next_from: '2026-11-01',
    });
    expect(props.exportConfig.headers).toEqual(expect.arrayContaining(['next_monthly', 'next_from']));
    const started = props.exportConfig.transformFunction(STARTED);
    expect(started).toMatchObject({ monthly: 35000, next_monthly: '', next_from: '' });
  });

  it('sorting by Monthly, Annual gross or Total monthly orders by the pay in force', async () => {
    // Newest rows say A > B; the pay in force says B > A.
    const a: StaffSalaryDirectoryRow = { ...BASE, staff_uuid: 'a', person_name: 'A' };
    const b: StaffSalaryDirectoryRow = {
      ...STARTED,
      staff_uuid: 'b',
      person_name: 'B',
      monthly_gross: 32000,
      annual_gross: 384000,
      in_force_monthly_gross: 32000,
      in_force_annual_gross: 384000,
      in_force_allowance_amount: 0,
    };
    const props = mountTable([a, b]);
    for (const sort_by of ['monthly_gross', 'annual_gross', 'total_monthly']) {
      const res = await props.fetchDataFn({ page: 1, limit: 10, sort_by, sort_order: 'desc' });
      expect(res.data.map((r: StaffSalaryDirectoryRow) => r.person_name)).toEqual(['B', 'A']);
    }
  });
});
