// @vitest-environment jsdom
/**
 * Deep-panel round 3 (PR #4343 comment 6101287570): the receipt page and the Record
 * delivery form.
 *   U-L5  the confirmer's third-person answer comes from the database, not the viewer's list
 *   U-L4  a failed earlier-receipts lookup says so instead of "a college you cannot open"
 *   U-M2  every invoice-read request has a timeout, so a hung one cannot spin forever
 *   U-L3  a repeat check that could not run at save time is said so
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
  hasDuplicateInvoice: vi.fn(),
  getSupplierInvoiceGrns: vi.fn(),
  receivedMatchingDelivery: vi.fn(),
  confirmerReceivedMatch: vi.fn(),
}));
vi.mock('@/lib/services/procurement/grn-service', () => ({ ProcurementGrnService: svc }));

import { useGrnDuplicateInvoice } from '@/hooks/procurement/use-grns';
import { DuplicateInvoiceCompare } from '@/components/procurement/duplicate-invoice-compare';

const grn = {
  id: 'g2',
  supplier_id: 'sup1',
  invoice_number: 'INV-5',
  created_at: '2026-10-09T05:00:00Z',
  duplicate_confirmed_by: 'v3',
};
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  svc.hasDuplicateInvoice.mockResolvedValue(true);
  // The viewer can see one earlier receipt — received by v3 is NOT among what they see.
  svc.getSupplierInvoiceGrns.mockResolvedValue([
    { id: 'g1', supplier_id: 'sup1', invoice_number: 'INV-5', status: 'accepted', created_at: '2026-10-08T05:00:00Z', received_by: 'someone' },
  ]);
  svc.receivedMatchingDelivery.mockResolvedValue(false);
  svc.confirmerReceivedMatch.mockResolvedValue(false);
});

describe('U-L5 useGrnDuplicateInvoice — the confirmer is asked of the database', () => {
  it('uses the service (database) answer about the confirmer, not the visible list', async () => {
    // The database knows v3 received a matching delivery at a college the viewer cannot open.
    svc.confirmerReceivedMatch.mockResolvedValue(true);
    const { result } = renderHook(() => useGrnDuplicateInvoice(grn, 'viewer'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.confirmerReceivedMatch).toBe(true);
    expect(svc.confirmerReceivedMatch).toHaveBeenCalledWith(grn, 'viewer');
  });

  it('a failed confirmer lookup fails the check closed (checkFailed)', async () => {
    svc.confirmerReceivedMatch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useGrnDuplicateInvoice(grn, 'viewer'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.checkFailed).toBe(true);
  });

  it('reports listFailed only when the earlier-receipts list itself failed', async () => {
    svc.getSupplierInvoiceGrns.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useGrnDuplicateInvoice(grn, 'viewer'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.listFailed).toBe(true);
    expect(result.current.data?.earlier).toEqual([]);
  });
});

describe('U-L4 DuplicateInvoiceCompare — a failed lookup is not "another college"', () => {
  const current = { invoice_number: 'INV-5', invoice_date: '2026-10-01', invoice_amount: 100 };
  it('says it could not load the earlier receipt', () => {
    render(<DuplicateInvoiceCompare earlier={[]} current={current} hiddenElsewhere checkFailed />);
    expect(screen.getByText(/Could not load the earlier receipt/)).toBeTruthy();
    expect(screen.queryByText(/college you cannot open/)).toBeNull();
  });
  it('still says "a college you cannot open" when the lookup worked and found nothing visible', () => {
    render(<DuplicateInvoiceCompare earlier={[]} current={current} hiddenElsewhere />);
    expect(screen.getByText(/college you cannot open/)).toBeTruthy();
  });
});

// The form's network calls are inside a large component; these pin the two properties the
// panel asked for at the source, so removing either fix fails here.
describe('grn-form.tsx — request timeouts and the save-time notice', () => {
  const src = readFileSync(join(process.cwd(), 'components/procurement/grn-form.tsx'), 'utf8');
  it('U-M2: the status poll and the start request both carry AbortSignal.timeout', () => {
    const status = src.slice(src.indexOf('/api/procurement/grn/extract-invoice/status'));
    expect(status.slice(0, 200)).toMatch(/signal: AbortSignal\.timeout\(INVOICE_STATUS_TIMEOUT_MS\)/);
    const start = src.slice(src.indexOf("fetch('/api/procurement/grn/extract-invoice', {"));
    expect(start.slice(0, 200)).toMatch(/signal: AbortSignal\.timeout\(INVOICE_START_TIMEOUT_MS\)/);
    expect(src).toMatch(/const INVOICE_STATUS_TIMEOUT_MS = \d/);
    expect(src).toMatch(/const INVOICE_START_TIMEOUT_MS = \d/);
  });
  it('U-L3: a repeat check that could not run sets the flag and changes the save message', () => {
    expect(src).toMatch(/repeatCheckRan = false;/);
    expect(src).toMatch(/!repeatCheckRan\)[\s\S]{0,80}toast\.warning\([\s\S]{0,200}could not run/);
  });
});
