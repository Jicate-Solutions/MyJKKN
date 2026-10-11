// @vitest-environment jsdom
// #4347 round 6: the board's access check must never mistake a failed check
// for a refusal. A 500, a network error or a timeout shows "Couldn't check
// access" with Retry; only an explicit { canWrite: false } shows the refusal;
// a failed background re-check keeps an organiser's board. Real hook, real
// React Query; only sign-in and fetch are faked.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const who = vi.hoisted(() => ({ profile: { id: 'organiser-1' } as { id: string } | null }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ profile: who.profile }) }));

import { BulkImportBoard } from '@/components/events/shared/bulk-import-board';
import {
  useCanWriteRegistrations,
  CAN_WRITE_TIMEOUT_MS,
} from '@/hooks/events/shared/use-event-bulk-register';

const EV = '11111111-1111-4111-8111-111111111111';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** fetch stub: can-write answers come from `answers` in order; categories always empty. */
function stubFetch(answers: Array<() => Promise<Response>>) {
  const canWriteCalls: unknown[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('action=can-write')) {
      canWriteCalls.push(init);
      const next = answers.shift();
      if (!next) throw new Error('unexpected extra access check');
      return next();
    }
    return json({ data: [] });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, canWriteCalls };
}

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BulkImportBoard eventId={EV} canManage />
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  who.profile = { id: 'organiser-1' };
});

describe('BulkImportBoard access check failures', () => {
  it('a 500 shows Retry, not the refusal, and Retry asks again', async () => {
    const { canWriteCalls } = stubFetch([
      async () => json({ error: 'boom' }, 500),
      async () => json({ canWrite: true }),
    ]);
    renderBoard();
    await screen.findByText(/Couldn't check access/);
    expect(screen.queryByText(/Only the event's organisers/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Bulk Import');
    expect(canWriteCalls).toHaveLength(2);
  });

  it('a network error shows Retry, not the refusal', async () => {
    stubFetch([async () => Promise.reject(new TypeError('Failed to fetch'))]);
    renderBoard();
    await screen.findByText(/Couldn't check access/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText(/Only the event's organisers/)).toBeNull();
  });

  it('an explicit { canWrite: false } shows the refusal note', async () => {
    stubFetch([async () => json({ canWrite: false })]);
    renderBoard();
    await screen.findByText(/Only the event's organisers can bulk-import registrations/);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a 200 without a canWrite answer is an error, not a refusal', async () => {
    stubFetch([async () => json({})]);
    renderBoard();
    await screen.findByText(/Couldn't check access/);
  });

  it('a failed background re-check after a yes keeps the board and its buttons', async () => {
    stubFetch([async () => json({ canWrite: true }), async () => json({ error: 'boom' }, 502)]);
    const client = renderBoard();
    await screen.findByText('Bulk Import');

    await act(async () => {
      await client.refetchQueries({ queryKey: ['event-bulk-register-can-write'] });
    });
    await waitFor(() =>
      expect(client.getQueryState(['event-bulk-register-can-write', EV, 'organiser-1'])?.status).toBe('error'),
    );
    expect(screen.getByText('Bulk Import')).toBeTruthy();
    expect(screen.getByRole('button', { name: /template/i })).toBeTruthy();
    expect(screen.queryByText(/Couldn't check access/)).toBeNull();
    expect(screen.queryByText(/Only the event's organisers/)).toBeNull();
  });

  it('with nobody signed in it neither asks nor spins', async () => {
    const { canWriteCalls } = stubFetch([]);
    who.profile = null;
    renderBoard();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Checking access/)).toBeNull();
    expect(screen.queryByText(/Only the event's organisers/)).toBeNull();
    expect(canWriteCalls).toHaveLength(0);
  });
});

describe('useCanWriteRegistrations timeout', () => {
  it('passes an abort signal that fires after the timeout', async () => {
    // Hand the hook a timeout signal we control, then fire it.
    const timeoutController = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            seen = init?.signal ?? undefined;
            seen?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')));
          }),
      ),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCanWriteRegistrations(EV), { wrapper });

    await waitFor(() => expect(seen).toBeDefined());
    expect(timeoutSpy).toHaveBeenCalledWith(CAN_WRITE_TIMEOUT_MS);
    expect(seen!.aborted).toBe(false);

    timeoutController.abort(new DOMException('timed out', 'TimeoutError'));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(seen!.aborted).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
