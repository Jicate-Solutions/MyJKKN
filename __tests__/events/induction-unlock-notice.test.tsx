// @vitest-environment jsdom
//
// The notice that tells a pre-onboarding learner WHY most of MyJKKN is missing.
//
// Eleven learners filed the same report — "only three options are visible,
// other options are not visible in dashboard" (BUG-005921, BUG-005932 to
// BUG-005937, BUG-005939 to BUG-005941, BUG-005943) — against behaviour that is
// working as designed: proxy.ts whitelists the induction paths for the
// pre-onboarding lifecycle statuses and redirects everything else. The gap was
// never the gate, it was that nothing said so.
//
// So the behaviours worth pinning are about WHO sees it, not how it looks:
// (1) it appears for every status in INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES —
// iterated from the constant rather than a hand-copied list, because a status
// added there and missed here would silently go unexplained again; (2) it
// renders NOTHING for an activated learner and NOTHING for a user the RPC has
// no learner row for, since the component sits on a page coordinators and
// admins can also open; (3) it renders nothing while the status is still in
// flight, so an activated learner never sees it flash.
//
// The real hook is used (only the Supabase client is stubbed) so that the
// notice keys off the same fn_my_lifecycle_status signal as the sidebar and the
// bottom nav. Mocking useIsInductionOnly would have tested the mock.
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));

import { INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES } from '@/lib/constants/induction-access';
import { UnlockNotice } from '@/app/(routes)/learners/my-induction/_components/unlock-notice';

/** A fresh client per test: the hook's queryKey is a constant and staleTime is
 *  5 minutes, so a shared client would serve test 1's status to test 2. */
function renderNotice() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UnlockNotice />
    </QueryClientProvider>
  );
}

beforeEach(() => { rpc.mockReset(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('UnlockNotice', () => {
  it.each([...INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES])(
    'tells a %s learner that the rest of MyJKKN unlocks after onboarding',
    async (status) => {
      rpc.mockResolvedValue({ data: status, error: null });
      renderNotice();

      expect(
        await screen.findByText(/You can see only the induction pages for now/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/unlocks\s+automatically once your onboarding is complete/i))
        .toBeInTheDocument();
      // The way out if the gate is genuinely stuck — a learner with no route to
      // a human is back to filing the same bug report.
      expect(screen.getByText(/tell your class coordinator/i)).toBeInTheDocument();
      expect(rpc).toHaveBeenCalledWith('fn_my_lifecycle_status');
    }
  );

  it('renders nothing for an activated learner', async () => {
    rpc.mockResolvedValue({ data: 'active', error: null });
    const { container } = renderNotice();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a user who is not a learner at all', async () => {
    // fn_my_lifecycle_status returns null — a coordinator or admin opening the
    // page must not be told their own dashboard is restricted.
    rpc.mockResolvedValue({ data: null, error: null });
    const { container } = renderNotice();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent while the status is still loading', () => {
    rpc.mockReturnValue(new Promise(() => {})); // never settles
    const { container } = renderNotice();
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent when the status read fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { container } = renderNotice();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
