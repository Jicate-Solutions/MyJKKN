// @vitest-environment jsdom
// BUG-006252: the real useRecordPlacings hook (not mocked) sends one PATCH per
// change, in the order given — clears first — and refreshes the entries even
// when a PATCH fails part-way.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const updateEntry = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/events/tournament/tournament-registration-service', () => ({
  TournamentRegistrationService: { updateEntry },
}));

import { useRecordPlacings } from '@/hooks/events/use-tournament-registrations';

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => useRecordPlacings('ev-1'), { wrapper }) };
}

beforeEach(() => updateEntry.mockReset());

describe('useRecordPlacings', () => {
  it('PATCHes each change in order, a clear as final_rank null', async () => {
    updateEntry.mockResolvedValue({});
    const { result } = setup();
    await act(() =>
      result.current.mutateAsync([
        { entryId: 'w', final_rank: null },
        { entryId: 'b', final_rank: 1 },
      ]),
    );
    expect(updateEntry.mock.calls).toEqual([
      ['ev-1', 'w', { final_rank: null }],
      ['ev-1', 'b', { final_rank: 1 }],
    ]);
  });

  it('stops at the first failure and still refreshes the entries', async () => {
    updateEntry.mockRejectedValueOnce(new Error('boom'));
    const { result, invalidate } = setup();
    await act(async () => {
      await result.current
        .mutateAsync([
          { entryId: 'a', final_rank: null },
          { entryId: 'b', final_rank: 1 },
        ])
        .catch(() => undefined);
    });
    expect(updateEntry).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tournament-entries', 'ev-1'] }),
    );
  });
});
