// @vitest-environment jsdom
// __tests__/instasolver/old-purchase-requests-label.test.tsx
// Director answers, 1 Oct 2026: on the old-purchase-requests screen, a
// requester who has left JKKN shows a grey 'Has left JKKN' label, and the
// Director can still approve or reject the request.
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/procurement/purchase-request-service', () => ({
  ProcurementPurchaseRequestService: { createPurchaseRequest: vi.fn() },
}));

import {
  OldPurchaseRequestsClient,
  type OldRequestView,
} from '@/app/(routes)/instasolver/old-purchase-requests/_components/old-purchase-requests-client';

afterEach(() => cleanup());

function view(over: Partial<OldRequestView>): OldRequestView {
  return {
    legacyId: 1,
    details: 'Two steel chairs',
    category: null,
    place: null,
    priority: null,
    photoUrl: null,
    requestedAt: '2025-03-04T09:00:00.000Z',
    bulkLoaded: false,
    college: 'Engineering College',
    askedBy: 'A Person',
    requesterLeft: false,
    inProgress: false,
    ...over,
  };
}

describe("the 'Has left JKKN' label", () => {
  it('shows on a departed requester, with Approve and Reject still there', () => {
    render(<OldPurchaseRequestsClient initialRows={[view({ requesterLeft: true })]} />);
    expect(screen.getByText('Has left JKKN')).toBeInTheDocument();
    expect(screen.getByText(/raised on behalf of the college office/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Approve$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Reject$/ })).toBeEnabled();
  });

  it('does not show for someone still at JKKN', () => {
    render(<OldPurchaseRequestsClient initialRows={[view({ requesterLeft: false })]} />);
    expect(screen.queryByText('Has left JKKN')).toBeNull();
  });
});
