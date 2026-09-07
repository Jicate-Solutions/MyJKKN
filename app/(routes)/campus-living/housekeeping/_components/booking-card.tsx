'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2,
  Clock,
  ImageIcon,
  ShieldAlert,
  Star,
  UserPlus,
  XCircle,
} from 'lucide-react';
import type { BookingBoardRow } from '@/types/campus-living/housekeeping';

import { STATUS_LABEL, STATUS_TONE, hhmm } from './booking-status';
import { PhotoUploadButton } from './photo-upload-button';

interface Props {
  booking: BookingBoardRow;
  canAssign: boolean;
  canExecute: boolean;
  canWaive: boolean;
  /** True once the booking date has passed, which is when a hold bites. */
  isOverdue: boolean;
  onAssign: (booking: BookingBoardRow) => void;
  onWaive: (booking: BookingBoardRow) => void;
  onUploaded: () => void;
}

export function BookingCard({
  booking,
  canAssign,
  canExecute,
  canWaive,
  isOverdue,
  onAssign,
  onWaive,
  onUploaded,
}: Props) {
  // An unassigned booking whose slot has passed is the module's main failure
  // mode — a learner waited and nobody came. Make it impossible to miss.
  const isStranded = booking.status === 'booked' && isOverdue;

  return (
    <Card className={isStranded ? 'border-destructive' : undefined}>
      <CardContent className='p-4 space-y-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2 text-sm font-semibold'>
              <Clock className='h-4 w-4 shrink-0 text-muted-foreground' />
              <span>{hhmm(booking.slot_start)}</span>
              <span className='text-muted-foreground'>–{hhmm(booking.slot_end)}</span>
              <span className='truncate'>Room {booking.room_number ?? '—'}</span>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {booking.type_name} · {booking.duration_minutes} min
            </p>
          </div>
          <Badge className={STATUS_TONE[booking.status]} variant='secondary'>
            {STATUS_LABEL[booking.status]}
          </Badge>
        </div>

        {/* Cleaner */}
        <div className='flex items-center justify-between gap-2 text-sm'>
          <span className={booking.cleaner_name ? '' : 'text-muted-foreground'}>
            {booking.cleaner_name ? `Cleaner: ${booking.cleaner_name}` : 'No cleaner assigned'}
          </span>
          {canAssign && (booking.status === 'booked' || booking.status === 'assigned') && (
            <Button size='sm' variant='outline' onClick={() => onAssign(booking)}>
              <UserPlus className='mr-1.5 h-3.5 w-3.5' />
              {booking.cleaner_name ? 'Reassign' : 'Assign'}
            </Button>
          )}
        </div>

        {/* Evidence */}
        {booking.status !== 'cancelled' && (
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <span className='flex items-center gap-1'>
              {booking.has_before_photo ? (
                <CheckCircle2 className='h-4 w-4 text-emerald-600' />
              ) : (
                <ImageIcon className='h-4 w-4 text-muted-foreground' />
              )}
              Before
            </span>
            <span className='flex items-center gap-1'>
              {booking.has_after_photo ? (
                <CheckCircle2 className='h-4 w-4 text-emerald-600' />
              ) : (
                <ImageIcon className='h-4 w-4 text-muted-foreground' />
              )}
              After
            </span>

            {canExecute && (
              <PhotoUploadButton
                booking={booking}
                onUploaded={onUploaded}
                variant='button'
                className='ml-auto'
              />
            )}
          </div>
        )}

        {/* Feedback / hold */}
        {booking.status === 'awaiting_feedback' && (
          <div
            className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
              isOverdue ? 'border-destructive text-destructive' : 'text-muted-foreground'
            }`}
          >
            <span className='flex items-center gap-1.5'>
              <Star className='h-4 w-4' />
              {isOverdue
                ? 'Overdue — this room’s attendance is on hold'
                : 'Waiting for any roommate to rate'}
            </span>
            {canWaive && isOverdue && (
              <Button size='sm' variant='outline' onClick={() => onWaive(booking)}>
                <ShieldAlert className='mr-1.5 h-3.5 w-3.5' />
                Waive
              </Button>
            )}
          </div>
        )}

        {booking.status === 'completed' && booking.average_rating != null && (
          <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
            <Star className='h-4 w-4 fill-amber-400 text-amber-400' />
            {booking.average_rating} / 5
            {booking.feedback_count > 1 ? ` · ${booking.feedback_count} ratings` : ''}
          </p>
        )}

        {booking.status === 'cancelled' && (
          <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
            <XCircle className='h-4 w-4' />
            Cancelled{booking.cancel_reason ? ` — ${booking.cancel_reason}` : ''}
          </p>
        )}

        {booking.waived_at && (
          <p className='text-xs text-muted-foreground'>
            Hold waived — {booking.waive_reason}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
