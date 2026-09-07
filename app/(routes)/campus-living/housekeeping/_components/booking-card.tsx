'use client';

import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Camera,
  CheckCircle2,
  Clock,
  ImageIcon,
  Loader2,
  ShieldAlert,
  Star,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { BookingBoardRow, BookingStatus } from '@/types/campus-living/housekeeping';

const STATUS_LABEL: Record<BookingStatus, string> = {
  booked: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  awaiting_feedback: 'Awaiting feedback',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_TONE: Record<BookingStatus, string> = {
  booked: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  assigned: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  in_progress: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
  awaiting_feedback: 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200',
  completed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  cancelled: 'bg-muted text-muted-foreground',
};

/** HH:MM:SS from Postgres -> HH:MM for display. */
function hhmm(t: string): string {
  return t?.slice(0, 5) ?? t;
}

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
  const [uploading, setUploading] = useState<'before' | 'after' | null>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  async function upload(phase: 'before' | 'after', file: File) {
    setUploading(phase);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('phase', phase);
      const res = await fetch(
        `/api/campus-living/housekeeping/bookings/${booking.id}/photos`,
        { method: 'POST', body },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The route's own copy is already actionable ("Upload the before photo
        // first."), so surface it rather than a generic failure.
        toast.error(json?.error ?? 'Could not upload the photo.');
        return;
      }
      toast.success(phase === 'before' ? 'Before photo saved' : 'After photo saved');
      onUploaded();
    } catch {
      toast.error('Could not upload the photo. Check your connection and try again.');
    } finally {
      setUploading(null);
    }
  }

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

            {canExecute && booking.status === 'assigned' && (
              <>
                <input
                  ref={beforeRef}
                  type='file'
                  accept='image/jpeg,image/png,image/webp'
                  capture='environment'
                  className='hidden'
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload('before', f);
                    e.target.value = '';
                  }}
                />
                <Button
                  size='sm'
                  className='ml-auto'
                  disabled={uploading !== null}
                  onClick={() => beforeRef.current?.click()}
                >
                  {uploading === 'before' ? (
                    <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Camera className='mr-1.5 h-3.5 w-3.5' />
                  )}
                  Upload before
                </Button>
              </>
            )}

            {canExecute && booking.status === 'in_progress' && (
              <>
                <input
                  ref={afterRef}
                  type='file'
                  accept='image/jpeg,image/png,image/webp'
                  capture='environment'
                  className='hidden'
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload('after', f);
                    e.target.value = '';
                  }}
                />
                <Button
                  size='sm'
                  className='ml-auto'
                  disabled={uploading !== null}
                  onClick={() => afterRef.current?.click()}
                >
                  {uploading === 'after' ? (
                    <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Camera className='mr-1.5 h-3.5 w-3.5' />
                  )}
                  Upload after
                </Button>
              </>
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
