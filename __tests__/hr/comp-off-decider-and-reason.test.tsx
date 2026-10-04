// @vitest-environment jsdom
/**
 * BUG-006231 — "THERE IS NO REPLY AND DONT KNOW WHO GIVES THE COMMENTS …
 * REASON FOR REJECTION ?"
 *
 * A refused comp-off claim showed its reason cut to one line (Request tab) or
 * only in a hover tooltip (Balance tab), and never said who decided. The
 * decider now comes back from hr_comp_off_balance as decided_by_name
 * (20270602090000_hr_comp_off_record_decider.sql) and the whole reason wraps.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CompOffCredit } from '@/types/hr-comp-off';

const LONG_REASON =
  'UPLOAD BIOMETRIC REPORT FOR THE WORKED DAY. The punch record is missing for that Sunday. Attach it and claim again.';

/** Local YYYY-MM-DD, n days from today. */
const daysFromToday = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const credit = (over: Partial<CompOffCredit>): CompOffCredit => ({
  id: 'c', worked_date: daysFromToday(-10), expires_on: daysFromToday(20), credit_days: 1,
  status: 'pending', effective_status: 'pending', source: 'claim', notes: null,
  rejection_reason: null, work_location: 'inside_campus', work_place: null,
  days_until_expiry: 20, ...over,
});

const state = vi.hoisted(() => ({ credits: [] as unknown[], tab: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.tab ? `tab=${state.tab}` : ''),
}));
vi.mock('@/hooks/hr/use-time-off-context', () => ({
  useTimeOffContext: () => ({ employeeId: 'emp-1', isLoading: false, hasEmployeeRecord: true }),
}));
vi.mock('@/hooks/hr/use-leave', () => ({
  useMyApplications: () => ({ data: { data: [] }, isLoading: false, refetch: vi.fn(), isFetching: false }),
}));
vi.mock('@/hooks/hr/use-comp-off', () => ({
  useWithdrawCompOffClaim: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompOffBalance: () => ({
    data: { earned: 0, available: 0, expired: 0, consumed: 0, pending: 0, credits: state.credits },
    isLoading: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
}));
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
  PeriodFilter: () => null,
  allTimePeriod: () => ({ preset: 'all', from: '2000-01-01', to: '2999-12-31' }),
}));

import CompensatoryOffPage from '@/app/(routes)/hr/leave/compensatory-off/page';

afterEach(() => {
  cleanup();
  state.credits = [];
  state.tab = '';
});

const rejected = (over: Partial<CompOffCredit> = {}) =>
  credit({
    id: 'r1', status: 'rejected', effective_status: 'rejected',
    rejection_reason: LONG_REASON, decided_by_name: 'Priya Raman', ...over,
  });

describe.each([
  ['Request tab', ''],
  ['Balance tab', 'balance'],
])('Compensatory Off › %s › a refused claim says who refused it and why', (_label, tab) => {
  it('names the decider and shows the whole reason, wrapped — not cut to one line', () => {
    state.tab = tab;
    state.credits = [rejected()];
    render(<CompensatoryOffPage />);
    const note = screen.getByText(`Rejected by Priya Raman: ${LONG_REASON}`);
    expect(note).toBeVisible();
    expect(note).not.toHaveClass('truncate');
    expect(note).toHaveClass('whitespace-normal', 'break-words');
  });

  it('shows just the reason when no decider was recorded (older rows, the nightly auto-reject)', () => {
    state.tab = tab;
    state.credits = [rejected({ decided_by_name: null, rejection_reason: 'Auto-rejected: not decided before it expired.' })];
    render(<CompensatoryOffPage />);
    expect(screen.getByText('Auto-rejected: not decided before it expired.')).toBeInTheDocument();
    expect(screen.queryByText(/Rejected by/)).not.toBeInTheDocument();
  });
});

describe('Compensatory Off › Balance tab › an approved credit says who approved it', () => {
  it('shows "Approved by <name>"', () => {
    state.tab = 'balance';
    state.credits = [credit({ id: 'a1', status: 'approved', effective_status: 'approved', decided_by_name: 'Priya Raman' })];
    render(<CompensatoryOffPage />);
    expect(screen.getByText('Approved by Priya Raman')).toBeInTheDocument();
  });

  it('says nothing about a decider for a pending claim', () => {
    state.tab = 'balance';
    state.credits = [credit({ id: 'p1' })];
    render(<CompensatoryOffPage />);
    expect(screen.queryByText(/by /)).not.toBeInTheDocument();
  });
});
