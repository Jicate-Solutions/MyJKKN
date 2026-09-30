// @vitest-environment jsdom

/**
 * The override dialog: a box left empty KEEPS its amount (W12 review of
 * #4123, finding 5). Typing only PF must not preview — or send — ESI, income
 * tax and professional tax as 0.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PayslipOverrideDialog } from '@/features/hr/payroll/payslip-override-dialog';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const props = {
  open: true,
  onOpenChange: () => undefined,
  periodId: 'period-1',
  slipId: 'slip-1',
  staffName: 'Arun M',
  currentGross: 20000,
  currentDeductions: 2048,
};

describe('PayslipOverrideDialog', () => {
  it('each box shows the amount it keeps; typing PF alone previews the others unchanged', () => {
    render(wrap(<PayslipOverrideDialog {...props} current={{ pf: 1800, esi: 113, tds: 0, pt: 135 }} />));

    expect((screen.getByLabelText('ESI (₹)') as HTMLInputElement).placeholder).toBe('Keep ₹113');
    fireEvent.change(screen.getByLabelText('PF (₹)'), { target: { value: '2500' } });

    // 2500 + 113 + 0 + 135 — not 2500 alone.
    expect(screen.getByText('₹2,748')).toBeTruthy();
    expect(screen.getByText('₹17,252')).toBeTruthy();
  });

  it('sends only what was typed; blanks go as blank', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: { newSlipId: 'n' }, message: 'ok' }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(wrap(<PayslipOverrideDialog {...props} current={{ pf: 1800, esi: 113, tds: 0, pt: 135 }} />));

    fireEvent.change(screen.getByLabelText('PF (₹)'), { target: { value: '2500' } });
    fireEvent.change(screen.getByLabelText('Reason for Override *'), { target: { value: 'PF form' } });
    fireEvent.click(screen.getByText('Apply Override'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ pf: 2500, reason: 'PF form' });
  });

  it('a slip with nothing saved asks for all four', () => {
    render(wrap(<PayslipOverrideDialog {...props} current={{}} />));
    expect((screen.getByLabelText('PF (₹)') as HTMLInputElement).placeholder).toBe('Required');
    fireEvent.change(screen.getByLabelText('PF (₹)'), { target: { value: '2500' } });
    expect(screen.getByText(/Fill in all four amounts/)).toBeTruthy();
  });
});
