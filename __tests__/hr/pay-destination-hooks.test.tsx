// @vitest-environment jsdom
/**
 * The Director-list hooks keep each signed-in account's answers apart (panel
 * round 1, 9 Oct 2026): a second account opened in the same tab must ask the
 * database again, never read the first account's cached "yes" or its list.
 */
import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const auth = vi.hoisted(() => ({ profileId: 'u-director' as string | null }));
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: auth.profileId ? { id: auth.profileId } : null, isLoading: false }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc }),
}));

import { useIsTheDirector, usePayDestinationChanges } from '@/hooks/hr/payroll/use-pay-destination-changes';

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('the Director-list hooks', () => {
  beforeEach(() => {
    rpc.mockReset();
    auth.profileId = 'u-director';
  });

  it('a second account in the same tab asks again instead of reading the first answer', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    const first = renderHook(() => useIsTheDirector(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.data).toBe(true));
    first.unmount();

    auth.profileId = 'u-hr-head';
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const second = renderHook(() => useIsTheDirector(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(second.result.current.data).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('the change list is cached per account too', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => usePayDestinationChanges(7, true), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = client.getQueryCache().findAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(['hr', 'pay-destination-changes', 'u-director', 7]);
  });

  it('nobody signed in: neither asks the database', () => {
    auth.profileId = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useIsTheDirector(), { wrapper: wrapperFor(client) });
    renderHook(() => usePayDestinationChanges(7, true), { wrapper: wrapperFor(client) });
    expect(rpc).not.toHaveBeenCalled();
  });
});
