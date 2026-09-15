// @vitest-environment jsdom
//
// The docblock, not vitest.config.js: `environmentMatchGlobs` is a no-op in
// Vitest 4, so the render tests below need the environment declared here.

/**
 * useNotificationPulse — the shared notification poll.
 *
 * What must hold or the perf change silently fails (or worse, opens a gate):
 *   1. the cadence function backs off: 60 s within 120 s of an interaction,
 *      5 min after — and the first interaction after an idle stretch refetches
 *      once and re-arms the 60 s timer;
 *   2. the query options keep refetchIntervalInBackground OFF (a hidden tab
 *      must not poll) and refetchOnWindowFocus ON (a returning person sees a
 *      fresh gate immediately), and the URL carries no cache-buster (a
 *      `?_t=` would defeat the route's 304);
 *   3. a bare 304 or a failed poll keeps the previous data — it must never
 *      turn into an empty pulse that closes an open mandatory gate mid-read;
 *   4. `?pending=1` is sent only while a pending-actions consumer is mounted.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';

import {
  pulseIntervalFor,
  pulseUrlFor,
  notificationPulseQueryOptions,
  useNotificationPulse,
  usePendingActionsConsumer,
  invalidateNotificationPulse,
  NOTIFICATION_PULSE_KEY,
  PULSE_ACTIVE_INTERVAL_MS,
  PULSE_IDLE_INTERVAL_MS
} from '@/hooks/notification/use-notification-pulse';

const PULSE_URL = '/api/notifications/pulse';

describe('pulseIntervalFor', () => {
  const now = 1_000_000_000;

  it('polls every 60 s while the person interacted within the last 120 s', () => {
    expect(pulseIntervalFor(now, now)).toBe(60_000);
    expect(pulseIntervalFor(now - 119_999, now)).toBe(60_000);
    expect(pulseIntervalFor(now - 120_000, now)).toBe(60_000);
    expect(PULSE_ACTIVE_INTERVAL_MS).toBe(60_000);
  });

  it('backs off to 5 min once the tab has been idle for more than 120 s', () => {
    expect(pulseIntervalFor(now - 120_001, now)).toBe(300_000);
    expect(pulseIntervalFor(now - 3_600_000, now)).toBe(300_000);
    expect(PULSE_IDLE_INTERVAL_MS).toBe(300_000);
  });
});

describe('pulseUrlFor', () => {
  it('asks for pending actions only while a consumer is mounted', () => {
    expect(pulseUrlFor(0)).toBe(PULSE_URL);
    expect(pulseUrlFor(1)).toBe(`${PULSE_URL}?pending=1`);
    expect(pulseUrlFor(3)).toBe(`${PULSE_URL}?pending=1`);
  });
});

describe('notificationPulseQueryOptions', () => {
  it('never polls a hidden tab and refreshes on focus / reconnect', () => {
    expect(notificationPulseQueryOptions.refetchIntervalInBackground).toBe(false);
    expect(notificationPulseQueryOptions.refetchOnWindowFocus).toBe(true);
    expect(notificationPulseQueryOptions.refetchOnReconnect).toBe(true);
    expect(notificationPulseQueryOptions.staleTime).toBe(30_000);
    expect(notificationPulseQueryOptions.queryKey).toEqual(['notification-pulse']);
    expect(NOTIFICATION_PULSE_KEY).toEqual(['notification-pulse']);
  });

  it('exposes the interval as a function so it can back off at runtime', () => {
    const interval = notificationPulseQueryOptions.refetchInterval;
    expect(typeof interval).toBe('function');
    // Module just loaded = "interacted now" → active cadence.
    expect(interval()).toBe(60_000);
  });
});

describe('useNotificationPulse (rendered)', () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function wrapper(client: QueryClient) {
    return ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
  }

  function newClient() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
  }

  function ok(body: unknown) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ackOnly = {
    unacknowledged: [{ id: 'un-1' }],
    pending: null,
    generated_at: '2026-09-13T01:00:00.000Z'
  };

  it('fetches /api/notifications/pulse with no cache-buster and no query string when nobody wants pending', async () => {
    fetchMock.mockResolvedValue(ok(ackOnly));
    vi.stubGlobal('fetch', fetchMock);

    const client = newClient();
    const { result } = renderHook(() => useNotificationPulse(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(PULSE_URL);
    expect(init).toBeUndefined();
    expect(result.current.data?.unacknowledged).toHaveLength(1);
    expect(result.current.data?.pending).toBeNull();

    // The helper the two components call after acknowledge / submit-action.
    await invalidateNotificationPulse(client);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('sends ?pending=1 while a pending-actions consumer is mounted, and stops after it unmounts', async () => {
    const withPending = {
      ...ackOnly,
      pending: { actions: [{ id: 'pa-1', action_type: 'tracked' }], urgent_count: 0, tracked_count: 1 }
    };
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(ok(url.includes('pending=1') ? withPending : ackOnly))
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = newClient();
    const { result, unmount } = renderHook(
      () => {
        usePendingActionsConsumer();
        return useNotificationPulse();
      },
      { wrapper: wrapper(client) }
    );

    await waitFor(() => expect(result.current.data?.pending?.tracked_count).toBe(1));
    expect(fetchMock.mock.calls.every(([url]) => url === `${PULSE_URL}?pending=1`)).toBe(true);

    unmount();
    fetchMock.mockClear();

    // With the widget gone, the next poll from any other observer drops the flag.
    const { result: again } = renderHook(() => useNotificationPulse(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(again.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe(PULSE_URL);
  });

  it('does not fetch while disabled (super admin waiting on permissions)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNotificationPulse({ enabled: false }), {
      wrapper: wrapper(newClient())
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a bare 304 keeps the previous data (never an empty pulse)', async () => {
    fetchMock.mockResolvedValueOnce(ok(ackOnly)).mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = newClient();
    const { result } = renderHook(() => useNotificationPulse(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.data?.unacknowledged).toHaveLength(1));

    await act(async () => {
      await client.refetchQueries({ queryKey: NOTIFICATION_PULSE_KEY });
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.unacknowledged).toEqual([{ id: 'un-1' }]);
  });

  it('a 500 keeps the previous data and marks the query errored', async () => {
    fetchMock.mockResolvedValueOnce(ok(ackOnly)).mockResolvedValueOnce(new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = newClient();
    const { result } = renderHook(() => useNotificationPulse(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.data?.unacknowledged).toHaveLength(1));
    // Read isError once BEFORE the failure: React Query only re-renders for
    // props a consumer has read (tracked props). A consumer that reads only
    // `data` — the gate and the widget — is deliberately NOT re-rendered by a
    // failed poll, which is the "keep the last good data" behaviour itself.
    expect(result.current.isError).toBe(false);

    await act(async () => {
      await client.refetchQueries({ queryKey: NOTIFICATION_PULSE_KEY });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('pulse 500');
    // Last good data survives: an open gate stays open, a populated widget stays populated.
    expect(result.current.data?.unacknowledged).toEqual([{ id: 'un-1' }]);
  });

  it('the first interaction after a 3-minute idle refetches exactly once and re-arms the 60 s cadence', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok(ackOnly)));
    vi.stubGlobal('fetch', fetchMock);

    const client = newClient();
    const { result } = renderHook(() => useNotificationPulse(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Three minutes pass with no interaction.
    const realNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 180_000);
    expect(notificationPulseQueryOptions.refetchInterval()).toBe(300_000);

    // First click after idle → one immediate refetch, cadence back to 60 s.
    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(notificationPulseQueryOptions.refetchInterval()).toBe(60_000);

    // Further clicks while already active do NOT fetch (the timer is running).
    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
      window.dispatchEvent(new Event('keydown'));
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
