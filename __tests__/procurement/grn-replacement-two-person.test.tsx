// @vitest-environment jsdom
/**
 * Director decision 11 Oct 2026 02:00 — a replacement delivery also needs two people.
 * The replacement is recorded as a pending receipt and a second verifier checks it in.
 * These pin what the receipt pages read: where a replacement stands, the origin lookup
 * for the "not the original receiver" test, and that checking a replacement in refreshes
 * the ORIGINAL delivery's replacement list.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
  getReplacementOrigin: vi.fn(),
  verifyGrn: vi.fn(),
}));
vi.mock('@/lib/services/procurement/grn-service', () => ({ ProcurementGrnService: svc }));

import { useReplacementOrigin, useVerifyGrn } from '@/hooks/procurement/use-grns';
import { replacementProgress } from '@/lib/services/procurement/invoice-checks';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  svc.getReplacementOrigin.mockReset();
  svc.verifyGrn.mockReset();
});

describe('replacementProgress — the original delivery page', () => {
  it('pending until someone records it', () => {
    expect(replacementProgress({ status: 'pending' })).toBe('pending');
  });
  it('recorded while its receipt waits for a second person', () => {
    expect(replacementProgress({ status: 'received', receipt: { status: 'pending_verification' } })).toBe('recorded');
    expect(replacementProgress({ status: 'received', receipt: null })).toBe('recorded');
  });
  it('in stock once linked, or once its receipt is posted', () => {
    expect(replacementProgress({ status: 'received', replacement_grn_item_id: 'gi9' })).toBe('received');
    expect(replacementProgress({ status: 'received', receipt: { status: 'completed' } })).toBe('received');
  });
});

describe('useReplacementOrigin', () => {
  it('asks nothing for an ordinary delivery', async () => {
    renderHook(() => useReplacementOrigin(null), { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.getReplacementOrigin).not.toHaveBeenCalled();
  });
  it('reads the replacement a replacement receipt fulfils', async () => {
    svc.getReplacementOrigin.mockResolvedValue({ id: 'rep1', original_received_by: 'orig' });
    const { result } = renderHook(() => useReplacementOrigin('rep1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(svc.getReplacementOrigin).toHaveBeenCalledWith('rep1');
    expect(result.current.data?.original_received_by).toBe('orig');
  });
});

describe('useVerifyGrn — checking a replacement in refreshes the original delivery', () => {
  it('invalidates every replacement list and origin lookup', async () => {
    svc.verifyGrn.mockResolvedValue({ id: 'g9', purchase_order_id: 'po1' });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useVerifyGrn(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'g9', userId: 'v3' });
    });
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(['procurement-grn-replacements']),
        JSON.stringify(['procurement-grn-replacement-origin']),
      ])
    );
  });
});
