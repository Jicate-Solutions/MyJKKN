// Emailing receipts and invoices is NOT built.
//
// Until 2026-09-11 every "Send Email" button on receipts and invoices showed a
// success message while nothing was sent: the send server actions returned
// `success: true` over a TODO, and the invoice service ran a fake 1.5 s delay
// and logged a fake success line.
//
// Every send path now fails with one of these messages and points staff to the
// Download action instead. Real emailing needs an email service decision first.
//
// Plain module (no 'use client' / 'use server') so server actions, services and
// client components all read the same literal strings.

export const RECEIPT_EMAIL_NOT_AVAILABLE =
  'Emailing receipts is not available yet — please download and share the receipt.';

export const INVOICE_EMAIL_NOT_AVAILABLE =
  'Emailing invoices is not available yet — please download and share the invoice.';

/** Label for any button or menu item that used to offer emailing. */
export const EMAIL_NOT_AVAILABLE_LABEL = 'Email (not available yet)';
