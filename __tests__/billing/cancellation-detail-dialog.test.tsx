// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toCancellationRow } from '@/app/(routes)/billing/receipt-cancellations/_components/cancellation-columns';
import { CancellationDetailDialog } from '@/app/(routes)/billing/receipt-cancellations/_components/cancellation-detail-dialog';
import type { ReceiptCancelRequest } from '@/lib/services/billing/receipts/receipt-cancellation-service';

const permissions = { isSuperAdmin: false, userProfile: { id: 'me' } as { id: string } | null };
const detail = {
  data: undefined as unknown,
  isLoading: false,
};
const withdrawMutate = vi.fn();
// canApprove is now the SERVER's answer (fn_can_decide_receipt_cancellation),
// not a local isSuperAdmin check — so the tests drive that verdict directly.
const flow = { canDecide: false as boolean, approver: null as unknown };

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => permissions,
}));

vi.mock('@/hooks/billing/use-receipt-cancellations', () => ({
  useReceiptCancelRequestDetail: () => detail,
  useActOnReceiptCancellation: () => ({ mutate: vi.fn(), isPending: false }),
  useWithdrawReceiptCancellation: () => ({ mutate: withdrawMutate, isPending: false }),
}));

vi.mock('@/hooks/billing/use-receipt-cancel-flows', () => ({
  useCanDecideCancellation: () => ({ data: flow.canDecide }),
  useResolvedCancelApprover: () => ({ data: flow.approver }),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const REQUEST = {
  id: 'req1',
  request_number: 'RC-001',
  receipt_id: 'rcpt1',
  institution_id: 'inst1',
  student_id: 'stu1',
  receipt_snapshot: {
    receipt_number: 'RCPT-9001',
    payment_amount: 25000,
    payment_mode: 'cash',
    receipt_date: '2026-08-01',
    payer_name: 'A Parent',
  },
  reason: 'same payment receipted twice',
  status: 'pending_approval',
  requested_by: 'someone-else',
  requested_at: '2026-08-20T10:00:00Z',
  decided_by: null,
  decided_at: null,
  decision_notes: null,
  requested_by_name: 'Accounts Clerk',
  requested_by_email: 'clerk@jkkn.ac.in',
  requested_by_role: 'Chief Accountant',
  decided_by_name: null,
  decided_by_email: null,
  decided_by_role: null,
  decided_by_designation: null,
  decided_by_is_super_admin: null,
} as unknown as ReceiptCancelRequest;

const DETAIL_DATA = {
  request: REQUEST,
  actions: [
    {
      id: 'a1',
      request_id: 'req1',
      action_type: 'requested',
      actor_id: 'someone-else',
      actor_role_name: 'Chief Accountant',
      actor_name: 'Accounts Clerk',
      actor_email: 'clerk@jkkn.ac.in',
      actor_is_super_admin: false,
      notes: null,
      created_at: '2026-08-20T10:00:00Z',
    },
  ],
  learner: {
    id: 'stu1',
    first_name: 'Priya',
    last_name: 'Kumar',
    roll_number: 'BDS25001',
    register_number: 'REG-77',
    college_email: 'priya@jkkn.ac.in',
    student_mobile: '9000000000',
    lifecycle_status: 'active',
    institution_name: 'JKKN Dental College',
    program_name: 'BDS',
    department_name: 'Dentistry',
  },
  bills: [
    {
      bill_id: 'b1',
      amount_paid: 25000,
      allocation_reason: null,
      bill_description: 'Tuition Fee 2026-27',
      final_amount: 50000,
      balance_amount: 25000,
      status: 'partial',
      due_date: '2026-09-01',
    },
  ],
  receiptStillExists: true,
};

beforeEach(() => {
  permissions.isSuperAdmin = false;
  permissions.userProfile = { id: 'me' };
  detail.data = DETAIL_DATA;
  detail.isLoading = false;
  withdrawMutate.mockReset();
  flow.canDecide = false;
  flow.approver = null;
});

afterEach(() => cleanup());

const open = (overrides: Partial<ReceiptCancelRequest> = {}) =>
  render(
    <CancellationDetailDialog
      request={{ ...REQUEST, ...overrides } as ReceiptCancelRequest}
      onOpenChange={vi.fn()}
      onActed={vi.fn()}
    />
  );

const dialog = () => screen.getByRole('dialog');
const q = (name: RegExp) => within(dialog()).queryByRole('button', { name });

describe('toCancellationRow', () => {
  it('flattens the JSONB snapshot into scalar columns', () => {
    expect(toCancellationRow(REQUEST)).toMatchObject({
      id: 'req1',
      request_number: 'RC-001',
      receipt_number: 'RCPT-9001',
      amount: 25000,
      requested_by_name: 'Accounts Clerk',
      status: 'pending_approval',
    });
  });

  it('survives a missing snapshot rather than throwing', () => {
    const row = toCancellationRow({ ...REQUEST, receipt_snapshot: {} } as ReceiptCancelRequest);
    expect(row.receipt_number).toBe('');
    expect(row.amount).toBe(0);
  });

  it('emits only scalars, as DataTable’s ExportableData requires', () => {
    for (const value of Object.values(toCancellationRow(REQUEST))) {
      expect(['string', 'number', 'boolean', 'undefined']).toContain(typeof value);
    }
  });
});

describe('CancellationDetailDialog', () => {
  it('shows the learner, the receipt and the bills it settled', () => {
    open();
    const d = within(dialog());
    expect(d.getByText('Priya Kumar')).toBeInTheDocument();
    expect(d.getByText('BDS25001')).toBeInTheDocument();
    expect(d.getByText('JKKN Dental College')).toBeInTheDocument();
    expect(d.getByText('RCPT-9001')).toBeInTheDocument();
    expect(d.getByText('Tuition Fee 2026-27')).toBeInTheDocument();
    expect(d.getByText('same payment receipted twice')).toBeInTheDocument();
    // Twice by design: the "Raised by" card and the history trail.
    expect(d.getAllByText('Accounts Clerk')).toHaveLength(2);
  });

  it('warns that approving reverts the bills', () => {
    open();
    expect(
      within(dialog()).getByText(/Approving reverts this bill to\s+unpaid/)
    ).toBeInTheDocument();
  });

  // Deciding authority is resolved server-side from the configured flow, so
  // the dialog asks rather than re-deriving the rule from isSuperAdmin.
  it('hides approve/decline when the server says you may not decide', () => {
    flow.canDecide = false;
    open();
    expect(q(/Approve/)).toBeNull();
    expect(q(/Decline/)).toBeNull();
  });

  it('offers approve, decline and a comment box to a permitted decider', () => {
    flow.canDecide = true;
    open();
    expect(q(/Approve & cancel receipt/)).toBeInTheDocument();
    expect(q(/Decline/)).toBeInTheDocument();
    expect(within(dialog()).getByLabelText('Comment (optional)')).toBeInTheDocument();
  });

  // The RPC refuses self-approval, so the button must never be offered.
  it('refuses to let a permitted decider act on their own request', () => {
    flow.canDecide = true;
    permissions.userProfile = { id: 'me' };
    open({ requested_by: 'me' });
    expect(q(/Approve & cancel receipt/)).toBeNull();
    expect(q(/Decline/)).toBeNull();
    expect(
      within(dialog()).getByText(/another approver must decide it/)
    ).toBeInTheDocument();
  });

  it('names a super admin as the decider when no flow is configured', () => {
    flow.approver = null;
    open();
    const d = within(dialog());
    expect(d.getByText('Pending with')).toBeInTheDocument();
    expect(d.getByText('Any super admin')).toBeInTheDocument();
  });

  it('names the configured role, and which flow supplied it', () => {
    flow.approver = {
      institution_id: 'inst1',
      approver_role_name: 'Principal',
      approver_user_name: null,
    };
    open();
    const d = within(dialog());
    expect(d.getByText(/Principal \(role\)/)).toBeInTheDocument();
    expect(d.getByText(/via institution flow/)).toBeInTheDocument();
  });

  it('marks a group-wide default as such', () => {
    flow.approver = {
      institution_id: null,
      approver_role_name: null,
      approver_user_name: 'Meera R',
    };
    open();
    const d = within(dialog());
    expect(d.getByText(/Meera R/)).toBeInTheDocument();
    expect(d.getByText(/via group default/)).toBeInTheDocument();
  });

  it('shows no "Pending with" once the request is decided', () => {
    open({ status: 'approved' });
    expect(within(dialog()).queryByText('Pending with')).toBeNull();
  });

  it('lets the requester withdraw their own pending request', () => {
    permissions.userProfile = { id: 'me' };
    open({ requested_by: 'me' });
    expect(q(/Withdraw/)).toBeInTheDocument();
  });

  // Withdrawing is terminal — fn_withdraw_receipt_cancellation refuses every
  // later action on the request — so it must not fire on a single click.
  describe('withdraw confirmation', () => {
    const openAndClickWithdraw = () => {
      permissions.userProfile = { id: 'me' };
      open({ requested_by: 'me' });
      fireEvent.click(within(dialog()).getByRole('button', { name: /Withdraw/ }));
      return screen.getByRole('alertdialog');
    };

    it('asks for confirmation instead of withdrawing immediately', () => {
      const confirm = openAndClickWithdraw();
      expect(withdrawMutate).not.toHaveBeenCalled();
      expect(within(confirm).getByText(/Withdraw RC-001\?/)).toBeInTheDocument();
      expect(within(confirm).getByText(/cannot be reopened/i)).toBeInTheDocument();
    });

    it('does nothing when the confirmation is dismissed', () => {
      const confirm = openAndClickWithdraw();
      fireEvent.click(within(confirm).getByRole('button', { name: 'Keep request' }));
      expect(withdrawMutate).not.toHaveBeenCalled();
    });

    it('submits with the optional reason once confirmed', () => {
      const confirm = openAndClickWithdraw();
      fireEvent.change(
        within(confirm).getByLabelText('Reason for withdrawing (optional)'),
        { target: { value: '  raised against the wrong receipt  ' } }
      );
      fireEvent.click(within(confirm).getByRole('button', { name: 'Withdraw request' }));

      expect(withdrawMutate).toHaveBeenCalledTimes(1);
      expect(withdrawMutate.mock.calls[0][0]).toEqual({
        requestId: 'req1',
        notes: 'raised against the wrong receipt',
      });
    });

    it('omits the note entirely when none is given', () => {
      const confirm = openAndClickWithdraw();
      fireEvent.click(within(confirm).getByRole('button', { name: 'Withdraw request' }));
      expect(withdrawMutate.mock.calls[0][0]).toEqual({
        requestId: 'req1',
        notes: undefined,
      });
    });
  });

  // Withdrawn/declined leave the receipt valid and the bill paid, which reads
  // as "it didn't work" unless the screen says that IS the outcome.
  it.each([
    ['withdrawn', /still valid and the bill is still paid/],
    ['declined', /stays valid and the bill stays paid/],
    ['approved', /cancelled and the bill reverted to unpaid/],
    ['failed', /no longer existed when the decision was made/],
  ])('spells out the money outcome for a %s request', (status, expected) => {
    open({ status: status as ReceiptCancelRequest['status'] });
    expect(within(dialog()).getByText(expected)).toBeInTheDocument();
  });

  it('shows no outcome banner while the request is still pending', () => {
    open();
    expect(within(dialog()).queryByText(/Nothing about the payment changed/)).toBeNull();
  });

  it('offers no decision controls once the request is decided', () => {
    flow.canDecide = true;
    open({ status: 'approved', decided_at: '2026-08-21T09:00:00Z', decided_by_name: 'SA' });
    expect(q(/Approve & cancel receipt/)).toBeNull();
    expect(q(/Decline/)).toBeNull();
    expect(q(/Withdraw/)).toBeNull();
  });

  it('explains the missing allocations once the receipt is archived', () => {
    detail.data = { ...DETAIL_DATA, bills: [], receiptStillExists: false };
    open({ status: 'approved' });
    const d = within(dialog());
    // The receipt field badges it, and the bills section explains why the
    // allocations are gone and that the amounts shown are the snapshot.
    expect(d.getByText('Archived on approval')).toBeInTheDocument();
    expect(
      d.getByText(/no longer available.*snapshot taken when the request was raised/is)
    ).toBeInTheDocument();
    // The "Open receipt" link must not be offered for a receipt that is gone.
    expect(d.queryByRole('link', { name: /Open receipt/ })).toBeNull();
  });
});
