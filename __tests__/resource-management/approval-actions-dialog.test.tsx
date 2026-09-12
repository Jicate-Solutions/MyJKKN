// @vitest-environment jsdom
// __tests__/resource-management/approval-actions-dialog.test.tsx
//
// BUG-005910: the approval dialog is where an approver decides, and it showed
// Resource, Requested By and Purpose but never WHEN the booking is. These
// tests pin that the date and the start-end times render in the summary.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import { ApprovalActionsDialog } from '@/app/(routes)/resource-management/reservations/approvals/_components/approval-actions-dialog';

vi.mock('@/hooks/reservation/use-reservation-operations', () => ({
  useApproveReservation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectReservation: () => ({ mutateAsync: vi.fn(), isPending: false })
}));

const start = new Date(2026, 8, 15, 14, 30); // 15 Sep 2026 14:30 local
const end = new Date(2026, 8, 15, 16, 0);

const reservation = {
  id: 'r1',
  status: 'pending',
  start_time: start.toISOString(),
  end_time: end.toISOString(),
  purpose: 'Guest lecture',
  resource: { id: 'res1', name: 'Seminar Hall A' },
  user: { id: 'u1', full_name: 'Narayan Rao' }
} as any;

describe('ApprovalActionsDialog summary', () => {
  it('shows the booking date and the start-end times (BUG-005910)', () => {
    render(
      <ApprovalActionsDialog
        reservation={reservation}
        action='approve'
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Date & Time')).toBeTruthy();
    expect(screen.getByText(format(start, 'MMM dd, yyyy'))).toBeTruthy();
    expect(
      screen.getByText(
        `${format(start, 'hh:mm a')} - ${format(end, 'hh:mm a')}`
      )
    ).toBeTruthy();
  });

  it('still shows resource, requester and purpose', () => {
    render(
      <ApprovalActionsDialog
        reservation={reservation}
        action='reject'
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Seminar Hall A')).toBeTruthy();
    expect(screen.getByText('Narayan Rao')).toBeTruthy();
    expect(screen.getByText('Guest lecture')).toBeTruthy();
  });
});
