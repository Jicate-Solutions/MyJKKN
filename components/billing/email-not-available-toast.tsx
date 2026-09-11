'use client';

// Shown when staff click an Email button on a receipt or invoice. Emailing is
// not built (see lib/services/billing/email-not-available.ts), so the click
// explains that and offers the Download action in the same message.

import toast from 'react-hot-toast';
import {
  INVOICE_EMAIL_NOT_AVAILABLE,
  RECEIPT_EMAIL_NOT_AVAILABLE
} from '@/lib/services/billing/email-not-available';

export function showEmailNotAvailable(
  kind: 'receipt' | 'invoice',
  onDownload?: () => void
) {
  const message =
    kind === 'receipt' ? RECEIPT_EMAIL_NOT_AVAILABLE : INVOICE_EMAIL_NOT_AVAILABLE;

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
    // One id per kind: repeated clicks replace the message instead of stacking.
    { id: `billing-email-not-available-${kind}`, duration: 8000 }
  );
}
