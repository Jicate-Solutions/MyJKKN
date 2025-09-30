// app/(routes)/resource-management/reservations/[id]/_components/reservation-actions.tsx
'use client';

import { useState } from 'react';
import { Check, X, LogIn, LogOut, Trash2, Edit, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { Reservation } from '@/types/reservation';
import {
  useCancelReservation,
  useCheckInReservation,
  useCheckOutReservation
} from '@/hooks/reservation/use-reservation-operations';
import { useRouter } from 'next/navigation';

interface ReservationActionsProps {
  reservation: Reservation;
  userId?: string;
}

export function ReservationActions({
  reservation,
  userId
}: ReservationActionsProps) {
  const router = useRouter();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  const cancelReservation = useCancelReservation();
  const checkInReservation = useCheckInReservation();
  const checkOutReservation = useCheckOutReservation();

  // Determine available actions
  const canEdit =
    reservation.status === 'pending' || reservation.status === 'approved';
  const canCancel =
    reservation.status === 'pending' || reservation.status === 'approved';
  const canCheckIn =
    reservation.status === 'approved' && !reservation.checked_in_at;
  const canCheckOut =
    reservation.status === 'approved' &&
    reservation.checked_in_at &&
    !reservation.checked_out_at;

  const handleCancel = async () => {
    if (!userId || !cancellationReason.trim()) return;

    await cancelReservation.mutateAsync({
      reservation_id: reservation.id,
      user_id: userId,
      cancellation_reason: cancellationReason
    });

    setShowCancelDialog(false);
    setCancellationReason('');
  };

  const handleCheckIn = async () => {
    if (!userId) return;

    await checkInReservation.mutateAsync({
      reservation_id: reservation.id,
      checked_in_by: userId
    });
  };

  const handleCheckOut = async () => {
    if (!userId) return;

    await checkOutReservation.mutateAsync({
      reservation_id: reservation.id,
      checked_out_by: userId
    });
  };

  const hasActions = canEdit || canCancel || canCheckIn || canCheckOut;

  if (!hasActions) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className='space-y-2'>
          {/* Check In */}
          {canCheckIn && (
            <Button
              onClick={handleCheckIn}
              disabled={checkInReservation.isPending}
              className='w-full'
            >
              {checkInReservation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Checking In...
                </>
              ) : (
                <>
                  <LogIn className='mr-2 h-4 w-4' />
                  Check In
                </>
              )}
            </Button>
          )}

          {/* Check Out */}
          {canCheckOut && (
            <Button
              onClick={handleCheckOut}
              disabled={checkOutReservation.isPending}
              className='w-full'
              variant='outline'
            >
              {checkOutReservation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Checking Out...
                </>
              ) : (
                <>
                  <LogOut className='mr-2 h-4 w-4' />
                  Check Out
                </>
              )}
            </Button>
          )}

          {/* Edit */}
          {canEdit && (
            <Button
              onClick={() =>
                router.push(
                  `/resource-management/reservations/${reservation.id}/edit`
                )
              }
              variant='outline'
              className='w-full'
            >
              <Edit className='mr-2 h-4 w-4' />
              Edit Reservation
            </Button>
          )}

          {/* Cancel */}
          {canCancel && (
            <Button
              onClick={() => setShowCancelDialog(true)}
              variant='destructive'
              className='w-full'
            >
              <Trash2 className='mr-2 h-4 w-4' />
              Cancel Reservation
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Reservation</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this reservation? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='reason'>Cancellation Reason *</Label>
              <Textarea
                id='reason'
                placeholder='Please provide a reason for cancellation...'
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className='min-h-[100px]'
              />
              <p className='text-xs text-muted-foreground'>
                Minimum 10 characters required
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setShowCancelDialog(false);
                setCancellationReason('');
              }}
            >
              Keep Reservation
            </Button>
            <Button
              variant='destructive'
              onClick={handleCancel}
              disabled={
                cancellationReason.trim().length < 10 ||
                cancelReservation.isPending
              }
            >
              {cancelReservation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Cancelling...
                </>
              ) : (
                <>
                  <Trash2 className='mr-2 h-4 w-4' />
                  Cancel Reservation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
