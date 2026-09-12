// What the billing Print and Download buttons can honestly promise.
//
// Until 2026-09-11:
// - Print on the receipts list showed a success message while nothing
//   printed (BillingReceiptService.printReceipt only logged).
// - Print on a learner's bills page did nothing at all when clicked.
// - "Download PDF" on invoices saved an .html web page, not a PDF.
//
// Those Print buttons now say printing is not available yet and offer the
// working Download. The invoice download is labelled as the web page it is.
// Real printing and a real invoice PDF can be built later.
//
// Plain module (no 'use client' / 'use server') so services and client
// components all read the same literal strings.

/** Shown when staff click a Print button that cannot print yet. */
export const RECEIPT_PRINT_NOT_AVAILABLE =
  'Printing from here is not available yet — please download the receipt and print it.';

/** Label for any Print button or menu item that cannot print yet. */
export const PRINT_NOT_AVAILABLE_LABEL = 'Print (not available yet)';

/** Label for the invoice download, which saves a web page and not a PDF. */
export const INVOICE_DOWNLOAD_LABEL = 'Download (web page)';

/** The invoice download is an HTML web page, so its file name ends in .html. */
export function invoiceDownloadFileName(invoiceNumber: string): string {
  return `invoice-${invoiceNumber}.html`;
}
