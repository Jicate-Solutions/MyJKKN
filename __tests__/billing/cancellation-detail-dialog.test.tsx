// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toCancellationRow } from '@/app/(routes)/billing/receipt-cancellations/_components/cancellation-columns';
import { CancellationDetailDialog } from '@/app/(routes)/billing/receipt-cancellations/_components/cancellation-detail-dialog';
import type { ReceiptCancelRequest } from '@/lib/services/billing/receipts/receipt-cancellation-service';

const permissions = { isSuperAdmin: false, userProfile: { id: 'me' } as { id: string } | null };
const detail = {
  data: undefined as unknown,
  isLoading: false,
};

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => permissions,
}));

vi.mock('@/hooks/billing/use-receipt-cancellations', () => ({
  useReceiptCancelRequestDetail: () => detail,
  useActOnReceiptCancellation: () => ({ mutate: vi.fn(), isPending: false }),
  useWithdrawReceiptCancellation: () => ({ mutate: vi.fn(), isPending: false }),
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

  // Approval is super-admin only — fn_act_on_receipt_cancellation gates on
  // is_super_admin() and cannot be delegated through Role Management.
  it('hides approve/decline from a non-super-admin', () => {
    permissions.isSuperAdmin = false;
    open();
    expect(q(/Approve/)).toBeNull();
    expect(q(/Decline/)).toBeNull();
  });

  it('offers approve, decline and a comment box to a super admin', () => {
    permissions.isSuperAdmin = true;
    open();
    expect(q(/Approve & cancel receipt/)).toBeInTheDocument();
    expect(q(/Decline/)).toBeInTheDocument();
    expect(within(dialog()).getByLabelText('Comment (optional)')).toBeInTheDocument();
  });

  // The RPC refuses self-approval, so the button must never be offered.
  it('refuses to let a super admin decide their own request', () => {
    permissions.isSuperAdmin = true;
    permissions.userProfile = { id: 'me' };
    open({ requested_by: 'me' });
    expect(q(/Approve & cancel receipt/)).toBeNull();
    expect(q(/Decline/)).toBeNull();
    expect(
      within(dialog()).getByText(/another super admin must decide it/)
    ).toBeInTheDocument();
  });

  it('lets the requester withdraw their own pending request', () => {
    permissions.userProfile = { id: 'me' };
    open({ requested_by: 'me' });
    expect(q(/Withdraw/)).toBeInTheDocument();
  });

  it('offers no decision controls once the request is decided', () => {
    permissions.isSuperAdmin = true;
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
