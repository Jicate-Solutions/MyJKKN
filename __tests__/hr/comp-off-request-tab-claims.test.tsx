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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
const spies = vi.hoisted(() => ({ refetchBookings: vi.fn(), refetchBalance: vi.fn() }));

/** Local YYYY-MM-DD, n days from today. */
const daysFromToday = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/hr/use-time-off-context', () => ({
  useTimeOffContext: () => ({ employeeId: 'emp-1', isLoading: false, hasEmployeeRecord: true }),
}));
vi.mock('@/hooks/hr/use-leave', () => ({
  useMyApplications: () => ({
    data: { data: [] }, isLoading: false, refetch: spies.refetchBookings, isFetching: false,
  }),
}));
vi.mock('@/hooks/hr/use-comp-off', () => ({
  useWithdrawCompOffClaim: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompOffBalance: () => ({
    data: { earned: 0, available: 0, expired: 0, consumed: 0, pending: 1, credits: ledger.credits },
    isLoading: false,
    refetch: spies.refetchBalance,
    isFetching: false,
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
  PeriodFilter: ({
    action,
    onRefresh,
    onChange,
  }: {
    action?: ReactNode;
    onRefresh?: () => void;
    onChange: (p: { preset: string; from: string; to: string }) => void;
  }) => (
    <div>
      {action}
      <button type="button" onClick={onRefresh}>Refresh</button>
      <button
        type="button"
        onClick={() => onChange({ preset: 'custom', from: '2098-09-01', to: '2098-09-30' })}
      >
        Narrow to Sep 2098
      </button>
    </div>
  ),
  allTimePeriod: () => ({ preset: 'all', from: '2000-01-01', to: '2999-12-31' }),
}));

import CompensatoryOffPage from '@/app/(routes)/hr/leave/compensatory-off/page';

afterEach(() => {
  cleanup();
  ledger.credits = [];
  vi.clearAllMocks();
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

  it('Refresh reloads the claims as well as the bookings', () => {
    render(<CompensatoryOffPage />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(spies.refetchBookings).toHaveBeenCalledTimes(1);
    expect(spies.refetchBalance).toHaveBeenCalledTimes(1);
  });

  it("follows the tab's Period, by the day worked", () => {
    ledger.credits = [credit({ id: 'p1' })]; // worked 15/08/2098
    render(<CompensatoryOffPage />);
    expect(screen.getByText('15/08/2098')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Narrow to Sep 2098'));
    expect(screen.queryByText('15/08/2098')).not.toBeInTheDocument();
    expect(screen.queryByText('Your worked-day claims')).not.toBeInTheDocument();
  });

  it('drops a refused claim 30 days after it lapsed; a recent one stays', () => {
    ledger.credits = [
      credit({ id: 'old', status: 'rejected', effective_status: 'rejected', worked_date: daysFromToday(-90), expires_on: daysFromToday(-60), rejection_reason: 'Old refusal' }),
      credit({ id: 'new', status: 'rejected', effective_status: 'rejected', worked_date: daysFromToday(-40), expires_on: daysFromToday(-10), rejection_reason: 'Recent refusal' }),
    ];
    render(<CompensatoryOffPage />);
    expect(screen.getByText('Recent refusal')).toBeInTheDocument();
    expect(screen.queryByText('Old refusal')).not.toBeInTheDocument();
  });

  it('does not tell a claimant with a pending claim that she has no requests', () => {
    ledger.credits = [credit({ id: 'p1' })];
    render(<CompensatoryOffPage />);
    expect(screen.queryByText(/No compensatory off requests yet/)).not.toBeInTheDocument();
    expect(screen.getByText(/your claim above is awaiting approval/)).toBeInTheDocument();
  });

  it('offers Cancel on a pending claim only, as the Balance tab does', () => {
    ledger.credits = [
      credit({ id: 'p1' }),
      credit({ id: 'r1', status: 'rejected', effective_status: 'rejected', worked_date: '2098-08-10' }),
    ];
    render(<CompensatoryOffPage />);
    expect(screen.getAllByRole('button', { name: /cancel/i })).toHaveLength(1);
  });
});
