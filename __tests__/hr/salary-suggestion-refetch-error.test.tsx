// @vitest-environment jsdom
/**
 * The Suggest panel with the REAL hook and a real QueryClient: when a re-ask
 * fails, React Query keeps the previous answer in `data` and `isFetching` goes
 * back to false. The panel must not then show the old figure or let it be
 * carried into Update salary (skeptic repro on PR #4119, 29 Sep 2026: first ask
 * 24,500, panel closed and reopened, second ask 500 — the old figure stayed
 * and "Use this figure" still handed over 24,500).
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-refetch-error.test.tsx
 */
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

vi.mock('next/link', () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

import { SalarySuggestionSheet } from '@/app/(routes)/hr/payroll/salaries/_components/salary-suggestion-sheet';

const ROW = {
  staff_uuid: '11111111-1111-4111-8111-111111111111',
  person_name: 'Test Person',
  role_title: 'Office Assistant',
  works_at_name: 'College A',
} as StaffSalaryDirectoryRow;

const PAYLOAD = {
  ruleSource: 'group',
  ruleUpdatedAt: null,
  suggestion: {
    verdict: 'suggested',
    lines: [{ label: 'Band floor for Office Assistant', amount: 20000, note: 'floor' }],
    suggested: 24500,
    computed: 24500,
    bandMin: 20000,
    bandMax: 30000,
    currentMonthlyPay: 21000,
    extrasEligible: [],
    reasons: [],
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Suggest panel after a failed re-ask', () => {
  it('drops the old figure and offers no "Use this figure"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(PAYLOAD), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Could not work out the suggestion.' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } } });
    const onUseFigure = vi.fn();
    const ui = (row: StaffSalaryDirectoryRow | null) => (
      <QueryClientProvider client={client}>
        <SalarySuggestionSheet row={row} onOpenChange={() => {}} canManage canEditRule={false} onUseFigure={onUseFigure} />
      </QueryClientProvider>
    );

    const { rerender } = render(ui(ROW));
    expect(await screen.findByTestId('suggested-figure')).toHaveTextContent('₹24,500');
    expect(screen.getByRole('button', { name: 'Use this figure' })).toBeEnabled();

    rerender(ui(null));
    rerender(ui(ROW));
    expect(await screen.findByText('Could not work out the suggestion.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('suggestion-working')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The failed ask left the old answer in the cache — the panel must not use it.
    expect(client.getQueryData(['hr', 'salary-suggestion', ROW.staff_uuid])).toBeTruthy();
    expect(screen.queryByTestId('suggested-figure')).toBeNull();
    expect(screen.queryByText(/24,500/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use this figure' })).toBeNull();
    expect(onUseFigure).not.toHaveBeenCalled();
  });
});
