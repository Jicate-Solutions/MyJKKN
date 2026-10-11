// @vitest-environment jsdom
/**
 * The command-palette "trending" list reads an aggregate RPC that returns
 * top-level module keys only (never paths, never raw usage_events rows — those
 * only institution admins may read after 20271011110000). Each key is mapped to
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

  it('maps known usage-key aliases to their module hubs, once each', async () => {
    rpc.mockResolvedValue({
      data: [
        { module: 'students', visit_count: 85 },
        { module: 'dashboard', visit_count: 60 },
        { module: 'organization', visit_count: 40 },
        { module: 'bug-reports', visit_count: 30 },
        { module: 'learners', visit_count: 20 },
        // hubs exist but have no modules.ts entry: dropped
        { module: 'cdc', visit_count: 19 },
        { module: 'instasolver', visit_count: 18 },
        { module: 'guide', visit_count: 17 },
        { module: 'my-desk', visit_count: 16 },
        // prototype keys must not resolve through the alias map
        { module: 'constructor', visit_count: 15 },
        { module: '__proto__', visit_count: 14 },
      ],
      error: null,
    });
    const { result } = run(10);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((p) => [p.path, p.title, p.visitCount])).toEqual([
      ['/learners', 'Learners', 85],
      ['/dashboard', 'Dashboard (Classic)', 60],
      ['/organizations', 'Organizations', 40],
      ['/my-bug-reports', 'My Bug Reports', 30],
    ]);
  });

  it.each([0, -3])('returns [] without calling the RPC when limit is %s', async (limit) => {
    rpc.mockClear();
    const { result } = run(limit);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['PGRST202 (function not in schema cache)', { error: { code: 'PGRST202', message: 'Could not find the function' }, data: null }],
    ['42883 (undefined_function)', { error: { code: '42883', message: 'function does not exist' }, data: null }],
    ['a generic error', { error: { code: '500', message: 'boom' }, data: null }],
  ])('treats %s as "no trending": [] and a warning, never an error', async (_label, response) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockResolvedValue(response);
    const { result } = run(5);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('treats a rejected RPC call (network failure) as "no trending"', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = run(5);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rounds a fractional limit up (2.5 -> 3)', async () => {
    rpc.mockResolvedValue({
      data: [
        { module: 'billing', visit_count: 40 },
        { module: 'hr', visit_count: 30 },
        { module: 'events', visit_count: 20 },
        { module: 'academic', visit_count: 10 },
      ],
      error: null,
    });
    const { result } = run(2.5);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenLastCalledWith('fn_usage_trending_pages', { p_days: 7, p_limit: 12 });
    expect(result.current.data?.map((p) => p.path)).toEqual(['/billing', '/hr', '/events']);
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
