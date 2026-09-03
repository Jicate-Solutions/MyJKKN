'use client';

// Upcoming bookings list with status chips + cutoff-aware Cancel.
// Client-side we disable Cancel once `now` is inside the cancellation cutoff
// (policy housekeeping.cancellation_cutoff_minutes, read in page.tsx) and say
// why; the RPC enforces the same rule server-side and useCancelBooking toasts
// its error_code message if a request slips through anyway.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarClock } from 'lucide-react';
import { useCancelBooking } from '@/hooks/campus-living/use-housekeeping-bookings';
import type { HostelCleaningBooking } from '@/lib/services/campus-living/housekeeping-booking-service';
import { formatSlotTime, formatBookingDate, slotDateTime } from './booking-utils';

interface Props {
  bookings: HostelCleaningBooking[];
  isLoading: boolean;
  cutoffMinutes: number;
}

function StatusChip({ status }: { status: string }) {
  switch (status) {
    case 'booked':
      return <Badge variant='success'>Booked</Badge>;
    case 'assigned':
      return <Badge variant='success'>Cleaner assigned</Badge>;
    case 'completed':
      return <Badge variant='secondary'>Completed</Badge>;
    case 'cancelled':
      return <Badge variant='outline'>Cancelled</Badge>;
    case 'no_show':
      return <Badge variant='destructive'>No-show</Badge>;
    default:
      return <Badge variant='outline'>{status}</Badge>;
  }
}

export function UpcomingBookings({ bookings, isLoading, cutoffMinutes }: Props) {
  const cancelBooking = useCancelBooking();
  const now = new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <CalendarClock className='h-5 w-5 text-primary' />
          Your bookings
        </CardTitle>
        <CardDescription>
          You can cancel up to {cutoffMinutes} minutes before your slot starts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='flex items-center text-sm text-muted-foreground py-2'>
            <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading bookings…
          </div>
        ) : bookings.length === 0 ? (
          <p className='text-sm text-muted-foreground py-2'>
            No upcoming bookings yet — pick a slot above to book your first
            cleaning.
          </p>
        ) : (
          <div className='divide-y'>
            {bookings.map((b) => {
              const start = slotDateTime(b.booking_date, b.slot_start);
              const cancelDeadline = new Date(
                start.getTime() - cutoffMinutes * 60 * 1000
              );
              const withinCutoff = now.getTime() > cancelDeadline.getTime();
              // 'assigned' is still an upcoming booking — cancellable up to
              // the same cutoff (the RPC enforces the same rule).
              const upcoming = b.status === 'booked' || b.status === 'assigned';
              const cancellable = upcoming && !withinCutoff;
              const isCancelling =
                cancelBooking.isPending && cancelBooking.variables === b.id;

              return (
                <div
                  key={b.id}
                  className='flex items-center justify-between gap-3 py-3'
                >
                  <div className='min-w-0'>
                    <p className='font-medium'>
                      {formatSlotTime(b.slot_start)} – {formatSlotTime(b.slot_end)}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {formatBookingDate(b.booking_date)}
                    </p>
                    {b.assigned_staff_name && b.status !== 'cancelled' && (
                      <p className='text-xs text-muted-foreground mt-0.5'>
                        Cleaner: {b.assigned_staff_name}
                      </p>
                    )}
                    {upcoming && withinCutoff && (
                      <p className='text-xs text-amber-700 mt-0.5'>
                        Cancellation window closed (within {cutoffMinutes} min
                        of the slot)
                      </p>
                    )}
                  </div>
                  <div className='flex shrink-0 items-center gap-2'>
                    <StatusChip status={b.status} />
                    {upcoming && (
                      <Button
                        variant='outline'
                        size='sm'
                        disabled={!cancellable || cancelBooking.isPending}
                        onClick={() => cancelBooking.mutate(b.id)}
                      >
                        {isCancelling && (
                          <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                        )}
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
