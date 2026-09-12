'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CalendarClock, Clock, Loader2, Lock, Repeat, Star } from 'lucide-react';
import {
  useSlotGrid,
  useBookSlot,
  bookingErrorMessage,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import type { CleaningTypeWithDetail, Slot, UsagePeriod } from '@/types/campus-living/housekeeping';

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string): { dow: string; day: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
    day: String(d.getUTCDate()),
  };
}

/** Matches the wording the type picker already uses for the same quota. */
const PERIOD_LABEL: Record<UsagePeriod, string> = {
  day: 'a day',
  week: 'a week',
  month: 'a month',
};

/** Read back in UTC: the date is a plain calendar string, and parsing it in
 *  local time is how an all-day value slips to the previous day. */
function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

const SLOT_REASON_LABEL: Record<string, string> = {
  slot_full: 'Taken',
  past: 'Already passed',
};

interface Props {
  roomId: string;
  type: CleaningTypeWithDetail;
  onBooked: () => void;
}

export function SlotGrid({ roomId, type, onBooked }: Props) {
  const today = todayLocal();
  const [date, setDate] = useState(today);
  // The RPC enforces housekeeping.booking_advance_days; 7 days of chips is a
  // reasonable strip regardless, and an out-of-range pick is refused cleanly.
  const dates = Array.from({ length: 8 }, (_u, i) => addDays(today, i));

  const { data: grid, isLoading } = useSlotGrid(roomId, type.id, date);
  const book = useBookSlot();

  // Tapping a slot no longer books it. Booking is not a small action here: it
  // locks the room for every roommate, spends a quota shared with them, and
  // arms an attendance hold — none of which is visible from a grid of times.
  const [pending, setPending] = useState<Slot | null>(null);

  const confirmBooking = () => {
    if (!pending) return;
    book.mutate(
      { typeId: type.id, date, slotStart: pending.slot_start },
      {
        onSuccess: (r) => {
          if (!r.success) return; // hook has toasted the reason; keep the dialog open
          setPending(null);
          onBooked();
        },
      },
    );
  };

  return (
    <Card>
      <CardContent className='space-y-4 p-4'>
        {/* Date strip */}
        <div className='flex gap-2 overflow-x-auto pb-1'>
          {dates.map((d) => {
            const { dow, day } = dayLabel(d);
            const active = d === date;
            return (
              <button
                key={d}
                type='button'
                onClick={() => setDate(d)}
                className={[
                  'flex min-w-[3.25rem] shrink-0 flex-col items-center rounded-md border px-2 py-1.5 text-xs transition-colors',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                ].join(' ')}
              >
                <span>{dow}</span>
                <span className='text-base font-semibold'>{day}</span>
              </button>
            );
          })}
        </div>

        {/* Slots */}
        {isLoading && (
          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> Loading slots…
          </p>
        )}

        {/* `grid.open` does not narrow the union here — tsconfig has strict off,
            which weakens discriminated-union narrowing on a boolean. Read the
            reason off a widened shape instead. */}
        {!isLoading && grid && !grid.open && (
          <p className='text-sm text-muted-foreground'>
            {bookingErrorMessage(
              (grid as { reason?: string }).reason ?? '',
              'No cleaning is available on this day.',
            )}
          </p>
        )}

        {!isLoading && grid?.open && grid.slots.length === 0 && (
          <p className='text-sm text-muted-foreground'>
            No slots fit a {type.duration_minutes}-minute cleaning in this day&rsquo;s window.
          </p>
        )}

        {!isLoading && grid?.open && grid.slots.length > 0 && (
          <div className='grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6'>
            {grid.slots.map((s) => (
              <Button
                key={s.slot_start}
                variant={s.is_bookable ? 'outline' : 'ghost'}
                size='sm'
                disabled={!s.is_bookable || book.isPending}
                title={s.reason ? SLOT_REASON_LABEL[s.reason] ?? s.reason : undefined}
                onClick={() => setPending(s)}
                className='flex-col py-6'
              >
                <span>{s.slot_start}</span>
                {!s.is_bookable && s.reason && (
                  <span className='text-[10px] font-normal text-muted-foreground'>
                    {SLOT_REASON_LABEL[s.reason] ?? s.reason}
                  </span>
                )}
              </Button>
            ))}
          </div>
        )}

        <p className='text-xs text-muted-foreground'>
          Slots are {type.duration_minutes} minutes long because that is how long{' '}
          {type.name} takes.
        </p>
      </CardContent>

      {/* Confirmation. `pending` holds the slot, so the dialog can name the exact
          time rather than a generic "are you sure?". */}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o && !book.isPending) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Book {type.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm the slot below. Everything it affects is listed — your roommates
              share all of it.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className='space-y-3 text-sm'>
            <div className='rounded-md border bg-muted/40 p-3'>
              <p className='flex items-center gap-2 font-medium'>
                <CalendarClock className='h-4 w-4 shrink-0' />
                {pending ? longDate(date) : ''}
              </p>
              <p className='mt-1 flex items-center gap-2 text-muted-foreground'>
                <Clock className='h-4 w-4 shrink-0' />
                {pending?.slot_start}–{pending?.slot_end} ({type.duration_minutes} minutes)
              </p>
            </div>

            <ul className='space-y-2 text-muted-foreground'>
              <li className='flex gap-2'>
                <Lock className='mt-0.5 h-4 w-4 shrink-0' />
                <span>
                  Your room can only have one cleaning open at a time. Until this one is
                  done, nobody in the room can book another — of any type.
                </span>
              </li>
              <li className='flex gap-2'>
                <Repeat className='mt-0.5 h-4 w-4 shrink-0' />
                <span>
                  It uses one of your room&rsquo;s {type.usage_limit_count}{' '}
                  {type.name} booking{type.usage_limit_count === 1 ? '' : 's'} per{' '}
                  {PERIOD_LABEL[type.usage_period]}.
                </span>
              </li>
              <li className='flex gap-2'>
                <Star className='mt-0.5 h-4 w-4 shrink-0' />
                <span>
                  Rate it once it is done. An unrated cleaning holds your hostel
                  attendance from the next day until someone in the room rates it.
                </span>
              </li>
            </ul>

            <p className='text-xs text-muted-foreground'>
              You can cancel this yourself until a cleaner is assigned. After that, ask
              your warden.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={book.isPending}>Go back</AlertDialogCancel>
            {/* preventDefault: AlertDialogAction closes on click by default, which
                would hide the dialog mid-request and swallow a failure. It closes
                in onSuccess instead. */}
            <AlertDialogAction
              disabled={book.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmBooking();
              }}
            >
              {book.isPending ? (
                <>
                  <Loader2 className='mr-1.5 h-4 w-4 animate-spin' /> Booking…
                </>
              ) : (
                'Confirm booking'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
