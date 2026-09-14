// @vitest-environment jsdom
/**
 * Revoking an APPROVED leave decision from /hr/leave/approvals (2026-09-12).
 *
 * Three things have to hold, and each of them is a bug this module has shipped
 * before in some other form:
 *
 *  - Revoke is offered on an approved row and NOT on a pending or already-revoked
 *    one, and never on your own request;
 *  - the refusal comes from the database (fn_hr_leave_revoke_block_reason) and is
 *    SHOWN, not turned into a silently greyed button — "the month is closed" and
 *    "you are not the final approver" need different fixes;
 *  - a reason is mandatory, because it is what the applicant is told.
 *
 * The shared DataTable is replaced with the same thin stand-in
 * leave-approval-confirmations.test.tsx uses: the real fetchDataFn, the real row
 * cells, the real dialogs.
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HRLeaveApprovalQueueRow } from '@/types/hr';

const revokeAsync = vi.fn();
const block = vi.hoisted(() => ({ reason: null as string | null }));

const base = {
  institution_id: 'inst-1', institution_name: 'JKKN College of Engineering and Technology',
  department_id: null, department_name: null, hr_organization_id: 'org-1', hr_organization_name: null,
  leave_type_id: 'lt-cl', leave_type_name: 'Casual Leave', leave_type_code: 'CL',
  request_category: 'leave' as const, start_time: null, end_time: null,
  duration_type: 'full' as const, duration_minutes: null, reason: 'Family function',
  is_emergency: false, created_at: '2026-09-10T10:00:00Z',
  applied_by: null, applied_by_name: null, applied_on_behalf: false,
  final_approver_id: 'prof-1', final_approver_name: 'Principal P',
  final_decided_at: '2026-09-11T04:00:00Z', rejection_reason: null,
  is_own: false, can_decide: false, waiting_on_me: false, biometric_gap_from: null, documents: [],
  current_step: 1, chain_length: 1, step_is_final: true,
  revoked_at: null, revoked_by_name: null, revoke_reason: null,
};

/** Approved and revocable. */
const anita = {
  ...base, id: 'app-anita', employee_id: 'emp-1', staff_name: 'Anita K', staff_code: 'CET010',
  status: 'approved' as const, start_date: '2026-09-14', end_date: '2026-09-15', total_days: 2,
} as HRLeaveApprovalQueueRow;
/** Already revoked — there is nothing left to take back. */
const ravi = {
  ...base, id: 'app-ravi', employee_id: 'emp-2', staff_name: 'Ravi M', staff_code: 'CET020',
  status: 'rejected' as const, start_date: '2026-09-01', end_date: '2026-09-01', total_days: 1,
  revoked_at: '2026-09-12T05:00:00Z', revoked_by_name: 'Principal P', revoke_reason: 'Approved in error',
} as HRLeaveApprovalQueueRow;
/** Still open: a decision, not a revocation. */
const sunil = {
  ...base, id: 'app-sunil', employee_id: 'emp-4', staff_name: 'Sunil B', staff_code: 'CET040',
  status: 'pending' as const, can_decide: true, waiting_on_me: true, current_step: 0,
  final_approver_id: null, final_approver_name: null, final_decided_at: null,
  start_date: '2026-09-20', end_date: '2026-09-20', total_days: 1,
} as HRLeaveApprovalQueueRow;
/** Approved, but it is the viewer's own. */
const self = {
  ...base, id: 'app-self', employee_id: 'emp-3', staff_name: 'Me Myself', staff_code: 'CET030',
  status: 'approved' as const, is_own: true,
  start_date: '2026-09-22', end_date: '2026-09-22', total_days: 1,
} as HRLeaveApprovalQueueRow;

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('react-hot-toast', () => {
  const t: any = vi.fn();
  t.success = vi.fn();
  t.error = vi.fn();
  return { default: t };
});
vi.mock('@/hooks/hr/use-hr-leave-types', () => ({
  useCanApproveLeave: () => ({ data: true, isLoading: false }),
}));
vi.mock('@/hooks/hr/use-leave-approval-flows', () => ({
  useLeaveApprovalQueue: () => ({
    data: [anita, ravi, sunil, self], error: null, isLoading: false,
    refetch: vi.fn(), isFetching: false, dataUpdatedAt: 1,
  }),
  useLeaveRevokeBlockReason: () => ({ data: block.reason, isFetching: false }),
}));
vi.mock('@/hooks/hr/use-leave', () => ({
  useDecideApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
          {/* The page's own toolbar: the status filter defaults to "open", so
              the decided rows this file is about are hidden until it is changed. */}
          <div data-testid="toolbar">
            {props.renderToolbarContent?.({
              selectedRows: [], allSelectedIds: [], totalSelectedCount: 0, resetSelection: () => {},
            })}
          </div>
          <table>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td>{cell('staff_name', r)}</td>
                <td>{cell('status', r)}</td>
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

beforeEach(() => {
  block.reason = null;
  revokeAsync.mockResolvedValue({ data: { id: 'app-anita', employee_id: 'emp-1' } });
});
afterEach(() => {
  cleanup();
  revokeAsync.mockReset();
});

// Radix measures the open menu with ResizeObserver and drives Select with
// pointer capture; jsdom has neither.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

/**
 * Show decided rows. ApprovalFilterState.status defaults to 'open' (pending +
 * escalated) so that the queue reads as work remaining — which means every row
 * this file is about starts hidden.
 */
const showAllStatuses = async () => {
  const select = await screen.findByLabelText(/filter by status/i);
  fireEvent.keyDown(select, { key: 'Enter' });
  const option = await screen.findByRole('option', { name: /any status/i });
  fireEvent.click(option);
};

const openRowMenu = async (name: string) => {
  const row = (await screen.findByText(name)).closest('tr') as HTMLElement;
  fireEvent.keyDown(within(row).getByRole('button', { name: `Actions for ${name}` }), { key: 'Enter' });
  return screen.findByRole('menu');
};

const openRevoke = async (name: string) => {
  const menu = await openRowMenu(name);
  fireEvent.click(within(menu).getByRole('menuitem', { name: /revoke approval/i }));
  return screen.findByRole('dialog');
};

describe('Revoking an approved request', { timeout: 20_000 }, () => {
  it('offers Revoke only on an approved row that is not yours and not already revoked', async () => {
    render(<LeaveApprovalsPage />);
    await showAllStatuses();

    const approved = await openRowMenu('Anita K');
    expect(within(approved).getByRole('menuitem', { name: /revoke approval/i })).toBeInTheDocument();
    fireEvent.keyDown(approved, { key: 'Escape' });

    for (const who of ['Ravi M', 'Sunil B', 'Me Myself']) {
      const menu = await openRowMenu(who);
      expect(within(menu).queryByRole('menuitem', { name: /revoke approval/i })).toBeNull();
      fireEvent.keyDown(menu, { key: 'Escape' });
    }
  });

  it('needs a reason, and sends it', async () => {
    render(<LeaveApprovalsPage />);
    await showAllStatuses();
    const dialog = await openRevoke('Anita K');

    expect(within(dialog).getByText('Revoke this approval?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Casual Leave · 14\/09\/2026 → 15\/09\/2026 · 2 days/)).toBeInTheDocument();

    const confirm = within(dialog).getByRole('button', { name: /revoke approval/i });
    expect(confirm).toBeDisabled();
    expect(revokeAsync).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/reason/i), {
      target: { value: 'Approved the wrong request' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /revoke approval/i }));

    await waitFor(() => expect(revokeAsync).toHaveBeenCalledTimes(1));
    expect(revokeAsync).toHaveBeenCalledWith({
      applicationId: 'app-anita',
      reason: 'Approved the wrong request',
    });
  });

  it('shows the database refusal and revokes nothing', async () => {
    block.reason =
      'Attendance for 2026-08 is closed (locked 08 Sep 2026). Reopen the month before revoking this request.';
    render(<LeaveApprovalsPage />);
    await showAllStatuses();
    const dialog = await openRevoke('Anita K');

    expect(within(dialog).getByText(/Attendance for 2026-08 is closed/)).toBeInTheDocument();

    // A reason cannot even be typed, and the button stays dead with one supplied.
    expect(within(dialog).getByLabelText(/reason/i)).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: /revoke approval/i })).toBeDisabled();
    expect(revokeAsync).not.toHaveBeenCalled();
  });

  it('Cancel revokes nothing', async () => {
    render(<LeaveApprovalsPage />);
    await showAllStatuses();
    const dialog = await openRevoke('Anita K');
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'oops' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(revokeAsync).not.toHaveBeenCalled();
  });

  it('renders a revoked row as Revoked, not Rejected', async () => {
    render(<LeaveApprovalsPage />);
    await showAllStatuses();
    const row = (await screen.findByText('Ravi M')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Revoked')).toBeInTheDocument();
    expect(within(row).queryByText('Rejected')).toBeNull();
  });
});
