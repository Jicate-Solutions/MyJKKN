// @vitest-environment jsdom
// BUG-006273: the real useRecordEventWinners hook sends the whole set in ONE
// POST (the database applies it in one transaction) and refreshes the winners
// even when the save fails.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { useRecordEventWinners } from '@/hooks/events/use-event-winners';

const fetchMock = vi.fn();

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => useRecordEventWinners('ev-1'), { wrapper }) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useRecordEventWinners', () => {
  it('POSTs every change in one request', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, updated: 2 }), { status: 200 }));
    const { result } = setup();
    const changes = [
      { registrationId: 'a', final_rank: null },
      { registrationId: 'b', final_rank: 1 },
    ];
    await act(() => result.current.mutateAsync(changes));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/events/ev-1/winners');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ changes });
    // A hung server cannot leave Save disabled for ever.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('surfaces a refusal and still refreshes the winners', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Only the creator' }), { status: 403 }));
    const { result, invalidate } = setup();
    let err: Error | undefined;
    await act(async () => {
      await result.current.mutateAsync([{ registrationId: 'b', final_rank: 1 }]).catch((e) => (err = e));
    });
    expect(err?.message).toBe('Only the creator');
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['event-winners', 'ev-1'] }));
  });
});
