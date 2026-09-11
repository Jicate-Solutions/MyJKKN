'use client';

// Shown when staff click an Email button on a receipt or invoice, or a receipt
// Print button that cannot print yet. Neither is built (see
// lib/services/billing/email-not-available.ts and print-and-download-text.ts),
// so the click explains that and offers the Download action in the same message.

import toast from 'react-hot-toast';
import {
  INVOICE_EMAIL_NOT_AVAILABLE,
  RECEIPT_EMAIL_NOT_AVAILABLE
} from '@/lib/services/billing/email-not-available';
import { RECEIPT_PRINT_NOT_AVAILABLE } from '@/lib/services/billing/print-and-download-text';

export function showEmailNotAvailable(
  kind: 'receipt' | 'invoice',
  onDownload?: () => void
) {
  const message =
    kind === 'receipt' ? RECEIPT_EMAIL_NOT_AVAILABLE : INVOICE_EMAIL_NOT_AVAILABLE;

  // One id per kind: repeated clicks replace the message instead of stacking.
  showWithDownload(`billing-email-not-available-${kind}`, message, onDownload);
}

/** A receipt Print button that cannot print yet: say so and offer Download. */
export function showPrintNotAvailable(onDownload?: () => void) {
  showWithDownload('billing-print-not-available-receipt', RECEIPT_PRINT_NOT_AVAILABLE, onDownload);
}

function showWithDownload(id: string, message: string, onDownload?: () => void) {
  toast(
    (t) => (
      <span className='flex items-center gap-3'>
        <span>{message}</span>
        {onDownload && (
          <button
            type='button'
            className='shrink-0 rounded-md border px-2 py-1 text-sm font-medium hover:bg-muted'
            onClick={() => {
              toast.dismiss(t.id);
              onDownload();
            }}
          >
            Download
          </button>
        )}
      </span>
    ),
    { id, duration: 8000 }
  );
}
