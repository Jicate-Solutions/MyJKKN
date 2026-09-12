// @vitest-environment jsdom
// __tests__/resource-management/reservation-approval-actions.test.tsx
// BUG-004010 — an approver who opened a reservation from the Approvals queue
// had no way to approve or reject on the detail page and had to navigate back.
// <ReservationApprovalActions/> is mounted for real in each of its four
// states; the approval-chain rows, auth profile and the shared dialog are
// mocked.

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import { ReservationApprovalActions } from '@/app/(routes)/resource-management/reservations/[id]/_components/reservation-approval-actions';
import type { ApprovalRecordLike } from '@/lib/services/reservation/approval-chain';
import type { Reservation } from '@/types/reservation';
import { ReservationStatus, ReservationPriority } from '@/types/reservation';

const LEVEL_1 = 'user-level-1';
const LEVEL_2 = 'user-level-2';
const OUTSIDER = 'user-outsider';
const REQUESTER = 'user-requester';

// Who is signed in, and whether they are a super admin.
let signedInAs: string | undefined = LEVEL_1;
let superAdmin = false;
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    profile: signedInAs
      ? { id: signedInAs, is_super_admin: superAdmin }
      : null,
    isLoading: false,
    error: null
  })
}));

// The approval-chain rows for the reservation on screen.
let rows: ApprovalRecordLike[] = [];
let rowsLoading = false;
vi.mock('@/hooks/reservation/use-reservation-approval-rows', () => ({
  useReservationApprovalRows: () => ({ data: rows, isLoading: rowsLoading })
}));

// The shared dialog is exercised by the approvals page; here we only need to
// know it was opened with the right action for the right reservation.
vi.mock(
  '@/app/(routes)/resource-management/reservations/approvals/_components/approval-actions-dialog',
  () => ({
    ApprovalActionsDialog: ({ reservation, action }: any) =>
      reservation && action
        ? React.createElement(
            'div',
            { 'data-testid': 'approval-dialog' },
            `${action}:${reservation.id}`
          )
        : null
  })
);

function reservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'res-1',
    resource_id: 'resource-1',
    user_id: REQUESTER,
    purpose: 'Seminar hall for a guest lecture',
    start_time: '2026-09-20T09:00:00.000Z',
    end_time: '2026-09-20T11:00:00.000Z',
    quantity: 1,
    status: ReservationStatus.PENDING,
    priority: ReservationPriority.NORMAL,
    created_at: '2026-09-10T09:00:00.000Z',
    updated_at: '2026-09-10T09:00:00.000Z',
    resource: {
      id: 'resource-1',
      name: 'Seminar Hall A',
      approval_config: {
        enabled: true,
        approval_type: 'sequential',
        approvers: [
          { id: 'a1', user_id: LEVEL_1, level: 1, is_required: true },
          { id: 'a2', user_id: LEVEL_2, level: 2, is_required: true }
        ]
      }
    },
    ...over
  };
}

function mount(res: Reservation = reservation()) {
  return render(
    <ReservationApprovalActions reservation={res} userId={signedInAs} />
  );
}

beforeEach(() => {
  signedInAs = LEVEL_1;
  superAdmin = false;
  rowsLoading = false;
  rows = [
    { approver_user_id: LEVEL_1, approval_level: 1, status: 'pending' },
    { approver_user_id: LEVEL_2, approval_level: 2, status: 'pending' }
  ];
});

afterEach(() => {
  cleanup();
});

describe('<ReservationApprovalActions/> — approver whose turn it is', () => {
  it('shows enabled Approve and Reject buttons', () => {
    mount();

    const approve = screen.getByRole('button', { name: /approve/i });
    const reject = screen.getByRole('button', { name: /reject/i });
    expect(approve).toBeEnabled();
    expect(reject).toBeEnabled();
    expect(screen.queryByText(/waiting for level/i)).toBeNull();
    expect(screen.queryByText(/you approved/i)).toBeNull();
  });

  it('opens the shared dialog for this reservation with the chosen action', () => {
    mount();

    expect(screen.queryByTestId('approval-dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(screen.getByTestId('approval-dialog')).toHaveTextContent(
      'approve:res-1'
    );
  });

  it('opens the reject dialog from the Reject button', () => {
    mount();

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(screen.getByTestId('approval-dialog')).toHaveTextContent(
      'reject:res-1'
    );
  });

  it('lets a super admin outside the chain act', () => {
    signedInAs = OUTSIDER;
    superAdmin = true;
    mount();

    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
  });
});

describe('<ReservationApprovalActions/> — approver who is out of turn', () => {
  it('disables both buttons and names the level being waited on', () => {
    signedInAs = LEVEL_2;
    mount();

    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reject/i })).toBeDisabled();
    expect(screen.getByText(/waiting for level 1/i)).toBeInTheDocument();
  });
});

describe('<ReservationApprovalActions/> — approver who has already acted', () => {
  it('shows the You Approved badge and no buttons', () => {
    rows = [
      { approver_user_id: LEVEL_1, approval_level: 1, status: 'approved' },
      { approver_user_id: LEVEL_2, approval_level: 2, status: 'pending' }
    ];
    mount();

    expect(screen.getByText(/you approved/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
  });

  it('shows the You Rejected badge after a rejection', () => {
    rows = [
      { approver_user_id: LEVEL_1, approval_level: 1, status: 'rejected' },
      { approver_user_id: LEVEL_2, approval_level: 2, status: 'pending' }
    ];
    mount();

    expect(screen.getByText(/you rejected/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('<ReservationApprovalActions/> — renders nothing', () => {
  it('for a user who is not in the approval chain', () => {
    signedInAs = OUTSIDER;
    const { container } = mount();

    expect(container).toBeEmptyDOMElement();
  });

  it('for a reservation that is no longer pending', () => {
    const { container } = mount(
      reservation({ status: ReservationStatus.APPROVED })
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("for the reservation's own requester even when they are in the chain", () => {
    signedInAs = LEVEL_1;
    const { container } = mount(reservation({ user_id: LEVEL_1 }));

    expect(container).toBeEmptyDOMElement();
  });

  it('while the approval-chain rows are still loading', () => {
    rowsLoading = true;
    rows = [];
    const { container } = mount();

    expect(container).toBeEmptyDOMElement();
  });

  it('when nobody is signed in', () => {
    signedInAs = undefined;
    const { container } = mount();

    expect(container).toBeEmptyDOMElement();
  });
});
