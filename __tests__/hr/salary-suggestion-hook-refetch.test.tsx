// @vitest-environment jsdom
/**
 * The Suggest panel stays mounted between openings — only `enabled` flips — and
 * the app's QueryClient keeps data fresh for 5 minutes. Without `staleTime: 0`
 * on this hook, reopening the panel after the rule changed showed the figure
 * worked out under the OLD rule (found in the browser check, 29 Sep 2026).
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-hook-refetch.test.tsx
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSalarySuggestion } from '@/hooks/hr/use-salary-suggestion';

const ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useSalarySuggestion', () => {
  it('asks the server again every time the panel is reopened, even inside the app-wide fresh window', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ suggestion: {}, ruleUpdatedAt: null })));
    vi.stubGlobal('fetch', fetchMock);
    // The same default the app's provider sets (providers/query-client-provider.tsx).
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } } });
    // Props (the rendered hook) are passed straight through to the provider.
    const wrapper = (props: { [key: string]: ReactNode }) => <QueryClientProvider client={client} {...props} />;

    const { rerender } = renderHook(({ open }) => useSalarySuggestion(open ? ID : null, { enabled: open }), {
      wrapper,
      initialProps: { open: true },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`/api/hr/payroll/salary-suggestions?staffId=${ID}`);

    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('fetches nothing until the panel is opened', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    renderHook(() => useSalarySuggestion(null, { enabled: false }), {
      wrapper: (props: { [key: string]: ReactNode }) => <QueryClientProvider client={client} {...props} />,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
