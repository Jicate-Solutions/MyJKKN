'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarClock, Check, Clock, User } from 'lucide-react';
import { canLearnerCancel } from '@/lib/services/campus-living/housekeeping-rules';
import {
  BOOKING_STEPS,
  LEARNER_STATUS_HINT,
  LEARNER_STATUS_LABEL,
  LEARNER_STATUS_TONE,
  hhmm,
  relativeDayLabel,
  stepIndex,
} from './learner-booking-status';
import type { BookingBoardRow } from '@/types/campus-living/housekeeping';

interface Props {
  booking: BookingBoardRow;
  today: string;
  cancelling: boolean;
  onCancel: (bookingId: string) => void;
}

/**
 * The one cleaning currently open for this room.
 *
 * Built for a phone first: a single column, a progress strip that says where the
 * booking has got to without reading the status word, and full-width controls.
 * The room lock means there is never more than one of these.
 */
export function CurrentBookingCard({ booking, today, cancelling, onCancel }: Props) {
  const step = stepIndex(booking.status);
  const cancellable = canLearnerCancel(booking.status);

  return (
    <Card className='border-primary'>
      <CardContent className='space-y-4 p-4'>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <div className='min-w-0'>
            <h2 className='text-base font-semibold'>{booking.type_name}</h2>
            <p className='text-sm text-muted-foreground'>
              {booking.duration_minutes} minute clean
            </p>
          </div>
          <Badge className={LEARNER_STATUS_TONE[booking.status]} variant='secondary'>
            {LEARNER_STATUS_LABEL[booking.status]}
          </Badge>
        </div>

        {/* When */}
        <div className='grid gap-2 text-sm sm:grid-cols-2'>
          <p className='flex items-center gap-2'>
            <CalendarClock className='h-4 w-4 shrink-0 text-muted-foreground' />
            <span className='font-medium'>
              {relativeDayLabel(booking.booking_date, today)}
            </span>
          </p>
          <p className='flex items-center gap-2'>
            <Clock className='h-4 w-4 shrink-0 text-muted-foreground' />
            {hhmm(booking.slot_start)}–{hhmm(booking.slot_end)}
          </p>
          <p className='flex items-center gap-2 sm:col-span-2'>
            <User className='h-4 w-4 shrink-0 text-muted-foreground' />
            {booking.cleaner_name ? (
              <>Cleaner: {booking.cleaner_name}</>
            ) : (
              <span className='text-muted-foreground'>No cleaner assigned yet</span>
            )}
          </p>
        </div>

        {/* Progress strip. Cancelled leaves the track, so it shows no dots. */}
        {step >= 0 && (
          <ol className='flex items-center gap-1'>
            {BOOKING_STEPS.map((label, i) => {
              const done = i < step;
              const current = i === step;
              return (
                <li key={label} className='flex flex-1 flex-col items-center gap-1'>
                  <div
                    className={[
                      'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold',
                      done
                        ? 'border-primary bg-primary text-primary-foreground'
                        : current
                          ? 'border-primary text-primary'
                          : 'border-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    {done ? <Check className='h-3.5 w-3.5' /> : i + 1}
                  </div>
                  <span
                    className={`text-[10px] ${current ? 'font-medium text-primary' : 'text-muted-foreground'}`}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <p className='rounded-md bg-muted/50 p-3 text-sm text-muted-foreground'>
          {LEARNER_STATUS_HINT[booking.status]}
        </p>

        {cancellable ? (
          <Button
            variant='outline'
            className='w-full sm:w-auto'
            disabled={cancelling}
            onClick={() => onCancel(booking.id)}
          >
            Cancel this booking
          </Button>
        ) : (
          booking.status !== 'awaiting_feedback' && (
            <p className='text-xs text-muted-foreground'>
              A cleaner is already assigned, so this can no longer be cancelled here — ask
              your warden.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
