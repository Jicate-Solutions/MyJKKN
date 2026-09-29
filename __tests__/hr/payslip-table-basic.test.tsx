// @vitest-environment jsdom

/**
 * The payslip table prints "basic not recorded" rather than a number
 * (Director ruling, 2026-09-30).
 *
 * Payslips now take pay from each person's monthly gross, and no per-person
 * basic is recorded, so hr_payslips.basic_pay is NULL. Before this change the
 * table did `formatINR(slip.basic_pay)` and `gross - basic`, which would print
 * ₹0 as the basic and the whole gross as "allowances" — two invented figures.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { PayslipTable } from '@/features/hr/payroll/payslip-table';
import type { PayslipWithStaff } from '@/hooks/hr/payroll/use-payroll-payslips';

afterEach(() => cleanup());

function slip(over: Partial<PayslipWithStaff>): PayslipWithStaff {
  return {
    id: 'slip-1',
    period_id: 'p1',
    staff_id: 's1',
    engine_type: 'non_teaching',
    basic_pay: null,
    pay_scale_snapshot_id: null,
    working_days_attended: 22,
    lop_days: 0,
    gross_amount: 30000,
    total_deductions: 135,
    net_amount: 29865,
    payment_mode: 'neft',
    bank_file_batch_id: null,
    cheque_roll_batch_id: null,
    pdf_storage_path: null,
    superseded_by: null,
    correction_type: 'initial',
    reason: null,
    created_at: '2026-09-30T00:00:00Z',
    staff: { id: 's1', first_name: 'Arun', last_name: 'M', designation: 'Clerk' },
    ...over,
  };
}

describe('PayslipTable — basic', () => {
  it('prints "basic not recorded" and no invented allowance where none is recorded', () => {
    render(<PayslipTable payslips={[slip({})]} periodLabel="August 2026" />);

    const cell = screen.getAllByTestId('basic-not-recorded')[0];
    expect(cell.textContent).toBe('basic not recorded');
    expect(screen.getAllByText('PF not worked out: basic not recorded').length).toBeGreaterThan(0);
    // The gross is not passed off as allowances, and no ₹0 basic appears.
    expect(screen.queryByText('₹0')).toBeNull();
  });

  it('prints a recorded basic as a figure', () => {
    render(
      <PayslipTable
        payslips={[slip({ basic_pay: 12000, gross_amount: 30000 })]}
        periodLabel="August 2026"
      />,
    );

    expect(screen.queryByTestId('basic-not-recorded')).toBeNull();
    expect(screen.getAllByText('₹12,000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹18,000').length).toBeGreaterThan(0); // allowances = gross - basic
  });

  it('does not total a basic column that has gaps', () => {
    render(
      <PayslipTable
        payslips={[
          slip({ id: 'a', basic_pay: 12000 }),
          slip({ id: 'b', staff_id: 's2', basic_pay: null }),
        ]}
        periodLabel="August 2026"
      />,
    );

    const footer = document.querySelector('tfoot') as HTMLElement;
    // Basic and allowance totals are withheld, gross is still totalled.
    expect(within(footer).getAllByText('—')).toHaveLength(2);
    expect(within(footer).getByText('₹60,000')).toBeTruthy();
  });
});
