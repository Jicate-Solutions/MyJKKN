// @vitest-environment jsdom
/**
 * Deep-panel round 1, L5 (PR #4296): while the repeated-invoice lookup is loading, or when
 * one of its lookups fails, the receipt page must not read the missing answer as "no
 * repeat" and offer "Check & add to stock" on a receipt that may be held.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
  hasDuplicateInvoice: vi.fn(),
  getSupplierInvoiceGrns: vi.fn(),
  receivedMatchingDelivery: vi.fn(),
}));
vi.mock('@/lib/services/procurement/grn-service', () => ({ ProcurementGrnService: svc }));

import { useGrnDuplicateInvoice } from '@/hooks/procurement/use-grns';
import { duplicateCheckUnknown } from '@/lib/services/procurement/invoice-checks';

const grn = { id: 'g2', supplier_id: 'sup1', invoice_number: 'INV-5', created_at: '2026-10-09T05:00:00Z' };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  svc.hasDuplicateInvoice.mockResolvedValue(false);
  svc.getSupplierInvoiceGrns.mockResolvedValue([]);
  svc.receivedMatchingDelivery.mockResolvedValue(false);
});

describe('useGrnDuplicateInvoice — one failed lookup', () => {
  it('reports checkFailed (and still returns what it found) when the duplicate lookup throws', async () => {
    svc.hasDuplicateInvoice.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useGrnDuplicateInvoice(grn, 'v2'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toMatchObject({ checkFailed: true, earlier: [] });
  });

  it('reports checkFailed when the visible-receipts lookup throws', async () => {
    svc.getSupplierInvoiceGrns.mockRejectedValue(new Error('rls'));
    const { result } = renderHook(() => useGrnDuplicateInvoice(grn, 'v2'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.checkFailed).toBe(true);
  });

  it('checkFailed is false when every lookup answers', async () => {
    const { result } = renderHook(() => useGrnDuplicateInvoice(grn, 'v2'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.checkFailed).toBe(false);
  });
});

describe('duplicateCheckUnknown — the page fails closed', () => {
  const base = { pending: true, invoiceNumber: 'INV-5', loading: false, failed: false };
  it('is unknown while loading or failed, for a pending receipt with an invoice number', () => {
    expect(duplicateCheckUnknown({ ...base, loading: true })).toBe(true);
    expect(duplicateCheckUnknown({ ...base, failed: true })).toBe(true);
  });
  it('is known once the lookup answered', () => {
    expect(duplicateCheckUnknown(base)).toBe(false);
  });
  it('does not block a receipt that is not pending, or has no invoice number', () => {
    expect(duplicateCheckUnknown({ ...base, pending: false, failed: true })).toBe(false);
    expect(duplicateCheckUnknown({ ...base, invoiceNumber: '  ', failed: true })).toBe(false);
  });
});
