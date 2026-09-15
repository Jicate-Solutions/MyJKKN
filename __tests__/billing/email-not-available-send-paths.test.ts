// Every receipt and invoice "send" path must fail honestly.
//
// Until 2026-09-11 the Send Email buttons reported success while nothing was
// sent: the server actions returned `success: true` over a TODO, the receipt
// service logged and resolved, and the invoice service simulated a send with a
// 1.5 s delay and a fake success log. These tests pin the honest behaviour:
// every path fails with a message that points staff to Download, touches no
// database, and no billing file still carries a "sent successfully" claim.

import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  INVOICE_EMAIL_NOT_AVAILABLE,
  RECEIPT_EMAIL_NOT_AVAILABLE
} from '@/lib/services/billing/email-not-available';

const { noDatabase } = vi.hoisted(() => ({
  noDatabase: () => {
    throw new Error('a send path must not touch the database');
  }
}));

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/lib/cache', () => ({ cacheTags: {} }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(noDatabase) }));
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

describe('receipt and invoice send paths never report success', () => {
  it('messages say emailing is not available yet and point to download', () => {
    for (const message of [RECEIPT_EMAIL_NOT_AVAILABLE, INVOICE_EMAIL_NOT_AVAILABLE]) {
      expect(message).toMatch(/not available yet/);
      expect(message).toMatch(/download/i);
      expect(message).not.toMatch(/student/i);
    }
  });

  it('sendReceipt server action returns success: false with the receipt message', async () => {
    const { sendReceipt } = await import('@/app/(routes)/billing/_actions/receipt-actions');
    await expect(sendReceipt('r1', 'learner@jkkn.ac.in')).resolves.toEqual({
      success: false,
      error: RECEIPT_EMAIL_NOT_AVAILABLE
    });
  });

  it('sendInvoice server action returns success: false with the invoice message', async () => {
    const { sendInvoice } = await import('@/app/(routes)/billing/_actions/invoice-actions');
    await expect(sendInvoice('i1', 'learner@jkkn.ac.in')).resolves.toEqual({
      success: false,
      error: INVOICE_EMAIL_NOT_AVAILABLE
    });
  });

  it('BillingReceiptService.emailReceipt rejects with the receipt message', async () => {
    const { BillingReceiptService } = await import(
      '@/lib/services/billing/receipts/billing-receipt-service'
    );
    await expect(BillingReceiptService.emailReceipt('r1', 'learner@jkkn.ac.in')).rejects.toThrow(
      RECEIPT_EMAIL_NOT_AVAILABLE
    );
  });

  it('BillingInvoiceService.sendInvoice rejects at once, with no simulated delay or success log', async () => {
    const { BillingInvoiceService } = await import(
      '@/lib/services/billing/invoices/billing-invoice-service'
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const started = Date.now();

    await expect(BillingInvoiceService.sendInvoice('i1', 'learner@jkkn.ac.in')).rejects.toThrow(
      INVOICE_EMAIL_NOT_AVAILABLE
    );

    expect(Date.now() - started).toBeLessThan(500);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('BillingInvoiceServiceOptimized.sendInvoice rejects with the invoice message', async () => {
    const { BillingInvoiceServiceOptimized } = await import(
      '@/lib/services/billing/invoices/billing-invoice-service-optimized'
    );
    await expect(
      BillingInvoiceServiceOptimized.sendInvoice('i1', 'learner@jkkn.ac.in')
    ).rejects.toThrow(INVOICE_EMAIL_NOT_AVAILABLE);
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

describe('no billing surface still claims a receipt or invoice was sent', () => {
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

  it('has no "sent successfully" / "emailed successfully" claim for a receipt, invoice or email', () => {
    const offenders = billingFiles.filter((file) =>
      /(receipt|invoice|email)[^\n]{0,40}(sent|emailed) successfully/i.test(read(file))
    );
    expect(offenders).toEqual([]);
  });

  it('no billing screen calls a send path or a removed send hook', () => {
    const screens = billingFiles.filter(
      (file) => file.endsWith('.tsx') && !file.startsWith('app/(routes)/billing/_actions')
    );
    const offenders = screens.filter((file) =>
      /\b(sendReceipt|sendInvoice|emailReceipt|useEmailReceipt|useSendInvoice)\b/.test(read(file))
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    ['app/(routes)/billing/receipts/[id]/_components/receipt-actions-client.tsx', 'receipt'],
    ['app/(routes)/billing/receipts/_components/receipt-list.tsx', 'receipt'],
    ['app/(routes)/billing/schedule/students/[id]/_components/student-receipts-table.tsx', 'receipt'],
    ['app/(routes)/billing/invoices/[id]/_components/invoice-actions-client.tsx', 'invoice'],
    ['app/(routes)/billing/invoices/_components/invoice-list.tsx', 'invoice']
  ])('%s: the Email entry point says it is not available and offers Download', (file, kind) => {
    const source = read(file);
    expect(source).toContain(`showEmailNotAvailable('${kind}'`);
    expect(source).toContain('EMAIL_NOT_AVAILABLE_LABEL');
    expect(source).not.toMatch(/'Send Email'|>\s*Email\s*</);
  });
});
