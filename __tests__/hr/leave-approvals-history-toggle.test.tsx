// @vitest-environment jsdom
/**
 * BUG-006247: "i cant see the previous history of approvals (past months)".
 * The queue already carries the last 12 months of decided requests, but the
 * table opened on Open only and the way to history was buried in the Status
 * filter. A visible "Past decisions" control now switches to them.
 *
 * Same thin DataTable stand-in as leave-approval-confirmations.test.tsx: it
 * runs the page's real fetchDataFn, so the real filter decides what shows.
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { HRLeaveApprovalQueueRow } from '@/types/hr';

const base = {
  institution_id: 'inst-1', institution_name: 'JKKN College of Engineering and Technology',
  department_id: null, department_name: null, hr_organization_id: 'org-1', hr_organization_name: null,
  leave_type_id: 'lt-cl', leave_type_name: 'Casual Leave', leave_type_code: 'CL',
  request_category: 'leave' as const, start_time: null, end_time: null,
  duration_type: 'full' as const, duration_minutes: null, reason: 'Family function',
  is_emergency: false, status: 'pending' as const, created_at: '2026-09-10T10:00:00Z',
  applied_by: null, applied_by_name: null, applied_on_behalf: false,
  final_approver_id: null, final_approver_name: null, final_decided_at: null, rejection_reason: null,
  is_own: false, can_decide: true, waiting_on_me: true, biometric_gap_from: null, documents: [],
  current_step: 0, chain_length: 1, step_is_final: true,
  revoked_at: null, revoked_by_name: null, revoke_reason: null,
};
const waiting = {
  ...base, id: 'app-open', employee_id: 'emp-1', staff_name: 'Anita K', staff_code: 'CET010',
  start_date: '2026-10-14', end_date: '2026-10-15', total_days: 2,
} as HRLeaveApprovalQueueRow;
/** Decided in a past month. */
const decided = {
  ...base, id: 'app-july', employee_id: 'emp-2', staff_name: 'Ravi M', staff_code: 'CET020',
  start_date: '2026-07-03', end_date: '2026-07-03', total_days: 1, status: 'approved',
  final_approver_id: 'p-1', final_approver_name: 'HOD', final_decided_at: '2026-07-02T09:00:00Z',
  waiting_on_me: false, can_decide: false,
} as unknown as HRLeaveApprovalQueueRow;

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/hr/use-hr-leave-types', () => ({
  useCanApproveLeave: () => ({ data: true, isLoading: false }),
}));
vi.mock('@/hooks/hr/use-leave-approval-flows', () => ({
  useLeaveApprovalQueue: () => ({
    data: [waiting, decided], error: null, isLoading: false, refetch: vi.fn(), isFetching: false, dataUpdatedAt: 1,
  }),
  useLeaveRevokeBlockReason: () => ({ data: null, isFetching: false }),
}));
vi.mock('@/hooks/hr/use-leave', () => ({
  useDecideApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/hr/use-comp-off', () => ({ usePendingCompOffClaims: () => ({ data: [] }) }));
vi.mock('@/app/(routes)/hr/leave/_components/time-off-shell', () => ({
  // Drops the shell's own props and renders its content as-is.
  TimeOffShell: ({ title: _title, subTabs: _subTabs, ...rest }: any) => <div {...rest} />,
}));
vi.mock('@/app/(routes)/hr/leave/_components/approval-detail-sheet', () => ({ ApprovalDetailSheet: () => null }));
vi.mock('@/app/(routes)/hr/leave/_components/leave-document-viewer', () => ({ LeaveDocumentViewer: () => null }));
vi.mock('@/app/(routes)/hr/leave/_components/comp-off-claims-queue', () => ({ CompOffClaimsQueue: () => null }));

vi.mock('@/components/data-table/data-table', async () => {
  const React = await import('react');
  return {
    DataTable: (props: any) => {
      const { fetchDataFn } = props;
      const [rows, setRows] = React.useState<any[]>([]);
      React.useEffect(() => {
        let alive = true;
        fetchDataFn({ page: 1, limit: 50, search: '' }).then((r: any) => {
          if (alive) setRows(r.data);
        });
        return () => { alive = false; };
      }, [fetchDataFn]);
      return (
        <>
        {props.renderToolbarContent?.({ selectedRows: [], totalSelectedCount: 0, resetSelection: () => {} })}
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.staff_name}</td></tr>
            ))}
          </tbody>
        </table>
        </>
      );
    },
  };
});

import LeaveApprovalsPage from '@/app/(routes)/hr/leave/approvals/page';

afterEach(() => cleanup());

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

it('opens on requests waiting for a decision and shows past months behind a visible control', async () => {
  render(<LeaveApprovalsPage />);

  expect(await screen.findByText('Anita K')).toBeInTheDocument();
  expect(screen.queryByText('Ravi M')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /past decisions/i }));

  expect(await screen.findByText('Ravi M')).toBeInTheDocument();
  expect(screen.queryByText('Anita K')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /past decisions/i })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: /waiting for a decision/i }));
  expect(await screen.findByText('Anita K')).toBeInTheDocument();
  expect(screen.queryByText('Ravi M')).not.toBeInTheDocument();
});

it('"Past decisions" is never empty just because "Waiting on me" was on, and the two exclude each other', async () => {
  render(<LeaveApprovalsPage />);
  expect(await screen.findByText('Anita K')).toBeInTheDocument();

  const mine = screen.getByRole('button', { name: /waiting on me/i });
  fireEvent.click(mine);
  expect(await screen.findByText('Anita K')).toBeInTheDocument();

  // Waiting on me matches only rows still waiting; switching to history must
  // drop it, or every past decision is filtered out.
  fireEvent.click(screen.getByRole('button', { name: /past decisions/i }));
  expect(await screen.findByText('Ravi M')).toBeInTheDocument();
  expect(screen.queryByText('Anita K')).not.toBeInTheDocument();

  // And turning Waiting on me back on returns to the waiting view.
  fireEvent.click(screen.getByRole('button', { name: /waiting on me/i }));
  expect(await screen.findByText('Anita K')).toBeInTheDocument();
  expect(screen.queryByText('Ravi M')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /waiting for a decision/i })).toHaveAttribute('aria-pressed', 'true');
});
