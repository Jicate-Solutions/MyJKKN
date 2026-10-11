// @vitest-environment jsdom
/**
 * The command-palette "trending" list reads an aggregate RPC that returns
 * top-level module keys only (never paths, never raw usage_events rows — those
 * only institution admins may read after 20271010094500). Each key is mapped to
 * its hub href from lib/navigation/modules.ts; unknown keys are dropped.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';

const profile = { id: 'u1', institution_id: 'inst-a', role: 'staff' };
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile, isLoading: false, error: null }),
}));

const rpc = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc, from }),
}));

import { useTrendingPages } from '@/components/CommandPalette/TrendingPages';

function run(limit: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTrendingPages(limit), { wrapper });
}

describe('useTrendingPages', () => {
  it('calls fn_usage_trending_pages and renders module hub links, without touching usage_events', async () => {
    rpc.mockResolvedValue({
      data: [
        { module: 'billing', visit_count: '12' },
        { module: 'academic', visit_count: 3 },
      ],
      error: null,
    });
    const { result } = run(5);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('fn_usage_trending_pages', { p_days: 7, p_limit: 20 });
    expect(from).not.toHaveBeenCalled();
    expect(result.current.data?.map((p) => [p.path, p.title, p.module, p.visitCount])).toEqual([
      ['/billing', 'Billing', 'billing', 12],
      ['/academic', 'Academic', 'academic', 3],
    ]);
  });

  it('drops keys with no known module and never builds an href from DB text', async () => {
    rpc.mockResolvedValue({
      data: [
        { module: 'john-doe', visit_count: 900 },
        { module: 'students/22CSE001', visit_count: 800 },
        { module: '//evil.com', visit_count: 700 },
        { module: '', visit_count: 600 },
        { module: null, visit_count: 500 },
        { module: 'staff', visit_count: 4 },
      ],
      error: null,
    });
    const { result } = run(5);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((p) => p.path)).toEqual(['/staff']);
  });

  it('returns at most `limit` known modules from the over-fetched rows', async () => {
    rpc.mockResolvedValue({
      data: [
        { module: 'unknown-a', visit_count: 50 },
        { module: 'billing', visit_count: 40 },
        { module: 'hr', visit_count: 30 },
        { module: 'events', visit_count: 20 },
      ],
      error: null,
    });
    const { result } = run(2);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenLastCalledWith('fn_usage_trending_pages', { p_days: 7, p_limit: 8 });
    expect(result.current.data?.map((p) => p.path)).toEqual(['/billing', '/hr']);
  });
});
