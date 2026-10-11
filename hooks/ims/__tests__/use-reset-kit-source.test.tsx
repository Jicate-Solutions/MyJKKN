// @vitest-environment jsdom
// #4346 panel LOW-5: kit_source lives on the ITEM, which may sit in several
// rules — a reset must refresh every rule's item list, not only the current one.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/services/ims/kit-service', () => ({
  ImsKitService: { resetKitSource: vi.fn().mockResolvedValue(undefined) },
}));

import { useResetKitSource } from '../use-ims-kits';

describe('useResetKitSource', () => {
  it('invalidates the whole ims-kit-rule-items family and the item lists', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useResetKitSource(), { wrapper });
    result.current.mutate({ itemId: 'item-1', callerRole: 'store_admin' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(['ims-kit-rule-items']);
    expect(keys).toContainEqual(['ims-items']);
    // Never only one rule's key.
    expect(keys.some((k) => k[0] === 'ims-kit-rule-items' && k.length > 1)).toBe(false);
  });
});
