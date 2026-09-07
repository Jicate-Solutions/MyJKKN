'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useWaiveHold } from '@/hooks/campus-living/use-housekeeping-bookings';
import type { BookingBoardRow } from '@/types/campus-living/housekeeping';

interface Props {
  booking: BookingBoardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The safety valve. Without it, a room whose learners have left campus or lost
 * account access is attendance-blocked forever.
 *
 * The reason is mandatory here AND as a database CHECK (ck_hk_bookings_waive).
 * Waiving does NOT complete the booking — it stays awaiting_feedback so the
 * record still shows nobody rated it.
 */
export function WaiveHoldDialog({ booking, open, onOpenChange }: Props) {
  // useAuth() exposes only { profile, isLoading, error }; profile.id IS the
  // auth.uid() / profiles.id that waived_by references.
  const { profile } = useAuth();
  const waive = useWaiveHold();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open, booking?.id]);

  const trimmed = reason.trim();

  function handleWaive() {
    if (!booking || !trimmed || !profile?.id) return;
    waive.mutate(
      { bookingId: booking.id, reason: trimmed, waivedBy: profile.id },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] flex-col sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Waive the feedback hold</DialogTitle>
          <DialogDescription>
            {booking
              ? `Room ${booking.room_number ?? '—'} · ${booking.type_name} · ${booking.booking_date}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto'>
          <p className='rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm'>
            Waiving releases attendance for <strong>everyone in this room</strong> without a
            rating. The booking stays marked as never rated, and your name and reason are
            recorded.
          </p>

          <div className='space-y-2'>
            <Label htmlFor='waive-reason'>
              Reason <span className='text-destructive'>*</span>
            </Label>
            <Textarea
              id='waive-reason'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder='e.g. Both residents have vacated; no one can rate this cleaning.'
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            disabled={!trimmed || waive.isPending}
            onClick={handleWaive}
          >
            {waive.isPending ? 'Waiving…' : 'Waive hold'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
