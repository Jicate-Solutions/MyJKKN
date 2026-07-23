'use client';
// app/(routes)/resource-management/reservations/approvals/_components/approval-actions-dialog.tsx

import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useApproveReservation,
  useRejectReservation
} from '@/hooks/reservation/use-reservation-operations';
import type { Reservation } from '@/types/reservation';

interface ApprovalActionsDialogProps {
  reservation: Reservation | null;
  action: 'approve' | 'reject' | null;
  onClose: () => void;
}

export function ApprovalActionsDialog({
  reservation,
  action,
  onClose
}: ApprovalActionsDialogProps) {
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const approveReservation = useApproveReservation();
  const rejectReservation = useRejectReservation();

  const handleApprove = async () => {
    if (!reservation) return;
    setApprovalError(null);

    try {
      await approveReservation.mutateAsync({
        reservation_id: reservation.id,
        notes: notes || undefined
      });
      handleClose();
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('still pending')) {
        // Sequential chain: a lower level hasn't acted yet.
        const match = msg.match(/level (\d+) is still pending/);
        const blockingLevel = match ? match[1] : 'a previous';
        setApprovalError(
          `Waiting for Level ${blockingLevel} approval — you will be able to approve once the preceding approver has acted.`
        );
      } else if (msg.includes('own reservation')) {
        setApprovalError('You cannot approve a request you submitted yourself.');
      } else if (msg.toLowerCase().includes('insufficient stock')) {
        setApprovalError(msg);
      }
      // onError in the mutation hook already fires a toast for all errors.
    }
  };

  const handleReject = async () => {
    if (!reservation || !rejectionReason.trim()) return;

    await rejectReservation.mutateAsync({
      reservation_id: reservation.id,
      rejection_reason: rejectionReason
    });

    handleClose();
  };

  const handleClose = () => {
    setNotes('');
    setRejectionReason('');
    setApprovalError(null);
    onClose();
  };

  const isOpen = !!reservation && !!action;
  const isApproving = action === 'approve';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {isApproving ? (
              <>
                <CheckCircle2 className='h-5 w-5 text-green-600' />
                Approve Reservation
              </>
            ) : (
              <>
                <XCircle className='h-5 w-5 text-red-600' />
                Reject Reservation
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isApproving
              ? 'Approve this reservation request for the resource.'
              : 'Reject this reservation request and provide a reason.'}
          </DialogDescription>
        </DialogHeader>

        {/* Reservation Summary */}
        {reservation && (
          <div className='rounded-lg border p-4 space-y-2 bg-muted/50'>
            <div className='grid grid-cols-2 gap-2 text-sm'>
              <div>
                <p className='text-muted-foreground'>Resource</p>
                <p className='font-medium'>{reservation.resource?.name}</p>
              </div>
              <div>
                <p className='text-muted-foreground'>Requested By</p>
                <p className='font-medium'>
                  {reservation.user?.full_name || 'Unknown'}
                </p>
              </div>
              <div className='col-span-2'>
                <p className='text-muted-foreground'>Purpose</p>
                <p className='font-medium line-clamp-2'>
                  {reservation.purpose}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Inline error for sequential / self-approval blocks */}
        {approvalError && (
          <div className='rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
            {approvalError}
          </div>
        )}

        {/* Form Fields */}
        <div className='space-y-4 py-4'>
          {isApproving ? (
            <div className='space-y-2'>
              <Label htmlFor='notes'>Additional Notes (Optional)</Label>
              <Textarea
                id='notes'
                placeholder='Add any notes or instructions for the requester...'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className='min-h-[100px]'
              />
            </div>
          ) : (
            <div className='space-y-2'>
              <Label htmlFor='reason'>Rejection Reason *</Label>
              <Textarea
                id='reason'
                placeholder='Please provide a clear reason for rejection...'
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className='min-h-[120px]'
              />
              <p className='text-xs text-muted-foreground'>
                Minimum 10 characters required
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={handleClose}>
            Cancel
          </Button>
          {isApproving ? (
            <Button
              onClick={handleApprove}
              disabled={approveReservation.isPending}
              className='bg-green-600 hover:bg-green-700'
            >
              {approveReservation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle2 className='mr-2 h-4 w-4' />
                  Approve
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleReject}
              disabled={
                rejectionReason.trim().length < 10 ||
                rejectReservation.isPending
              }
              variant='destructive'
            >
              {rejectReservation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className='mr-2 h-4 w-4' />
                  Reject
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
