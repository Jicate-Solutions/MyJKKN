// @vitest-environment jsdom
// The two interview-booking cards on the HR interviews page: who is waiting for
// a call (#14) and interviews booked for posts that are no longer open (#13).

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  loadCallbackRequests: vi.fn(),
  loadClosedPostInterviews: vi.fn(),
  markCallbackRequestCalled: vi.fn(),
  reopenCallbackRequest: vi.fn(),
}));
vi.mock('@/app/(routes)/hr/recruitment/interviews/interview-booking-hr-actions', () => actions);

import { CallbackRequestsCard } from '@/app/(routes)/hr/recruitment/interviews/_components/callback-requests-card';
import { ClosedPostInterviewsCard } from '@/app/(routes)/hr/recruitment/interviews/_components/closed-post-interviews-card';

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>,
  );

const req = (p: Record<string, unknown>) => ({
  id: 'r1', job_id: 'j1', post_title: 'Office Assistant', name: 'Kavya', phone: '+919876543210',
  email: null, status: 'open', outcome_note: null, handled_at: null, handled_by: null,
  handler_name: null, closed_by_booking_id: null, created_at: new Date(Date.now() - 3 * 3600_000).toISOString(), ...p,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CallbackRequestsCard', () => {
  it('is hidden when the read is refused', async () => {
    actions.loadCallbackRequests.mockResolvedValue({ success: false, error: 'permission denied' });
    const { container } = wrap(<CallbackRequestsCard />);
    await waitFor(() => expect(actions.loadCallbackRequests).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('empty → "No one is waiting for a call."', async () => {
    actions.loadCallbackRequests.mockResolvedValue({ success: true, open: [], done: [] });
    wrap(<CallbackRequestsCard />);
    expect(await screen.findByText('No one is waiting for a call.')).toBeInTheDocument();
  });

  it('an open request: name, tel: link, post, how long ago', async () => {
    actions.loadCallbackRequests.mockResolvedValue({ success: true, open: [req({ email: 'k@x.in' })], done: [] });
    wrap(<CallbackRequestsCard />);
    expect(await screen.findByText('Kavya')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+919876543210/ })).toHaveAttribute('href', 'tel:+919876543210');
    expect(screen.getByText('Office Assistant')).toBeInTheDocument();
    expect(screen.getByText('k@x.in')).toBeInTheDocument();
    expect(screen.getByText(/asked about 3 hours ago/)).toBeInTheDocument();
  });

  it('mark as called sends the note, and a refusal is shown as the explicit message', async () => {
    actions.loadCallbackRequests.mockResolvedValue({ success: true, open: [req({})], done: [] });
    actions.markCallbackRequestCalled.mockResolvedValue({
      success: false,
      error: "You don't have access to update call-back requests — contact the HR admin.",
    });
    wrap(<CallbackRequestsCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as called' }));
    fireEvent.change(screen.getByLabelText('Note about the call'), { target: { value: 'Booked for Tue 11am' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to update call-back requests");
    expect(actions.markCallbackRequestCalled).toHaveBeenCalledWith('r1', 'Booked for Tue 11am');
  });

  it('handled rows sit under "Recently handled"; a self-booked one says so; Reopen calls the action', async () => {
    actions.loadCallbackRequests.mockResolvedValue({
      success: true,
      open: [],
      done: [
        req({ id: 'd1', status: 'done', closed_by_booking_id: 'b1', handled_at: '2026-09-20T05:00:00Z' }),
        req({ id: 'd2', name: 'Ravi', status: 'done', handler_name: 'Priya', handled_at: '2026-09-20T05:00:00Z', outcome_note: 'Not interested' }),
      ],
    });
    actions.reopenCallbackRequest.mockResolvedValue({ success: true });
    wrap(<CallbackRequestsCard />);
    const toggle = await screen.findByRole('button', { name: /Recently handled \(2\)/ });
    expect(screen.queryByText('Booked an interview themselves')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('Booked an interview themselves')).toBeInTheDocument();
    expect(screen.getByText(/Called by Priya · 20 Sept?, 10:30 am/i)).toBeInTheDocument();
    expect(screen.getByText(/Not interested/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reopen' })[0]);
    await waitFor(() => expect(actions.reopenCallbackRequest).toHaveBeenCalledWith('d1'));
  });
});

describe('ClosedPostInterviewsCard', () => {
  it('is hidden when there is nothing to decide', async () => {
    actions.loadClosedPostInterviews.mockResolvedValue({ success: true, rows: [] });
    const { container } = wrap(<ClosedPostInterviewsCard />);
    await waitFor(() => expect(actions.loadClosedPostInterviews).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each interview with the post status, IST time, round and a link — and cancels nothing', async () => {
    actions.loadClosedPostInterviews.mockResolvedValue({
      success: true,
      rows: [{
        id: 'i1', candidate_name: 'Anitha', job_id: 'j1', post_title: 'Accounts Officer', post_status: 'closed',
        scheduled_at: '2026-10-01T05:30:00Z', round_number: 2, round_name: 'Panel',
      }],
    });
    wrap(<ClosedPostInterviewsCard />);
    expect(await screen.findByText('Nothing has been cancelled. Decide for each one.')).toBeInTheDocument();
    expect(screen.getByText('Anitha')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText(/1 Oct.*11:00 am/i)).toBeInTheDocument();
    expect(screen.getByText('Round 2 · Panel')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/hr/recruitment/interviews/i1');
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });
});
