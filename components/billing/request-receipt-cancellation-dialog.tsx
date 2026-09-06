'use client';

// Shared "Request cancellation" dialog.
//
// Cancelling a receipt reverses money, so staff never cancel directly: they
// raise a request and a SUPER ADMIN decides it (fn_act_on_receipt_cancellation
// gates on is_super_admin() and refuses to let the requester approve their own).
// Nothing is reversed here — the receipt stays valid and the bill stays paid
// until an approver acts, so collections keep reflecting reality meanwhile.
//
// Extracted 2026-08-25 from receipts/_components/receipt-list.tsx, which was
// the ONLY surface offering cancellation out of 20 that show receipts. The
// receipt detail page and the student Receipts tab now share it.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRequestReceiptCancellation } from '@/hooks/billing/use-receipt-cancellations';

/** The RPC's own floor — mirroring it turns a round-trip error into an inert button. */
const MIN_REASON_LENGTH = 5;

interface RequestReceiptCancellationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptId: string | null;
  receiptNumber: string | null;
  /** Called after the request is accepted, so the caller can refetch. */
  onRequested?: () => void;
}

export function RequestReceiptCancellationDialog({
  open,
  onOpenChange,
  receiptId,
  receiptNumber,
  onRequested,
}: RequestReceiptCancellationDialogProps) {
  const [reason, setReason] = useState('');
  const requestCancellation = useRequestReceiptCancellation();

  // Never carry a reason from one receipt to the next. Adjusted during render
  // rather than in an effect — the React-documented way to reset state on a
  // prop change, and it avoids the extra committed render an effect costs.
  const token = open ? (receiptId ?? '') : '';
  const [lastToken, setLastToken] = useState(token);
  if (token !== lastToken) {
    setLastToken(token);
    setReason('');
  }

  const handleSubmit = () => {
    if (!receiptId) return;
    requestCancellation.mutate(
      { receiptId, reason: reason.trim() },
      {
        onSuccess: () => {
          onOpenChange(false);
          onRequested?.();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Request cancellation{receiptNumber ? ` of ${receiptNumber}` : ''}
          </DialogTitle>
          <DialogDescription>
            This sends the receipt to a <strong>super admin</strong> for approval.
            It stays valid and the bill stays paid until they approve — only then
            is the receipt cancelled and the bill reverted.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-2'>
          <Label htmlFor='cancel-reason'>Reason (required)</Label>
          <Input
            id='cancel-reason'
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder='e.g. same payment receipted twice'
            autoComplete='off'
          />
          <p className='text-xs text-muted-foreground'>
            Receipts with refunds, an attached invoice, or a captured online
            payment cannot be cancelled — those need a refund instead.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={requestCancellation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              requestCancellation.isPending ||
              !receiptId ||
              reason.trim().length < MIN_REASON_LENGTH
            }
          >
            {requestCancellation.isPending ? 'Sending...' : 'Send for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
