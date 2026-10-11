// @vitest-environment jsdom
// #4347 round 5: the bulk-import "can write" answer belongs to the signed-in
// person. Its cache key carries their id, so signing out and back in as someone
// else asks the server again instead of reusing the previous person's answer.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const who = vi.hoisted(() => ({ profile: { id: 'person-a' } as { id: string } | null }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ profile: who.profile }) }));

import { useCanWriteRegistrations } from '@/hooks/events/shared/use-event-bulk-register';

const EV = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  who.profile = { id: 'person-a' };
});

describe('useCanWriteRegistrations', () => {
  it('keys the answer by the signed-in person, so a different person is asked afresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ canWrite: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ canWrite: false })));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(() => useCanWriteRegistrations(EV), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(true));

    who.profile = { id: 'person-b' };
    rerender();
    await waitFor(() => expect(result.current.data).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('action=can-write');
  });

  it('does not ask while nobody is signed in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    who.profile = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCanWriteRegistrations(EV), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
