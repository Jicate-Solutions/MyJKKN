// @vitest-environment jsdom
// ============================================================================
// The two behaviours of the hand-over control that a green typecheck cannot
// prove, and that would each be invisible in a screenshot of the happy path:
//
//   1. It is ABSENT for everyone the server does not vouch for — not hidden,
//      absent. The requirement was explicitly "must not merely be hidden by
//      CSS", so the assertion is on the DOM containing nothing at all.
//   2. When the walls reject a handover, the Director reads the server's own
//      sentence. Swallowing a 42501 into "something went wrong" is how he ends
//      up believing a permanently-walled page was delegated.
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc: rpcMock }),
}));

let mockPathname = '/learners';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { HandoverDialog } from '@/components/director-desk/handover-dialog';
import { HandoverLauncher } from '@/components/director-desk/handover-launcher';

afterEach(() => {
  cleanup();
  rpcMock.mockReset();
});

describe('HandoverLauncher — visibility is a server answer', () => {
  beforeEach(() => {
    mockPathname = '/learners';
  });

  it('renders NOTHING at all when fn_can_hand_over() says no', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    const { container } = render(<HandoverLauncher />);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('fn_can_hand_over'));
    // Not display:none, not aria-hidden — no node. There is nothing to unhide.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /hand this page over/i })).toBeNull();
  });

  it('renders nothing when the gate errors (fail closed)', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'function public.fn_can_hand_over() does not exist' },
    });
    const { container } = render(<HandoverLauncher />);

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the control when fn_can_hand_over() says yes', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    render(<HandoverLauncher />);

    expect(
      await screen.findByRole('button', { name: /hand this page over/i })
    ).toBeInTheDocument();
  });

  it('stays out of the way on the desks themselves', async () => {
    mockPathname = '/my-desk';
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { container } = render(<HandoverLauncher />);

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('HandoverDialog — a page with no permission of its own', () => {
  it('says so plainly and refuses to submit', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    render(
      <HandoverDialog
        open
        onOpenChange={() => {}}
        pathname="/definitely-not-a-real-module-xyz"
      />
    );

    expect(
      await screen.findByText(/no permission of its own/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hand it over/i })).toBeDisabled();
  });
});

describe('HandoverDialog — a walled page', () => {
  it('shows the wall message verbatim, not a generic failure', async () => {
    const WALL =
      'These cannot be handed over to anyone: hr.payroll.view. They are permanently walled (access control, salary and team-member files, exam marks, or money movement).';

    // Two different RPCs are called from this component; answer each by name.
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'fn_handover_people_search') {
        return Promise.resolve({
          data: [
            {
              id: 'p-1',
              full_name: 'Test Colleague',
              email: 'colleague@jkkn.ac.in',
              role: 'principal',
              designation: 'Principal',
              institution_name: 'JKKN',
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: WALL, code: '42501' } });
    });

    const { rerender } = render(
      <HandoverDialog open onOpenChange={() => {}} pathname="/hr/employees" />
    );
    rerender(<HandoverDialog open onOpenChange={() => {}} pathname="/hr/employees" />);

    // The dialog resolves a real key for this route, so submit is reachable
    // once a person is chosen. Drive the failure path directly.
    const person = await screen.findByText('Test Colleague');
    person.click();

    const submit = await screen.findByRole('button', { name: /hand it over/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    submit.click();

    expect(await screen.findByText(WALL)).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });
});
