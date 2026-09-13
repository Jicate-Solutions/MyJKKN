// @vitest-environment jsdom
//
// The docblock, not vitest.config.js: `environmentMatchGlobs` is a no-op in
// Vitest 4, so the render test below needs the environment declared here.

/**
 * useNotificationPulse — the shared notification poll.
 *
 * Two things must hold or the perf change silently fails:
 *   1. the cadence function backs off: 60 s within 120 s of an interaction,
 *      5 min after;
 *   2. the query options keep refetchIntervalInBackground OFF (a hidden tab
 *      must not poll) and refetchOnWindowFocus ON (a returning person sees a
 *      fresh gate immediately), and the URL carries no cache-buster (a
 *      `?_t=` would defeat the route's 304).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import {
  pulseIntervalFor,
  notificationPulseQueryOptions,
  useNotificationPulse,
  invalidateNotificationPulse,
  NOTIFICATION_PULSE_KEY,
  PULSE_ACTIVE_INTERVAL_MS,
  PULSE_IDLE_INTERVAL_MS
} from '@/hooks/notification/use-notification-pulse';

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
  });

  function wrapper(client: QueryClient) {
    return ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
  }

  it('fetches /api/notifications/pulse with no cache-buster and exposes both halves', async () => {
    const payload = {
      unacknowledged: [{ id: 'un-1' }],
      pending: { actions: [{ id: 'pa-1', action_type: 'tracked' }], urgent_count: 0, tracked_count: 1 },
      generated_at: '2026-09-13T01:00:00.000Z'
    };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationPulse(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/notifications/pulse');
    expect(init).toBeUndefined();
    expect(result.current.data?.unacknowledged).toHaveLength(1);
    expect(result.current.data?.pending.tracked_count).toBe(1);

    // The helper the two components call after acknowledge / submit-action.
    await invalidateNotificationPulse(client);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('does not fetch while disabled (super admin waiting on permissions)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationPulse({ enabled: false }), {
      wrapper: wrapper(client)
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to an empty pulse on a non-OK response (same as the old per-component fetches)', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationPulse(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.unacknowledged).toEqual([]);
    expect(result.current.data?.pending.actions).toEqual([]);
  });
});
