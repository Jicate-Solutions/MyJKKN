'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useReapplyRefundFlow } from '@/hooks/billing/use-refund-workflow';

interface Props {
  requestId: string;
}

export function ReapplyFlowButton({ requestId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const reapply = useReapplyRefundFlow();

  const handleConfirm = () => {
    if (!reason.trim()) return toast.error('A reason is required');
    reapply.mutate(
      { requestId, reason: reason.trim() },
      { onSuccess: () => { setOpen(false); setReason(''); } }
    );
  };

  return (
    <>
      <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
        <RefreshCw className='h-4 w-4 mr-2' />
        Re-apply current flow
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-apply current approval flow</AlertDialogTitle>
            <AlertDialogDescription>
              This request keeps the approval stages it was created with. Re-apply replaces them with the
              flow currently set in refund approval settings. Allowed only while nothing has been approved.
              The change is recorded in the Timeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='py-2'>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder='Reason (e.g. approval flow was edited after this request was raised)' />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reapply.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleConfirm(); }}
              disabled={!reason.trim() || reapply.isPending}>
              {reapply.isPending ? 'Applying…' : 'Re-apply flow'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
