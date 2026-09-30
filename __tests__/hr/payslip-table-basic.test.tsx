// @vitest-environment jsdom

/**
 * The payslip table (Director rulings, 2026-09-30):
 *   - prints "basic not recorded" rather than a number: no per-person basic is
 *     recorded, so hr_payslips.basic_pay is NULL;
 *   - shows the allowance and the PF / ESI saved on the slip, as saved
 *     (20270523090000) — PF is the amount HR typed, or the amount typed in a
 *     manual override, and is never described as "not worked out".
 *
 * Before the basic change the table did `formatINR(slip.basic_pay)` and
 * `gross - basic`, which would print ₹0 as the basic and the whole gross as
 * "allowances" — two invented figures.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { PayslipTable } from '@/features/hr/payroll/payslip-table';
import type { PayslipWithStaff } from '@/hooks/hr/payroll/use-payroll-payslips';

afterEach(() => cleanup());

const PERSON = { id: 's1', first_name: 'Arun', last_name: 'M', designation: 'Clerk' };

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
    staff: PERSON,
    ...over,
  };
}

describe('PayslipTable — basic', () => {
  it('says "No PF (not eligible)" for a person HR marked not eligible, never a bare ₹0', () => {
    render(
      <PayslipTable
        payslips={[slip({ pf_deduction: 0, esi_deduction: 0, tds_deduction: 0, pt_deduction: 0, pf_exempt: true, esi_exempt: false })]}
        periodLabel="Aug 2026"
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('No PF (not eligible)');
    expect(text).toContain('ESI ₹0');
    expect(text).not.toContain('PF ₹0');
  });

  it('prints "basic not recorded" and no invented allowance where none is recorded', () => {
    render(<PayslipTable payslips={[slip({})]} periodLabel="August 2026" />);

    const cell = screen.getAllByTestId('basic-not-recorded')[0];
    expect(cell.textContent).toBe('basic not recorded');
    // The gross is not passed off as allowances, and no ₹0 basic appears.
    expect(screen.queryByText('₹0')).toBeNull();
    expect(screen.queryByText(/not worked out/)).toBeNull();
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

describe('PayslipTable — allowance and PF as saved on the slip', () => {
  it('shows the allowance paid and the PF HR typed', () => {
    render(
      <PayslipTable
        payslips={[
          slip({
            gross_amount: 20000,
            allowance_paid: 2000,
            pf_deduction: 1500,
            esi_deduction: 113,
            tds_deduction: 0,
            pt_deduction: 0,
            total_deductions: 1613,
            net_amount: 18387,
          }),
        ]}
        periodLabel="August 2026"
      />,
    );

    const row = screen.getAllByTestId('statutory-line')[0];
    expect(row.textContent).toBe('PF ₹1,500 · ESI ₹113');
    const footer = document.querySelector('tfoot') as HTMLElement;
    expect(within(footer).getByText('₹2,000')).toBeTruthy();
    expect(screen.queryByText(/not worked out/)).toBeNull();
  });

  it('an adjustment slip with a PF typed by HR shows that PF, not "not worked out"', () => {
    render(
      <PayslipTable
        payslips={[
          slip({
            correction_type: 'adjustment',
            reason: 'PF corrected',
            allowance_paid: 0,
            pf_deduction: 2500,
            esi_deduction: 0,
            tds_deduction: 0,
            pt_deduction: 135,
            total_deductions: 2635,
            net_amount: 27365,
          }),
        ]}
        periodLabel="August 2026"
      />,
    );
    expect(screen.getAllByTestId('statutory-line')[0].textContent).toBe('PF ₹2,500 · ESI ₹0');
    expect(screen.queryByText(/not worked out/)).toBeNull();
  });

  it('a slip made before deductions were saved one by one shows no PF line at all (nothing guessed)', () => {
    render(<PayslipTable payslips={[slip({})]} periodLabel="August 2026" />);
    expect(screen.queryByTestId('statutory-line')).toBeNull();
  });
});
