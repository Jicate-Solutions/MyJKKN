// @vitest-environment jsdom
/**
 * `can` must keep its identity across renders.
 *
 * Pages list `can` in useEffect deps. When it was a fresh arrow every render,
 * an effect that fetched and set state re-ran on every render — the learner
 * Leave/OnDuty apply page re-read learners_profiles ~7x/second in prod.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';

// Super admin short-circuits the permission query, so no network is touched.
const profile = { id: 'u1', role: 'super_admin', is_super_admin: true };
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile, isLoading: false, error: null })
}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn() }));

import { usePermissions } from '@/hooks/use-permissions';

describe('usePermissions().can', () => {
  it('is the same function across re-renders once loaded', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.can;
    rerender();
    rerender();

    expect(result.current.can).toBe(first);
    expect(result.current.can('anything.view')).toBe(true);
  });
});
