'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import {
  useSlotGrid,
  useBookSlot,
  bookingErrorMessage,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import type { CleaningTypeWithDetail } from '@/types/campus-living/housekeeping';

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
                onClick={() =>
                  book.mutate(
                    { typeId: type.id, date, slotStart: s.slot_start },
                    { onSuccess: (r) => r.success && onBooked() },
                  )
                }
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
    </Card>
  );
}
