// @vitest-environment jsdom
//
// PR #4304, deep review round 4 (#6): when the database refuses a division
// edit (trg_tournament_division_results_lock), the organiser must see the
// database's own sentence. The Edit dialog's catch deliberately does not toast
// (that would show it twice): the toast comes from useUpdateDivision's onError.
// This proves that end of it with the real hook.
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const LOCK_MESSAGE =
  'This division already has recorded results; its sport, category or format cannot change. Add a new division instead.';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: toastError } }));
vi.mock('@/lib/services/events/tournament/tournament-event-service', () => ({
  TournamentEventService: {
    // TournamentEventService.updateDivision throws new Error(error.message).
    updateDivision: vi.fn(async () => {
      throw new Error(LOCK_MESSAGE);
    }),
  },
}));

import { useUpdateDivision } from '@/hooks/events/use-tournaments';

describe('useUpdateDivision — refused by the results lock', () => {
  it("toasts the database's refusal text and rejects mutateAsync", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateDivision(), { wrapper });

    await expect(
      result.current.mutateAsync({ id: 'd-chess', eventId: 'ev-1', dto: { sport: 'Carrom' } })
    ).rejects.toThrow(LOCK_MESSAGE);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(LOCK_MESSAGE));
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
