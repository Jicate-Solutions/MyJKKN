// @vitest-environment jsdom
/**
 * app/page.tsx — the PWA's start_url. Only a TRULY missing session may go to
 * the sign-in page; a network error shows "Reconnecting…" and tries again.
 * The service-worker caches are no longer wiped on every launch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, waitFor } from '@testing-library/react';
import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';

const replace = vi.fn();
// Stable across renders, as Next's real router is.
const router = { replace };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/ui/ai-chip', () => ({ default: () => null }));

let userAnswers: Array<{ user: unknown; error: unknown }>;
let getUserCalls = 0;
const getUser = vi.fn(async () => {
  const answer = userAnswers[Math.min(getUserCalls, userAnswers.length - 1)];
  getUserCalls += 1;
  return { data: { user: answer.user }, error: answer.error };
});

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    auth: { getUser },
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({ data: { role: 'faculty', profile_completed: true }, error: null }),
      };
      return builder;
    },
  }),
}));

const USER = { id: 'u1' };

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  replace.mockClear();
  getUser.mockClear();
  getUserCalls = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
});

async function renderRoot() {
  const { default: RootPage } = await import('@/app/page');
  render(<RootPage />);
  await flush();
}

describe('root page (PWA start_url)', () => {
  it('a missing session goes to the sign-in page', async () => {
    userAnswers = [{ user: null, error: new AuthSessionMissingError() }];
    await renderRoot();
    expect(replace).toHaveBeenCalledWith('/auth/login');
  });

  it('a network error shows Reconnecting… and retries — it does NOT go to sign-in', async () => {
    userAnswers = [
      { user: null, error: new AuthRetryableFetchError('fetch failed', 0) },
      { user: USER, error: null },
    ];
    await renderRoot();

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('Reconnecting…')).toBeTruthy();

    // First retry is scheduled 1 s later (real timers).
    await waitFor(() => expect(replace).toHaveBeenCalled(), { timeout: 3_000 });

    expect(getUserCalls).toBe(2);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toMatch(/^\/dashboard\?v=/);
  });

  it('a thrown fetch error is retried too, not treated as signed out', async () => {
    getUser.mockImplementationOnce(async () => {
      getUserCalls += 1;
      throw new TypeError('Failed to fetch');
    });
    userAnswers = [{ user: USER, error: null }];
    await renderRoot();

    expect(replace).not.toHaveBeenCalledWith('/auth/login');
    expect(screen.getByText('Reconnecting…')).toBeTruthy();
  });

  it('does not delete the service-worker caches on launch', async () => {
    const del = vi.fn();
    const keys = vi.fn(async () => ['serwist-precache']);
    (globalThis as any).caches = { keys, delete: del };
    userAnswers = [{ user: USER, error: null }];
    await renderRoot();

    expect(keys).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    delete (globalThis as any).caches;
  });
});
