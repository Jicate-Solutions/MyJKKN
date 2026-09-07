'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Phone, UserX } from 'lucide-react';
import { useAssignableCleaners } from '@/hooks/campus-living/use-housekeeping-cleaners';
import { useAssignCleaner } from '@/hooks/campus-living/use-housekeeping-bookings';
import type { BookingBoardRow } from '@/types/campus-living/housekeeping';

interface Props {
  booking: BookingBoardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Lists only cleaners who serve this block AND work this weekday — the same
 * two checks fn_cl_housekeeping_assign makes, so the picker never offers
 * someone the RPC will then refuse with cleaner_wrong_block /
 * cleaner_not_working.
 */
export function AssignCleanerDialog({ booking, open, onOpenChange }: Props) {
  const { data: cleaners = [], isLoading } = useAssignableCleaners(
    booking?.block_id,
    booking?.booking_date,
  );
  const assign = useAssignCleaner();

  function handleAssign(cleanerId: string) {
    if (!booking) return;
    assign.mutate(
      { bookingId: booking.id, cleanerId },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  function handleClear() {
    if (!booking) return;
    assign.mutate(
      { bookingId: booking.id, cleanerId: null, clear: true },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent has no max-height in this repo: the flex shell plus
          overflow-y-auto AND min-h-0 on the SAME element keeps a long cleaner
          list scrollable instead of running off screen. */}
      <DialogContent className='flex max-h-[85vh] flex-col sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Assign a cleaner</DialogTitle>
          <DialogDescription>
            {booking
              ? `Room ${booking.room_number ?? '—'} · ${booking.type_name} · ${booking.slot_start?.slice(0, 5)}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-2 overflow-y-auto'>
          {isLoading && (
            <p className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' /> Loading cleaners…
            </p>
          )}

          {!isLoading && cleaners.length === 0 && (
            <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
              No cleaner serves this block on this day. Add one under{' '}
              <span className='font-medium'>Cleaners</span>, or widen their working days.
            </div>
          )}

          {cleaners.map((c) => (
            <button
              key={c.id}
              type='button'
              disabled={assign.isPending}
              onClick={() => handleAssign(c.id)}
              className='flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60'
            >
              <span className='font-medium'>{c.full_name}</span>
              {c.phone && (
                <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                  <Phone className='h-3 w-3' />
                  {c.phone}
                </span>
              )}
            </button>
          ))}
        </div>

        <DialogFooter className='gap-2 sm:justify-between'>
          {booking?.cleaner_id && (
            <Button
              variant='outline'
              onClick={handleClear}
              disabled={assign.isPending}
            >
              <UserX className='mr-1.5 h-4 w-4' />
              Clear assignment
            </Button>
          )}
          <Button variant='ghost' onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
