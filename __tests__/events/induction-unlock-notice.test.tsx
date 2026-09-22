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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));

import {
  INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES,
  inductionWaitFor,
} from '@/lib/constants/induction-access';
import { UnlockNotice } from '@/components/learners/unlock-notice';

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
  // Every eligible status must land in one of the two waits — a status added
  // to the constant and forgotten here would be unexplained again, which is
  // the whole bug.
  const AWAITING_ADMISSION = INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES.filter(
    (st) => inductionWaitFor(st) === 'awaiting_admission'
  );
  const AWAITING_ACTIVATION = INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES.filter(
    (st) => inductionWaitFor(st) === 'awaiting_activation'
  );

  it('sorts every eligible status into exactly one wait, and nothing else into either', () => {
    expect(AWAITING_ADMISSION.length + AWAITING_ACTIVATION.length).toBe(
      INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES.length
    );
    expect(AWAITING_ADMISSION.length).toBeGreaterThan(0);
    expect(AWAITING_ACTIVATION.length).toBeGreaterThan(0);
    for (const st of ['active', 'graduated', 'rejected', 'inactive', 'exited', '', null, undefined]) {
      expect(inductionWaitFor(st as string | null)).toBeNull();
    }
  });

  it.each([...AWAITING_ADMISSION])(
    'tells a %s learner the college has to admit them — never that they must finish something',
    async (status) => {
      rpc.mockResolvedValue({ data: status, error: null });
      renderNotice();

      expect(
        await screen.findByText(/until you are admitted/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/opens after you are\s+admitted and the college activates your account/i)
      ).toBeInTheDocument();
      // 454 of the 729 learners in these statuses have not been admitted at all
      // (production, 22 Sep). Telling them to complete onboarding sends them to
      // fix something that is not theirs to fix.
      expect(screen.queryByText(/onboarding is complete/i)).not.toBeInTheDocument();
      // A learner whose status is wrongly stuck still needs a route to a human,
      // so the copy must NOT claim flatly that nothing is wrong.
      expect(screen.queryByText(/nothing is missing or broken/i)).not.toBeInTheDocument();
      expect(screen.getByText(/class coordinator/i)).toBeInTheDocument();
      expect(screen.getByText(/admissions office/i)).toBeInTheDocument();
      expect(rpc).toHaveBeenCalledWith('fn_my_lifecycle_status');
    }
  );

  it.each([...AWAITING_ACTIVATION])(
    'tells a %s learner they are admitted and waiting on activation',
    async (status) => {
      rpc.mockResolvedValue({ data: status, error: null });
      renderNotice();

      expect(
        await screen.findByText(/You can see only the induction pages for now/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/You are admitted\./i)).toBeInTheDocument();
      expect(
        screen.getByText(/activates your account/i)
      ).toBeInTheDocument();
      // "Admitted" is itself an induction-only status — full access needs
      // activation, so the notice must not present admission as the last step.
      expect(
        screen.getByText(/Being admitted is not the last step on its own/i)
      ).toBeInTheDocument();
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

  // Placement. Both pages an induction-only learner can actually open and then
  // report from must carry the notice: BUG-005941 and BUG-005945 were filed
  // from /learners/my-profile, not My Induction. Checked at the source because
  // both are server components. Comments stripped so a mention in prose cannot
  // satisfy it.
  it('is rendered on My Induction AND on My Profile', () => {
    const strip = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const page of [
      'app/(routes)/learners/my-induction/page.tsx',
      'app/(routes)/learners/my-profile/page.tsx',
    ]) {
      const src = strip(readFileSync(join(process.cwd(), page), 'utf8'));
      expect(src, page).toMatch(/import \{ UnlockNotice \} from '@\/components\/learners\/unlock-notice';/);
      expect(src, page).toMatch(/<UnlockNotice \/>/);
    }
  });
});
