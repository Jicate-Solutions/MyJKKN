// @vitest-environment jsdom

/**
 * PR #4168 repair: a live parent login whose learner record is missing used to
 * get empty pages for ever (every data call 401s while the page gate keeps the
 * login alive). The session provider now shows one clear card with a way out.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
const auth = vi.hoisted(() => ({ logout: vi.fn(async () => ({ ok: true })) }));
const familySvc = vi.hoisted(() => ({ getChildren: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/services/parent/parent-auth-service', () => ({ ParentAuthService: auth }));
vi.mock('@/lib/services/parent/parent-children-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/parent/parent-children-service')>();
  return { ...actual, ParentChildrenService: familySvc };
});

import { ParentSessionProvider } from '@/components/parent/parent-session-provider';
import { ParentApiError } from '@/lib/services/parent/parent-children-service';

function renderProvider() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ParentSessionProvider>
        <div>PARENT SHELL</div>
      </ParentSessionProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ParentSessionProvider — account not linked', () => {
  it('shows the "contact the college office" card instead of the app, with a working Sign out', async () => {
    familySvc.getChildren.mockRejectedValue(
      new ParentApiError(
        "Your account isn't linked to a learner yet — contact the college office.",
        401,
        'not_linked'
      )
    );
    renderProvider();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/isn't linked to a learner yet — contact the college office/)).toBeTruthy();
    expect(screen.queryByText('PARENT SHELL')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/parent/login'));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('any other error still renders the app as before (no card)', async () => {
    familySvc.getChildren.mockRejectedValue(new ParentApiError('Unauthorized', 401));
    renderProvider();
    await waitFor(() => expect(familySvc.getChildren).toHaveBeenCalled());
    expect(screen.getByText('PARENT SHELL')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a linked account renders the app', async () => {
    familySvc.getChildren.mockResolvedValue({ parent: { parentAccountId: 'a', mobile: '1' }, data: [] });
    renderProvider();
    await waitFor(() => expect(familySvc.getChildren).toHaveBeenCalled());
    expect(screen.getByText('PARENT SHELL')).toBeTruthy();
  });
});
