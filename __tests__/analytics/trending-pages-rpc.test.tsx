// @vitest-environment jsdom
/**
 * The command-palette "trending pages" list reads an aggregate RPC, never the
 * raw usage_events rows (which, after 20271010094500, only institution admins
 * may read).
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

describe('useTrendingPages', () => {
  it('calls fn_usage_trending_pages and maps its counts, without touching usage_events', async () => {
    rpc.mockResolvedValue({
      data: [
        { module: 'billing/invoices', page_path: '/billing/invoices', visit_count: '12' },
        { module: 'attendance', page_path: '/attendance', visit_count: 3 },
      ],
      error: null,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useTrendingPages(5), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('fn_usage_trending_pages', { p_days: 7, p_limit: 5 });
    expect(from).not.toHaveBeenCalled();
    expect(result.current.data?.map((p) => [p.path, p.title, p.module, p.visitCount])).toEqual([
      ['/billing/invoices', 'Invoices', 'billing', 12],
      ['/attendance', 'Attendance', 'attendance', 3],
    ]);
  });
});
