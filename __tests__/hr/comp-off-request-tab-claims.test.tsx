// @vitest-environment jsdom
/**
 * BUG-006097 — "Compensatory off claim request applied but it's visible as not
 * applied".
 *
 * A comp off lives in two tables: the claim (hr_comp_off_credits) and the
 * booking (hr_leave_applications). The Request tab listed only bookings, so a
 * claim just submitted from that tab's own "Claim worked day" button appeared
 * nowhere on it. Claims still awaiting a decision, or refused, are now listed
 * on the Request tab too; approved ones stay on Balance and in Available.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import type { CompOffCredit } from '@/types/hr-comp-off';

const credit = (over: Partial<CompOffCredit>): CompOffCredit => ({
  id: 'c', worked_date: '2098-08-15', expires_on: '2098-09-15', credit_days: 1,
  status: 'pending', effective_status: 'pending', source: 'claim', notes: null,
  rejection_reason: null, work_location: 'inside_campus', work_place: null,
  days_until_expiry: 20, ...over,
});

const ledger = vi.hoisted(() => ({ credits: [] as unknown[] }));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/hr/use-time-off-context', () => ({
  useTimeOffContext: () => ({ employeeId: 'emp-1', isLoading: false, hasEmployeeRecord: true }),
}));
vi.mock('@/hooks/hr/use-leave', () => ({
  useMyApplications: () => ({ data: { data: [] }, isLoading: false, refetch: vi.fn(), isFetching: false }),
}));
vi.mock('@/hooks/hr/use-comp-off', () => ({
  useWithdrawCompOffClaim: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompOffBalance: () => ({
    data: { earned: 0, available: 0, expired: 0, consumed: 0, pending: 1, credits: ledger.credits },
    isLoading: false,
  }),
}));
// Renders only what the page nests inside the shell; the shell's own props
// (title, sub-tabs) are dropped.
vi.mock('@/app/(routes)/hr/leave/_components/time-off-shell', async () => {
  const { createElement } = await import('react');
  return {
    TimeOffShell: ({ title: _title, subTabs: _subTabs, ...nested }: Record<string, unknown>) =>
      createElement('div', nested),
  };
});
vi.mock('@/app/(routes)/hr/leave/_components/apply-comp-off-drawer', () => ({ ApplyCompOffDrawer: () => null }));
vi.mock('@/app/(routes)/hr/leave/_components/claim-worked-day-dialog', () => ({ ClaimWorkedDayDialog: () => null }));
vi.mock('@/app/(routes)/hr/leave/_components/period-filter', () => ({
  PeriodFilter: ({ action }: { action?: ReactNode }) => <div>{action}</div>,
  allTimePeriod: () => ({ preset: 'all', from: '2000-01-01', to: '2999-12-31' }),
}));

import CompensatoryOffPage from '@/app/(routes)/hr/leave/compensatory-off/page';

afterEach(() => {
  cleanup();
  ledger.credits = [];
});

describe('Compensatory Off › Request tab shows the claim, not only the booking', () => {
  it('lists a claim awaiting approval on the tab it was raised from', () => {
    ledger.credits = [credit({ id: 'p1' })];
    render(<CompensatoryOffPage />);
    expect(screen.getByText('Your worked-day claims')).toBeInTheDocument();
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
    expect(screen.getByText('15/08/2098')).toBeInTheDocument();
  });

  it('shows a refused claim with its reason', () => {
    ledger.credits = [
      credit({ id: 'r1', status: 'rejected', effective_status: 'rejected', rejection_reason: 'Not a holiday' }),
    ];
    render(<CompensatoryOffPage />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Not a holiday')).toBeInTheDocument();
  });

  it('leaves approved credits and HR grants to the Balance tab', () => {
    ledger.credits = [
      credit({ id: 'a1', status: 'approved', effective_status: 'approved' }),
      credit({ id: 'g1', source: 'hr_grant' }),
    ];
    render(<CompensatoryOffPage />);
    expect(screen.queryByText('Your worked-day claims')).not.toBeInTheDocument();
  });
});
