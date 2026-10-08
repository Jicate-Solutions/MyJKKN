'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { RefundAttachmentsField } from '@/components/billing/refund-attachments-field';
import { useActOnCommissionPayment } from '@/hooks/admission/use-commission-payments';
import type { CommissionPaymentAttachment } from '@/types/consultant-commission-payment';

export const COMMISSION_PAYMENT_ATTACHMENTS_ENDPOINT = '/api/admission/consultants/commission-payments/attachments';

interface Props {
  requestId: string;
  requestNumber: string;
  consultantName: string;
  stageName: string;
  /** Hide Approve, e.g. at the disbursement stage where only a decline is possible. */
  declineOnly?: boolean;
  /** Why Approve is not offered to this person (shown in place of the button). */
  approveBlockedReason?: string | null;
}

export function StageActionPanel({
  requestId, requestNumber, consultantName, stageName, declineOnly = false, approveBlockedReason = null
}: Props) {
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<CommissionPaymentAttachment[]>([]);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');

  const actOnCommissionPayment = useActOnCommissionPayment();

  const handleApprove = () => {
    if (!notes.trim()) return toast.error('Notes are required');
    actOnCommissionPayment.mutate({ requestId, action: 'approve', notes, attachments });
  };

  const handleDecline = () => {
    if (!reason.trim()) return toast.error('A decline reason is required');
    actOnCommissionPayment.mutate(
      { requestId, action: 'decline', reason, notes, attachments },
      { onSuccess: () => setDeclineOpen(false) }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Action required — {stageName}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <Label>Notes *</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder='Notes for this decision' />
        </div>

        <div className='space-y-2'>
          <Label>Supporting Documents</Label>
          <RefundAttachmentsField value={attachments} onChange={setAttachments}
            institutionName={consultantName} requestRef={requestNumber}
            endpoint={COMMISSION_PAYMENT_ATTACHMENTS_ENDPOINT} />
        </div>

        {approveBlockedReason && !declineOnly && (
          <p className='text-sm text-muted-foreground'>{approveBlockedReason}</p>
        )}

        <div className='flex justify-end gap-2 pt-2 border-t'>
          <Button variant='destructive' onClick={() => setDeclineOpen(true)} disabled={actOnCommissionPayment.isPending}>
            Decline
          </Button>
          {!declineOnly && !approveBlockedReason && (
            <Button onClick={handleApprove} disabled={actOnCommissionPayment.isPending}>
              {actOnCommissionPayment.isPending ? 'Submitting…' : 'Approve'}
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline commission payment</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for declining this commission payment. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='py-2'>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder='Reason for decline...' />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actOnCommissionPayment.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDecline} disabled={!reason.trim() || actOnCommissionPayment.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
              {actOnCommissionPayment.isPending ? 'Declining…' : 'Decline'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
