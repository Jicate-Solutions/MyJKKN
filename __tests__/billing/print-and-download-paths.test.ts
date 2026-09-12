// @vitest-environment jsdom
//
// The receipt print path and the invoice download path must be honest.
//
// - BillingReceiptService.printReceipt used to fetch the receipt, log it and
//   resolve, so the receipts list reported success while nothing printed. It
//   must now reject with the not-available message and touch no database.
// - The invoice download saves an HTML web page, so the saved file name must
//   end in .html and never .pdf.
// - No billing file may still claim a receipt was printed.

import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INVOICE_DOWNLOAD_LABEL,
  PRINT_NOT_AVAILABLE_LABEL,
  RECEIPT_PRINT_NOT_AVAILABLE,
  invoiceDownloadFileName
} from '@/lib/services/billing/print-and-download-text';

const { noDatabase } = vi.hoisted(() => ({
  noDatabase: () => {
    throw new Error('a print path must not touch the database');
  }
}));

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => ({ from: noDatabase, rpc: noDatabase }))
}));
vi.mock('@/lib/utils/activity-logger-client', () => ({
  logActivityForCurrentUser: vi.fn(),
  BillingActivityTemplates: {}
}));
vi.mock('@/lib/utils/track-usage', () => ({ trackUsage: vi.fn() }));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wording', () => {
  it('the print message says not available yet, points to download, and uses no "student"', () => {
    expect(RECEIPT_PRINT_NOT_AVAILABLE).toMatch(/not available yet/);
    expect(RECEIPT_PRINT_NOT_AVAILABLE).toMatch(/download/i);
    expect(RECEIPT_PRINT_NOT_AVAILABLE).not.toMatch(/student/i);
    expect(PRINT_NOT_AVAILABLE_LABEL).toBe('Print (not available yet)');
  });

  it('the invoice download label says web page, not PDF', () => {
    expect(INVOICE_DOWNLOAD_LABEL).toBe('Download (web page)');
    expect(INVOICE_DOWNLOAD_LABEL).not.toMatch(/pdf/i);
  });
});

describe('BillingReceiptService.printReceipt', () => {
  it('rejects with the not-available message, logs nothing and reads no database', async () => {
    const { BillingReceiptService } = await import(
      '@/lib/services/billing/receipts/billing-receipt-service'
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = vi.spyOn(BillingReceiptService, 'getBillingReceipt');

    await expect(BillingReceiptService.printReceipt('r1')).rejects.toThrow(
      RECEIPT_PRINT_NOT_AVAILABLE
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('invoice download file name', () => {
  it('invoiceDownloadFileName ends in .html', () => {
    expect(invoiceDownloadFileName('INV-2026-001')).toBe('invoice-INV-2026-001.html');
  });

  it('BillingInvoiceService.downloadInvoicePDF saves an .html file of type text/html', async () => {
    const { BillingInvoiceService } = await import(
      '@/lib/services/billing/invoices/billing-invoice-service'
    );
    vi.spyOn(BillingInvoiceService, 'getBillingInvoice').mockResolvedValue({
      id: 'i1',
      invoice_number: 'INV-001',
      invoice_date: '2026-09-10',
      due_date: '2026-09-20',
      grand_total: 1000,
      invoice_items: []
    } as any);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    let savedBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      savedBlob = blob;
      return 'blob:invoice';
    });
    Object.assign(window.URL, { createObjectURL, revokeObjectURL: vi.fn() });

    let savedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      savedName = this.download;
    });

    await BillingInvoiceService.downloadInvoicePDF('i1');

    expect(savedName).toBe('invoice-INV-001.html');
    expect(savedName).not.toMatch(/\.pdf$/i);
    expect(savedBlob?.type).toBe('text/html');
  });
});

// ── Source guard ──────────────────────────────────────────────────────────────

const root = process.cwd();

function filesUnder(dir: string): string[] {
  const abs = path.join(root, dir);
  return readdirSync(abs).flatMap((name) => {
    const full = path.join(abs, name);
    const rel = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
}

const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('no billing surface still claims a receipt was printed', () => {
  const billingFiles = [
    'app/(routes)/billing',
    'hooks/billing',
    'lib/services/billing',
    'components/billing'
  ].flatMap(filesUnder);

  it('scans a real set of files', () => {
    // A guard that matched nothing would pass silently.
    expect(billingFiles.length).toBeGreaterThan(50);
  });

  it('has no "printed successfully" claim anywhere', () => {
    const offenders = billingFiles.filter((file) => /printed successfully/i.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('no billing screen uses the removed print hook or calls printReceipt', () => {
    const screens = billingFiles.filter((file) => file.endsWith('.tsx'));
    const offenders = screens.filter((file) =>
      /\busePrintReceipt\b|\.printReceipt\(/.test(read(file))
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    'app/(routes)/billing/receipts/_components/receipt-list.tsx',
    'app/(routes)/billing/schedule/students/[id]/_components/student-receipts-table.tsx'
  ])('%s: Print says it is not available and offers Download', (file) => {
    const source = read(file);
    expect(source).toContain('showPrintNotAvailable(');
    expect(source).toContain('PRINT_NOT_AVAILABLE_LABEL');
    expect(source).not.toMatch(/Printing receipt:|'Print Receipt'|>\s*Print Receipt\s*</);
  });

  it.each([
    'app/(routes)/billing/invoices/[id]/_components/invoice-actions-client.tsx',
    'app/(routes)/billing/invoices/_components/invoice-list.tsx'
  ])('%s: the invoice download is labelled a web page, not a PDF', (file) => {
    const source = read(file);
    expect(source).toContain('INVOICE_DOWNLOAD_LABEL');
    expect(source).not.toMatch(/'Download PDF'|>\s*Download PDF\s*</);
  });

  it('the invoice service never names the saved file .pdf', () => {
    const source = read('lib/services/billing/invoices/billing-invoice-service.ts');
    expect(source).toContain('invoiceDownloadFileName(');
    expect(source).not.toMatch(/link\.download\s*=\s*[^;\n]*\.pdf/);
  });
});
