// @vitest-environment jsdom

/**
 * The payslip run's warnings REACH THE SCREEN and STAY THERE (W12 review of
 * #4123, finding 4). Before, they were only in the generate route's JSON,
 * which no screen called.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The button is for hr.payroll.manage holders only (server refuses others with
// 403). Flip this to see the panel as a viewer such as a principal or the CAO.
const perms = { canManage: true };
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasAnyPermission: perms.canManage, isSuperAdmin: false, isLoading: false }),
}));

import { PayslipRunPanel } from '@/features/hr/payroll/payslip-run-panel';
import type { HRPayrollPeriod } from '@/types/hr-payroll';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const PERIOD = {
  id: 'period-1',
  status: 'prepared',
  period_year: 2026,
  period_month: 8,
  generation_notes: null,
} as unknown as HRPayrollPeriod;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PayslipRunPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    perms.canManage = true;
  });

  it('shows no "Make payslips" button to someone without hr.payroll.manage', () => {
    perms.canManage = false;
    render(wrap(<PayslipRunPanel period={PERIOD} payslipCount={0} payslipsLoading={false} />));
    expect(screen.queryByTestId('generate-payslips')).toBeNull();
  });

  it('shows the button to a payroll manager on a prepared period with no payslips yet', () => {
    render(wrap(<PayslipRunPanel period={PERIOD} payslipCount={0} payslipsLoading={false} />));
    expect(screen.getByTestId('generate-payslips')).toBeTruthy();
  });

  it('shows the notes KEPT on the period, after a reload, with every person left off', () => {
    render(
      wrap(
        <PayslipRunPanel
          period={{
            ...PERIOD,
            status: 'cao_reviewed',
            generation_notes: {
              generated_at: '2026-09-30T10:00:00Z',
              generated: 4,
              skipped: 1,
              warnings: ['1 person(s) are marked for PF on their salary, but no PF amount is typed there'],
              skipped_people: [{ staff_id: 's2', name: 'New Joiner', reason: 'Their salary starts on 2026-10-01, after this month' }],
            },
          } as HRPayrollPeriod}
          payslipCount={4}
          payslipsLoading={false}
        />,
      ),
    );

    expect(screen.getByText('What the last payslip run said')).toBeTruthy();
    expect(screen.getByTestId('payslip-run-warnings').textContent).toContain('no PF amount is typed');
    expect(screen.getByTestId('payslip-run-skipped').textContent).toContain('New Joiner');
    expect(screen.getByTestId('payslip-run-skipped').textContent).toContain('starts on 2026-10-01');
    // Payslips exist: no second run offered.
    expect(screen.queryByTestId('generate-payslips')).toBeNull();
  });

  it('renders nothing on a period with no run and nothing to do', () => {
    const { container } = render(
      wrap(<PayslipRunPanel period={{ ...PERIOD, status: 'cao_reviewed' }} payslipCount={3} payslipsLoading={false} />),
    );
    expect(container.textContent).toBe('');
  });

  it('a prepared period with no payslips: "Make payslips" runs and shows the warnings at once', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        message: 'Generated 4 payslips (2 skipped)',
        data: {
          generated: 4,
          skipped: 2,
          errors: [
            { staff_id: 's5', name: 'Nila S', reason: 'No current salary recorded for this person' },
            { staff_id: 's6', name: 'New Joiner', reason: 'Their salary starts on 2026-10-01, after this month' },
          ],
          totals: { gross: 1, deductions: 0, net: 1 },
          warnings: ['1 person(s) have a salary that starts after this month'],
          lopDays: 0,
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(wrap(<PayslipRunPanel period={PERIOD} payslipCount={0} payslipsLoading={false} />));
    fireEvent.click(screen.getByTestId('generate-payslips'));

    await waitFor(() => expect(screen.getByTestId('payslip-run-warnings')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('/api/hr/payroll/periods/period-1/payslips', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByTestId('payslip-run-warnings').textContent).toContain('starts after this month');
    expect(screen.getByTestId('payslip-run-skipped').textContent).toContain('Nila S');
  });

  it('a refusal (403) is shown in words, not swallowed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Cannot read salaries: this account is missing hr.payroll.salary.view.' }),
      })),
    );
    render(wrap(<PayslipRunPanel period={PERIOD} payslipCount={0} payslipsLoading={false} />));
    fireEvent.click(screen.getByTestId('generate-payslips'));
    await waitFor(() => expect(screen.getByTestId('payslip-run-refusal')).toBeTruthy());
    expect(screen.getByTestId('payslip-run-refusal').textContent).toContain('hr.payroll.salary.view');
  });
});
