// @vitest-environment jsdom
/**
 * Comp-off claim decisions are confirmed before they happen, one at a time or
 * in bulk (2026-09-11).
 *
 * The queue now renders through the shared advanced DataTable. That table is
 * not what is under test, so it is replaced with a thin stand-in that runs the
 * real fetchDataFn, renders the real row cells, and hands the real toolbar a
 * selection — everything the queue owns (dialogs, bulk rules, decisions) is
 * exercised as shipped.
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompOffClaimQueueRow } from '@/types/hr-comp-off';

const mutateAsync = vi.fn();
const revokeAsync = vi.fn();
const table = vi.hoisted(() => ({ selectAll: false, reset: vi.fn() }));

const base = {
  institution_id: 'inst-1', institution_name: 'JKKN College of Engineering and Technology',
  worked_date: '2098-12-06', expires_on: '2099-01-06', credit_days: 1, source: 'claim' as const,
  notes: null, documents: [], created_at: '2098-12-07T10:00:00Z',
  status: 'pending' as const, decided_at: null, rejection_reason: null,
  revoked_at: null, revoke_reason: null,
};
const priya: CompOffClaimQueueRow = {
  ...base, id: 'claim-priya', employee_id: 'emp-1', employee_name: 'Priya Raman', employee_code: 'CET042',
  work_location: 'outside_campus', work_place: 'Chennai – NAAC visit',
};
const kumar: CompOffClaimQueueRow = {
  ...base, id: 'claim-kumar', employee_id: 'emp-2', employee_name: 'Kumar S', employee_code: 'CET051',
  work_location: 'inside_campus', work_place: null,
};

vi.mock('@/hooks/hr/use-comp-off', () => ({
  useCompOffClaimsQueue: () => ({
    data: [priya, kumar], isLoading: false, error: null, refetch: vi.fn(), isFetching: false, dataUpdatedAt: 1,
  }),
  useDecideCompOffClaim: () => ({ mutateAsync, isPending: false }),
  useRevokeCompOffClaim: () => ({ mutateAsync: revokeAsync, isPending: false }),
  // Asked per row when the revoke dialog opens; no claim here is approved.
  useCompOffRevokeBlockReason: () => ({ data: null, isFetching: false }),
  useCompOffClaimsBiometric: () => ({
    data: [
      { claim_id: 'claim-priya', status: 'not_required', in_at: null, out_at: null, source: null },
      { claim_id: 'claim-kumar', status: 'no_punch', in_at: null, out_at: null, source: null },
    ],
    dataUpdatedAt: 1,
  }),
}));
vi.mock('@/hooks/hr/use-time-off-context', () => ({
  useTimeOffContext: () => ({ employeeId: 'someone-else' }),
}));

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
                  <td>{cell('employee_name', r)}</td>
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

import { CompOffClaimsQueue } from '@/app/(routes)/hr/leave/_components/comp-off-claims-queue';

// Block bodies: a function returned from beforeEach runs as a cleanup hook.
beforeEach(() => {
  mutateAsync.mockResolvedValue(undefined);
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

describe('Comp-off claim queue — one claim at a time', () => {
  it('Approve asks first and decides nothing until confirmed', async () => {
    render(<CompOffClaimsQueue />);
    await pick('Priya Raman', /approve/i);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Approve this compensatory off claim?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Chennai – NAAC visit/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /approve claim/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ creditId: 'claim-priya', decision: 'approved' })
    );
  });

  it('Cancel on the confirmation decides nothing', async () => {
    render(<CompOffClaimsQueue />);
    await pick('Priya Raman', /approve/i);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('the row menu offers View / Approve / Reject', async () => {
    render(<CompOffClaimsQueue />);
    const menu = await openRowMenu('Priya Raman');
    expect(within(menu).getByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /approve/i })).not.toHaveAttribute('aria-disabled');
    expect(within(menu).getByRole('menuitem', { name: /reject/i })).toBeInTheDocument();
  });

  it('an inside-campus claim with no punch: Approve disabled with the reason, Reject available', async () => {
    render(<CompOffClaimsQueue />);
    const menu = await openRowMenu('Kumar S');
    expect(within(menu).getByRole('menuitem', { name: /approve/i })).toHaveAttribute('aria-disabled', 'true');
    expect(within(menu).getByText(/no punch for the worked day/i)).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /reject/i })).not.toHaveAttribute('aria-disabled');
  });

  it('Reject names the claim and needs a reason before it can be confirmed', async () => {
    render(<CompOffClaimsQueue />);
    await pick('Priya Raman', /reject/i);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Reject this compensatory off claim?')).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: /reject claim/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/reason/i), {
      target: { value: 'No duty order for that day' },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        creditId: 'claim-priya', decision: 'rejected', rejectionReason: 'No duty order for that day',
      })
    );
  });
});

describe('Comp-off claim queue — bulk', () => {
  it('bulk approve skips a claim with no punch, says why, and confirms first', async () => {
    table.selectAll = true;
    render(<CompOffClaimsQueue />);
    const toolbar = screen.getByTestId('toolbar');

    const approveAll = await within(toolbar).findByRole('button', { name: /approve 1 selected/i });
    expect(within(toolbar).getByText(/can.t approve: 1 without a biometric punch/i)).toBeInTheDocument();

    fireEvent.click(approveAll);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Approve 1 compensatory off claim(s)?')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /approve 1 claim/i }));
    await waitFor(() => expect(table.reset).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ creditId: 'claim-priya', decision: 'approved' })
    );
  });

  it('bulk reject applies one reason to every selected pending claim', async () => {
    table.selectAll = true;
    render(<CompOffClaimsQueue />);
    const toolbar = screen.getByTestId('toolbar');

    fireEvent.click(await within(toolbar).findByRole('button', { name: /reject 2 selected/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'Not a holiday' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /reject 2 claim/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync).toHaveBeenCalledWith({
      creditId: 'claim-priya', decision: 'rejected', rejectionReason: 'Not a holiday',
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      creditId: 'claim-kumar', decision: 'rejected', rejectionReason: 'Not a holiday',
    });
  });
});
