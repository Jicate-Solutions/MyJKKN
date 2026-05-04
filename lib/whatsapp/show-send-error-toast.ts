// lib/whatsapp/show-send-error-toast.ts
//
// Spec 3 H2.4: Helper that distinguishes BYOW send failures by category and
// surfaces the right toast affordance. Connection-related failures get a
// rich sonner toast with a "Reconnect" action button; other failures fall
// back to the standard react-hot-toast error.
//
// Spec: /specs/byow-platform-v2.md §8 H2.4

import { toast as sonnerToast } from 'sonner';
import hotToast from 'react-hot-toast';

/**
 * Heuristic match for "the connection is the reason send failed."
 * The Railway service + MyJKKN /api/whatsapp-personal/send route emit
 * varied error strings; this matches the common signatures.
 */
function isConnectionError(httpStatus: number | undefined, errorMsg: string | undefined): boolean {
  if (httpStatus === 409 || httpStatus === 503) return true;
  if (!errorMsg) return false;
  const lower = errorMsg.toLowerCase();
  return (
    lower.includes('not connected') ||
    lower.includes('not ready') ||
    lower.includes('disconnect') ||
    lower.includes('connection lost') ||
    lower.includes('client not found') ||
    lower.includes('authentication failed')
  );
}

interface ShowSendErrorOpts {
  httpStatus?: number;
  errorMsg?: string;
  fallbackMsg?: string;
}

export function showSendErrorToast(opts: ShowSendErrorOpts): void {
  const { httpStatus, errorMsg, fallbackMsg } = opts;
  const isConnIssue = isConnectionError(httpStatus, errorMsg);

  if (isConnIssue) {
    // Rich sonner toast with Reconnect action.
    sonnerToast.error('WhatsApp connection lost — message not sent', {
      description: errorMsg || 'The dept WhatsApp connection appears to be down.',
      action: {
        label: 'Reconnect',
        onClick: () => {
          window.location.href = '/admission/settings/whatsapp-numbers';
        },
      },
      duration: 8000,
    });
    return;
  }

  // Fallback: standard error toast.
  hotToast.error(errorMsg || fallbackMsg || 'Failed to send message');
}
