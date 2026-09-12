// @vitest-environment jsdom
//
// The receipt and invoice Email buttons, as staff see them: the button says
// emailing is not available yet, a click shows that message with a Download
// button, nothing is sent, and no "sent successfully" message ever appears.

import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import toast, { Toaster } from 'react-hot-toast';
import {
  EMAIL_NOT_AVAILABLE_LABEL,
  INVOICE_EMAIL_NOT_AVAILABLE,
  RECEIPT_EMAIL_NOT_AVAILABLE
} from '@/lib/services/billing/email-not-available';
import { showEmailNotAvailable } from '@/components/billing/email-not-available-toast';
import { ReceiptActionsClient } from '@/app/(routes)/billing/receipts/[id]/_components/receipt-actions-client';
import { InvoiceActionsClient } from '@/app/(routes)/billing/invoices/[id]/_components/invoice-actions-client';

const mocks = vi.hoisted(() => ({
  downloadReceiptPDF: vi.fn(async () => {}),
  downloadInvoicePDF: vi.fn(async () => {}),
  sendReceipt: vi.fn(),
  sendInvoice: vi.fn(),
  deleteInvoice: vi.fn()
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));
vi.mock('@/lib/services/billing/receipts/billing-receipt-service', () => ({
  BillingReceiptService: {
    downloadReceiptPDF: mocks.downloadReceiptPDF,
    emailReceipt: mocks.sendReceipt
  }
}));
vi.mock('@/app/(routes)/billing/_actions/receipt-actions', () => ({
  sendReceipt: mocks.sendReceipt
}));
vi.mock('@/app/(routes)/billing/_actions/invoice-actions', () => ({
  sendInvoice: mocks.sendInvoice,
  deleteInvoice: mocks.deleteInvoice
}));
vi.mock('@/hooks/billing/use-billing-invoices', () => ({
  useDownloadInvoicePDF: () => ({ downloadPDF: mocks.downloadInvoicePDF, loading: false })
}));
vi.mock('@/hooks/billing/use-receipt-cancellations', () => ({
  usePendingCancellations: () => ({ data: {} })
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ isSuperAdmin: false, canAccess: () => false })
}));
vi.mock('@/components/billing/request-receipt-cancellation-dialog', () => ({
  RequestReceiptCancellationDialog: () => null
}));

beforeAll(() => {
  // react-hot-toast reads prefers-reduced-motion; jsdom has no matchMedia.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => toast.remove());
  cleanup();
  vi.clearAllMocks();
});

const receipt = {
  id: 'r1',
  receipt_number: 'RCPT-001',
  student_id: 'l1',
  // `student` is the row's relation key (billing_receipts/billing_invoices → student), not copy.
  'student': { college_email: 'learner@jkkn.ac.in' }
} as any;

const invoice = {
  id: 'i1',
  invoice_number: 'INV-001',
  // `student` is the row's relation key (billing_receipts/billing_invoices → student), not copy.
  'student': { college_email: 'learner@jkkn.ac.in' }
} as any;

const renderWithToaster = (ui: React.ReactNode) =>
  render(
    <>
      {ui}
      <Toaster />
    </>
  );

const noSuccessClaim = () =>
  expect(document.body.textContent).not.toMatch(/(sent|emailed) successfully/i);

describe('showEmailNotAvailable', () => {
  it('shows the receipt message with a Download button that runs the download', async () => {
    const onDownload = vi.fn();
    renderWithToaster(null);

    act(() => showEmailNotAvailable('receipt', onDownload));

    expect(await screen.findByText(RECEIPT_EMAIL_NOT_AVAILABLE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    noSuccessClaim();
  });

  it('shows the invoice message', async () => {
    renderWithToaster(null);
    act(() => showEmailNotAvailable('invoice', vi.fn()));
    expect(await screen.findByText(INVOICE_EMAIL_NOT_AVAILABLE)).toBeInTheDocument();
  });

  it('repeated clicks show one message, not a stack', async () => {
    renderWithToaster(null);
    act(() => {
      showEmailNotAvailable('receipt', vi.fn());
      showEmailNotAvailable('receipt', vi.fn());
      showEmailNotAvailable('receipt', vi.fn());
    });
    expect(await screen.findAllByText(RECEIPT_EMAIL_NOT_AVAILABLE)).toHaveLength(1);
  });
});

describe('receipt page Email button', () => {
  it('says emailing is not available, sends nothing, and offers Download', async () => {
    renderWithToaster(<ReceiptActionsClient receipt={receipt} />);

    expect(screen.queryByRole('button', { name: /send email/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: EMAIL_NOT_AVAILABLE_LABEL }));

    expect(await screen.findByText(RECEIPT_EMAIL_NOT_AVAILABLE)).toBeInTheDocument();
    expect(mocks.sendReceipt).not.toHaveBeenCalled();
    noSuccessClaim();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(mocks.downloadReceiptPDF).toHaveBeenCalledWith('r1'));
    noSuccessClaim();
  });
});

describe('invoice page Email button', () => {
  it('says emailing is not available, sends nothing, and offers Download', async () => {
    renderWithToaster(<InvoiceActionsClient invoice={invoice} />);

    expect(screen.queryByRole('button', { name: /send email/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: EMAIL_NOT_AVAILABLE_LABEL }));

    expect(await screen.findByText(INVOICE_EMAIL_NOT_AVAILABLE)).toBeInTheDocument();
    expect(mocks.sendInvoice).not.toHaveBeenCalled();
    noSuccessClaim();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(mocks.downloadInvoicePDF).toHaveBeenCalledWith('i1'));
    noSuccessClaim();
  });
});
