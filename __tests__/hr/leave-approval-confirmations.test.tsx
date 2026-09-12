// @vitest-environment jsdom
/**
 * Leave / Short Time Off approvals: every approve and every reject — one
 * request or a bulk selection — is confirmed first, and bulk Reject sits beside
 * bulk Approve (2026-09-11).
 *
 * The shared DataTable is replaced with a thin stand-in that runs the real
 * fetchDataFn, renders the real row cells and hands the real toolbar a
 * selection; everything the page owns (dialogs, bulk rules, decisions) runs as
 * shipped.
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HRLeaveApprovalQueueRow } from '@/types/hr';

const mutateAsync = vi.fn();
const revokeAsync = vi.fn();
const table = vi.hoisted(() => ({ selectAll: false, reset: vi.fn() }));

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
const anita = {
  ...base, id: 'app-anita', employee_id: 'emp-1', staff_name: 'Anita K', staff_code: 'CET010',
  start_date: '2026-09-14', end_date: '2026-09-15', total_days: 2,
} as HRLeaveApprovalQueueRow;
/** Final step with a missing biometric file: approve is blocked, reject is not. */
const ravi = {
  ...base, id: 'app-ravi', employee_id: 'emp-2', staff_name: 'Ravi M', staff_code: 'CET020',
  start_date: '2026-09-01', end_date: '2026-09-01', total_days: 1, biometric_gap_from: '2026-09-01',
} as HRLeaveApprovalQueueRow;
/** The approver's own request. */
const self = {
  ...base, id: 'app-self', employee_id: 'emp-3', staff_name: 'Me Myself', staff_code: 'CET030',
  start_date: '2026-09-20', end_date: '2026-09-20', total_days: 1, is_own: true, can_decide: false,
} as HRLeaveApprovalQueueRow;

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/hr/use-hr-leave-types', () => ({
  useCanApproveLeave: () => ({ data: true, isLoading: false }),
}));
vi.mock('@/hooks/hr/use-leave-approval-flows', () => ({
  useLeaveApprovalQueue: () => ({
    data: [anita, ravi, self], error: null, isLoading: false, refetch: vi.fn(), isFetching: false, dataUpdatedAt: 1,
  }),
  // Asked per row when the revoke dialog opens; no row here is approved.
  useLeaveRevokeBlockReason: () => ({ data: null, isFetching: false }),
}));
vi.mock('@/hooks/hr/use-leave', () => ({
  useDecideApplication: () => ({ mutateAsync, isPending: false }),
  useRevokeApplication: () => ({ mutateAsync: revokeAsync, isPending: false }),
}));
vi.mock('@/hooks/hr/use-comp-off', () => ({ usePendingCompOffClaims: () => ({ data: [] }) }));
vi.mock('@/app/(routes)/hr/leave/_components/time-off-shell', () => ({
  TimeOffShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
      const cols = props.getColumns();
      const cell = (id: string, r: any) =>
        cols
          .find((c: any) => (c.id ?? c.accessorKey) === id)
          .cell({ row: { original: r, getIsSelected: () => false, toggleSelected: () => {} } });
      return (
        <div>
          <div data-testid="toolbar">
            {props.renderToolbarContent?.({
              selectedRows: table.selectAll ? rows : [],
              allSelectedIds: [],
              totalSelectedCount: table.selectAll ? rows.length : 0,
              resetSelection: table.reset,
            })}
          </div>
          <table>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{cell('staff_name', r)}</td>
                  <td>{cell('actions', r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },
  };
});

import LeaveApprovalsPage from '@/app/(routes)/hr/leave/approvals/page';

// Block bodies: a function returned from beforeEach runs as a cleanup hook.
beforeEach(() => {
  mutateAsync.mockResolvedValue({ id: 'x', employee_id: 'y' });
  table.selectAll = false;
});
afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
  table.reset.mockReset();
});

// Radix measures the open menu with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

/** Opens a row's three-dot menu (Radix opens it on Enter) and returns it. */
const openRowMenu = async (name: string) => {
  const row = (await screen.findByText(name)).closest('tr') as HTMLElement;
  fireEvent.keyDown(within(row).getByRole('button', { name: `Actions for ${name}` }), { key: 'Enter' });
  return screen.findByRole('menu');
};

const pick = async (name: string, item: RegExp) => {
  const menu = await openRowMenu(name);
  fireEvent.click(within(menu).getByRole('menuitem', { name: item }));
};

describe('Leave approvals — one request at a time', { timeout: 20_000 }, () => {
  it('Approve asks first, names the request, and decides nothing until confirmed', async () => {
    render(<LeaveApprovalsPage />);
    await pick('Anita K', /^approve$/i);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Approve this request?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Casual Leave · 14\/09\/2026 → 15\/09\/2026 · 2 days/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /^approve$/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ applicationId: 'app-anita', decision: 'approve' });
  });

  it('Cancel on the approve confirmation decides nothing', async () => {
    render(<LeaveApprovalsPage />);
    await pick('Anita K', /^approve$/i);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('a refused approval stays in the dialog with the reason', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Insufficient Casual Leave balance'));
    render(<LeaveApprovalsPage />);
    await pick('Anita K', /^approve$/i);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^approve$/i }));
    expect(await within(dialog).findByText('Insufficient Casual Leave balance')).toBeInTheDocument();
  });

  it('Reject confirms with the request named and needs a reason', async () => {
    render(<LeaveApprovalsPage />);
    await pick('Anita K', /reject/i);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Reject this request?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Casual Leave · 14\/09\/2026/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: /reject request/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: '  Exam week  ' } });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        applicationId: 'app-anita', decision: 'reject', rejection_reason: 'Exam week',
      })
    );
  });

  it('Cancel on the reject confirmation decides nothing', async () => {
    render(<LeaveApprovalsPage />);
    await pick('Anita K', /reject/i);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe('Leave approvals — bulk', { timeout: 20_000 }, () => {
  it('offers both bulk Approve and bulk Reject, and says what approve leaves out', async () => {
    table.selectAll = true;
    render(<LeaveApprovalsPage />);
    const toolbar = screen.getByTestId('toolbar');

    expect(await within(toolbar).findByRole('button', { name: /approve 1 selected/i })).toBeEnabled();
    expect(within(toolbar).getByRole('button', { name: /reject 2 selected/i })).toBeEnabled();
    expect(
      within(toolbar).getByText(/can.t approve: 1 you cannot decide, 1 missing biometric/i)
    ).toBeInTheDocument();
  });

  it('bulk approve confirms first, then approves only the eligible request', async () => {
    table.selectAll = true;
    render(<LeaveApprovalsPage />);
    const toolbar = screen.getByTestId('toolbar');

    fireEvent.click(await within(toolbar).findByRole('button', { name: /approve 1 selected/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Approve 1 request(s)?')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /approve 1 request/i }));
    await waitFor(() => expect(table.reset).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ applicationId: 'app-anita', decision: 'approve' });
  });

  it('bulk reject lists the requests, needs one reason, and sends it on each', async () => {
    table.selectAll = true;
    render(<LeaveApprovalsPage />);
    const toolbar = screen.getByTestId('toolbar');

    fireEvent.click(await within(toolbar).findByRole('button', { name: /reject 2 selected/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Reject 2 request(s)?')).toBeInTheDocument();
    expect(within(dialog).getByText('Anita K')).toBeInTheDocument();
    expect(within(dialog).getByText('Ravi M')).toBeInTheDocument();
    expect(within(dialog).queryByText('Me Myself')).not.toBeInTheDocument();

    const confirm = within(dialog).getByRole('button', { name: /reject 2 request/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'Freeze period' } });
    fireEvent.click(confirm);

    await waitFor(() => expect(table.reset).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync).toHaveBeenCalledWith({
      applicationId: 'app-anita', decision: 'reject', rejection_reason: 'Freeze period',
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      applicationId: 'app-ravi', decision: 'reject', rejection_reason: 'Freeze period',
    });
  });
});
