// @vitest-environment jsdom
//
// The billing Print and Download buttons, as staff see them.
//
// Until 2026-09-11: Print on the receipts list showed a success message and
// printed nothing; Print on a learner's bills page did nothing when clicked;
// invoice "Download PDF" saved a web page, not a PDF.
//
// Now: those Print buttons say printing is not available yet, a click shows
// that message with a Download button that runs the working download, and no
// "printed successfully" message ever appears. The invoice download is
// labelled "Download (web page)".

import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import toast, { Toaster } from 'react-hot-toast';
import {
  INVOICE_DOWNLOAD_LABEL,
  PRINT_NOT_AVAILABLE_LABEL,
  RECEIPT_PRINT_NOT_AVAILABLE
} from '@/lib/services/billing/print-and-download-text';
import { showPrintNotAvailable } from '@/components/billing/email-not-available-toast';
import { ReceiptList } from '@/app/(routes)/billing/receipts/_components/receipt-list';
import { StudentReceiptsTable } from '@/app/(routes)/billing/schedule/students/[id]/_components/student-receipts-table';
import { InvoiceActionsClient } from '@/app/(routes)/billing/invoices/[id]/_components/invoice-actions-client';
import { InvoiceList } from '@/app/(routes)/billing/invoices/_components/invoice-list';

const mocks = vi.hoisted(() => ({
  downloadReceiptPDF: vi.fn(async () => {}),
  printReceipt: vi.fn(async () => {}),
  downloadInvoicePDF: vi.fn(async () => {})
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
// Radix menus do not open under jsdom; render every item inline so each
// menu entry can be clicked the way staff click it.
vi.mock('@/components/ui/dropdown-menu', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({
      children,
      onClick,
      disabled,
      asChild
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      asChild?: boolean;
    }) =>
      asChild ? (
        <>{children}</>
      ) : (
        <button type='button' role='menuitem' onClick={onClick} disabled={disabled}>
          {children}
        </button>
      )
  };
});
vi.mock('@/components/ui/pagination', () => ({ PaginationWithControls: () => null }));
vi.mock('@/lib/services/billing/receipts/billing-receipt-service', () => ({
  BillingReceiptService: {
    downloadReceiptPDF: mocks.downloadReceiptPDF,
    printReceipt: mocks.printReceipt,
    deleteBillingReceipt: vi.fn()
  }
}));
// usePrintReceipt is deliberately absent: a screen that still imported it
// would crash here.
vi.mock('@/hooks/billing/use-billing-receipts', () => ({
  useDownloadReceiptPDF: () => ({ mutateAsync: mocks.downloadReceiptPDF, isPending: false }),
  useVoidBillingReceipt: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })
}));
vi.mock('@/hooks/billing/use-billing-invoices', () => ({
  useDownloadInvoicePDF: () => ({ downloadPDF: mocks.downloadInvoicePDF, loading: false }),
  useDeleteBillingInvoice: () => ({ deleteInvoice: vi.fn(), loading: false })
}));
vi.mock('@/app/(routes)/billing/_actions/invoice-actions', () => ({
  deleteInvoice: vi.fn()
}));
vi.mock('@/hooks/billing/use-receipt-cancellations', () => ({
  usePendingCancellations: () => ({ data: {} }),
  useRequestReceiptCancellation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ isSuperAdmin: true, canAccess: () => true })
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
  receipt_date: '2026-09-10',
  payment_paid_date: '2026-09-10',
  created_at: '2026-09-10T10:00:00Z',
  payment_mode: 'cash',
  payment_amount: 1000,
  payer_name: 'Parent',
  refunds: [],
  student: { first_name: 'A', last_name: 'B', roll_number: '1', college_email: 'learner@jkkn.ac.in' },
  institution: { name: 'JKKN', counselling_code: 'X' }
} as any;

const invoice = {
  id: 'i1',
  invoice_number: 'INV-001',
  invoice_type: 'standard',
  invoice_date: '2026-09-10',
  due_date: '2026-09-20',
  grand_total: 1000,
  invoice_items: [],
  student: { first_name: 'A', last_name: 'B', roll_number: '1', college_email: 'learner@jkkn.ac.in' },
  institution: { name: 'JKKN', counselling_code: 'X' }
} as any;

const metadata = { total: 1, page: 1, limit: 10, totalPages: 1 };

const renderWithToaster = (ui: React.ReactNode) =>
  render(
    <>
      {ui}
      <Toaster />
    </>
  );

const noPrintSuccessClaim = () =>
  expect(document.body.textContent).not.toMatch(/print(ed)? successfully/i);

describe('showPrintNotAvailable', () => {
  it('shows the message with a Download button that runs the download', async () => {
    const onDownload = vi.fn();
    renderWithToaster(null);

    act(() => showPrintNotAvailable(onDownload));

    expect(await screen.findByText(RECEIPT_PRINT_NOT_AVAILABLE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    noPrintSuccessClaim();
  });

  it('repeated clicks show one message, not a stack', async () => {
    renderWithToaster(null);
    act(() => {
      showPrintNotAvailable(vi.fn());
      showPrintNotAvailable(vi.fn());
      showPrintNotAvailable(vi.fn());
    });
    expect(await screen.findAllByText(RECEIPT_PRINT_NOT_AVAILABLE)).toHaveLength(1);
  });
});

describe('receipts list Print', () => {
  it('says printing is not available, prints nothing, claims nothing, and offers Download', async () => {
    renderWithToaster(
      <ReceiptList receipts={[receipt]} metadata={metadata} onPageChange={vi.fn()} onRefresh={vi.fn()} />
    );

    expect(screen.queryByRole('menuitem', { name: /^print$/i })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: PRINT_NOT_AVAILABLE_LABEL }));

    expect(await screen.findByText(RECEIPT_PRINT_NOT_AVAILABLE)).toBeInTheDocument();
    expect(mocks.printReceipt).not.toHaveBeenCalled();
    noPrintSuccessClaim();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(mocks.downloadReceiptPDF).toHaveBeenCalledWith('r1'));
    noPrintSuccessClaim();
  });
});

describe("learner's bills page Print", () => {
  it('no longer does nothing: it says printing is not available and offers Download', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    renderWithToaster(<StudentReceiptsTable receipts={[receipt]} onRefresh={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: PRINT_NOT_AVAILABLE_LABEL }));

    expect(await screen.findByText(RECEIPT_PRINT_NOT_AVAILABLE)).toBeInTheDocument();
    expect(log).not.toHaveBeenCalledWith('Printing receipt:', expect.anything());
    noPrintSuccessClaim();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(mocks.downloadReceiptPDF).toHaveBeenCalledWith('r1'));
    log.mockRestore();
  });
});

describe('invoice download is labelled as the web page it saves', () => {
  it('invoice page: "Download (web page)", never "Download PDF"', async () => {
    renderWithToaster(<InvoiceActionsClient invoice={invoice} />);

    expect(screen.queryByText(/download pdf/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: INVOICE_DOWNLOAD_LABEL }));
    await waitFor(() => expect(mocks.downloadInvoicePDF).toHaveBeenCalledWith('i1'));
  });

  it('invoices list: "Download (web page)", never "Download PDF"', async () => {
    renderWithToaster(
      <InvoiceList invoices={[invoice]} metadata={metadata} onPageChange={vi.fn()} onRefresh={vi.fn()} />
    );

    expect(screen.queryByText(/download pdf/i)).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: INVOICE_DOWNLOAD_LABEL }));
    await waitFor(() => expect(mocks.downloadInvoicePDF).toHaveBeenCalledWith('i1'));
  });
});
