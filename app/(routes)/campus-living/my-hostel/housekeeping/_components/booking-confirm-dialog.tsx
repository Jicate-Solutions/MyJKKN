'use client';

// Confirm dialog for booking a cleaning slot. Shows slot time + room, then
// calls useBookSlot — the hook owns ALL toast feedback (success + every
// error_code from the BookSlotResult contract: disabled, no_active_allocation,
// tier_not_entitled, quota_exhausted, slot_full, outside_window,
// too_far_ahead, past_slot, duplicate) and invalidates the slot grid either
// way, so a slot_full rejection refreshes the stale availability the user
// was looking at.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Brush } from 'lucide-react';
import { useBookSlot } from '@/hooks/campus-living/use-housekeeping-bookings';
import type { AvailableSlot } from '@/lib/services/campus-living/housekeeping-booking-service';
import { formatSlotTime, formatBookingDate } from './booking-utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  slot: AvailableSlot | null;
  blockName: string;
  roomNumber: string;
}

export function BookingConfirmDialog({
  open,
  onOpenChange,
  date,
  slot,
  blockName,
  roomNumber,
}: Props) {
  const bookSlot = useBookSlot();

  const confirm = async () => {
    if (!slot || bookSlot.isPending) return;
    // Hook toasts success/error and invalidates queries; we just close.
    await bookSlot.mutateAsync({ date, slotStart: slot.start });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !bookSlot.isPending && onOpenChange(o)}>
      <DialogContent className='w-[95vw] max-w-[420px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Brush className='h-5 w-5 text-primary' />
            Book this cleaning slot?
          </DialogTitle>
          <DialogDescription>
            A housekeeping staff member will clean your room during this slot.
          </DialogDescription>
        </DialogHeader>

        {slot && (
          <div className='rounded-lg bg-muted/50 p-4 space-y-1 text-sm'>
            <p className='font-medium text-base'>
              {formatSlotTime(slot.start)} – {formatSlotTime(slot.end)}
            </p>
            <p className='text-muted-foreground'>{formatBookingDate(date)}</p>
            <p className='text-muted-foreground'>
              {blockName || 'Block —'}
              {roomNumber ? `, Room ${roomNumber}` : ''}
            </p>
          </div>
        )}

        <DialogFooter className='gap-2 sm:gap-0'>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={bookSlot.isPending}
          >
            Not now
          </Button>
          <Button onClick={confirm} disabled={!slot || bookSlot.isPending}>
            {bookSlot.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Confirm booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
