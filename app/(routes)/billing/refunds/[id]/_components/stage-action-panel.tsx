'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
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
import { useActOnRefund } from '@/hooks/billing/use-refund-workflow';
import type { RefundAttachment } from '@/types/billing-refund-workflow';

interface Props {
  requestId: string;
  requestNumber: string;
  institutionName: string;
  stageName: string;
}

export function StageActionPanel({ requestId, requestNumber, institutionName, stageName }: Props) {
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<RefundAttachment[]>([]);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');

  const actOnRefund = useActOnRefund();

  const handleApprove = () => {
    if (!notes.trim()) return toast.error('Notes are required');
    actOnRefund.mutate({ requestId, action: 'approve', notes, attachments });
  };

  const handleDecline = () => {
    if (!reason.trim()) return toast.error('A decline reason is required');
    actOnRefund.mutate(
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
            institutionName={institutionName} requestRef={requestNumber} />
        </div>

        <div className='flex justify-end gap-2 pt-2 border-t'>
          <Button variant='destructive' onClick={() => setDeclineOpen(true)} disabled={actOnRefund.isPending}>
            Decline
          </Button>
          <Button onClick={handleApprove} disabled={actOnRefund.isPending}>
            {actOnRefund.isPending ? 'Submitting…' : 'Approve'}
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline refund request</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for declining this request. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='py-2'>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder='Reason for decline...' />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actOnRefund.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDecline} disabled={!reason.trim() || actOnRefund.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
              {actOnRefund.isPending ? 'Declining…' : 'Decline'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
