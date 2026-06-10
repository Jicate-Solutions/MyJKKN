'use client';

// Slot grid for the selected date — 10-min computed slots from
// fn_housekeeping_available_slots (via useAvailableSlots). Three states:
// available (tappable), full (disabled), past (dimmed). Mobile-first chips.

import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import type {
  AvailableSlot,
  AvailableSlotsResult,
} from '@/lib/services/campus-living/housekeeping-booking-service';
import { formatSlotTime, isPastSlot } from './booking-utils';

interface Props {
  data: AvailableSlotsResult | undefined;
  isLoading: boolean;
  isError: boolean;
  selectedDate: string;
  quotaExhausted: boolean;
  onPick: (slot: AvailableSlot) => void;
}

export function SlotGrid({
  data,
  isLoading,
  isError,
  selectedDate,
  quotaExhausted,
  onPick,
}: Props) {
  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-10 text-muted-foreground'>
        <Loader2 className='mr-2 h-5 w-5 animate-spin' /> Loading slots…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className='p-6 flex items-start gap-3'>
          <AlertCircle className='h-5 w-5 text-muted-foreground mt-0.5 shrink-0' />
          <p className='text-sm text-muted-foreground'>
            Could not load slots for this date. Please try again in a moment.
          </p>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const slots = data.slots ?? [];

  if (slots.length === 0) {
    return (
      <Card>
        <CardContent className='p-6 text-center'>
          <p className='text-sm text-muted-foreground'>
            No cleaning slots on this date.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-3'>
      {quotaExhausted && (
        <Card className='border-amber-200 bg-amber-50/50'>
          <CardContent className='p-3 text-sm text-amber-800'>
            You&apos;ve used all your included cleanings this week. Booking
            reopens next week.
          </CardContent>
        </Card>
      )}

      <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2'>
        {slots.map((slot) => {
          const past = isPastSlot(selectedDate, slot.start, now);
          const full = !past && !slot.available;
          const bookable = !past && !full && !quotaExhausted;
          return (
            <button
              key={slot.start}
              type='button'
              disabled={!bookable}
              onClick={() => bookable && onPick(slot)}
              className={`rounded-md border px-2 py-2 text-sm text-center transition-colors ${
                past
                  ? 'border-transparent bg-muted/40 text-muted-foreground/50'
                  : full
                    ? 'border-muted bg-muted text-muted-foreground'
                    : quotaExhausted
                      ? 'border-muted text-muted-foreground'
                      : 'hover:border-primary hover:bg-primary/10'
              }`}
            >
              <span className='block font-medium leading-tight'>
                {formatSlotTime(slot.start)}
              </span>
              <span className='block text-[10px] text-muted-foreground'>
                {past ? 'Past' : full ? 'Full' : `${data.slot_minutes} min`}
              </span>
            </button>
          );
        })}
      </div>

      <p className='text-xs text-muted-foreground'>
        Each slot is {data.slot_minutes} minutes. Cleaning window{' '}
        {formatSlotTime(data.window.start)} – {formatSlotTime(data.window.end)}.
      </p>
    </div>
  );
}
