'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Phone, UserX } from 'lucide-react';
import { useAssignableCleaners } from '@/hooks/campus-living/use-housekeeping-cleaners';
import {
  useRescheduleBooking,
  useSlotGrid,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import {
  RESCHEDULE_REASON_CODES,
  RESCHEDULE_REASON_LABEL,
  rescheduleNeedsNote,
} from '@/lib/services/campus-living/housekeeping-rules';
import { todayLocal } from './booking-status';
import type {
  BookingBoardRow,
  RescheduleReasonCode,
  Slot,
} from '@/types/campus-living/housekeeping';

interface Props {
  booking: BookingBoardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SLOT_REASON_LABEL: Record<string, string> = {
  slot_full: 'Taken',
  past: 'Already passed',
};

/** Keeping whoever is on the booking is a distinct choice from picking someone,
 *  and Select has no null value, so the two non-cleaner options are sentinels. */
const KEEP_CLEANER = '__keep__';
const NO_CLEANER = '__none__';

/**
 * Move one booking to another date/slot, with the reason recorded.
 *
 * The slot grid is asked to leave THIS booking out of its capacity count, which
 * is what lets a booking move within its own day — it would otherwise read its
 * own slot as full. The cleaner list is re-fetched for the NEW date because a
 * cleaner who works Tuesdays is not necessarily free on Thursday, and
 * fn_cl_housekeeping_reschedule refuses that pairing anyway.
 *
 * Mounted keyed by booking id at the call site, so a different booking mounts a
 * fresh dialog rather than an effect re-seeding this state.
 */
export function RescheduleBookingDialog({ booking, open, onOpenChange }: Props) {
  const today = todayLocal();
  const [date, setDate] = useState(booking?.booking_date ?? today);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [cleanerChoice, setCleanerChoice] = useState<string>(
    booking?.cleaner_id ? KEEP_CLEANER : NO_CLEANER,
  );
  const [reasonCode, setReasonCode] = useState<RescheduleReasonCode>('cleaner_unavailable');
  const [note, setNote] = useState('');

  const { data: grid, isLoading: slotsLoading } = useSlotGrid(
    booking?.room_id,
    booking?.type_id,
    date,
    booking?.id,
  );
  const { data: cleaners = [], isLoading: cleanersLoading } = useAssignableCleaners(
    booking?.block_id,
    date,
  );
  const reschedule = useRescheduleBooking();

  if (!booking) return null;

  // Both arms of SlotGridResult carry `slots`, so this needs no narrowing —
  // which matters because `strict` is off and a boolean discriminant does not
  // narrow reliably here.
  const slots: Slot[] = (grid?.slots ?? []) as Slot[];
  const noteRequired = rescheduleNeedsNote(reasonCode);
  const canSubmit =
    slotStart !== null && (!noteRequired || note.trim().length > 0) && !reschedule.isPending;

  function pickDate(next: string) {
    setDate(next);
    // The grid is per-day; a slot chosen on the old day means nothing on the new.
    setSlotStart(null);
    // A kept cleaner may not work the new weekday. Fall back to "no cleaner"
    // once they drop out of the assignable list, rather than submitting a
    // pairing the RPC will refuse.
    setCleanerChoice((c) => (c === KEEP_CLEANER ? KEEP_CLEANER : NO_CLEANER));
  }

  function submit() {
    if (!slotStart || !booking) return;
    reschedule.mutate(
      {
        bookingId: booking.id,
        date,
        slotStart,
        reasonCode,
        reasonNote: note,
        cleanerId:
          cleanerChoice === KEEP_CLEANER || cleanerChoice === NO_CLEANER ? null : cleanerChoice,
        clearCleaner: cleanerChoice === NO_CLEANER,
      },
      {
        onSuccess: (r) => {
          // A refusal has already been toasted by the hook; keep the dialog
          // open so the warden can pick another slot without starting over.
          if (r.success) onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent has no max-height in this repo: the flex shell plus
          overflow-y-auto AND min-h-0 on the SAME element keeps this scrollable. */}
      <DialogContent className='flex max-h-[85vh] flex-col sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Reschedule this cleaning</DialogTitle>
          <DialogDescription>
            {`Room ${booking.room_number ?? '—'} · ${booking.type_name} · currently ${booking.booking_date} at ${booking.slot_start?.slice(0, 5)}`}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto pr-1'>
          <div className='space-y-1.5'>
            <Label htmlFor='reschedule-date'>New date</Label>
            {/* No upper bound: the learner's 7-day booking horizon does not
                apply to a warden moving an existing booking, which is usually
                the whole reason for moving it. */}
            <Input
              id='reschedule-date'
              type='date'
              min={today}
              value={date}
              onChange={(e) => pickDate(e.target.value)}
            />
          </div>

          <div className='space-y-1.5'>
            <Label>New time</Label>
            {slotsLoading && (
              <p className='flex items-center gap-2 py-3 text-sm text-muted-foreground'>
                <Loader2 className='h-4 w-4 animate-spin' /> Loading slots…
              </p>
            )}

            {!slotsLoading && !grid?.open && (
              <div className='rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
                No cleaning window is open for this block on that day. Pick another date, or set
                one up under Availability.
              </div>
            )}

            {!slotsLoading && grid?.open && (
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                {slots.map((s) => {
                  const active = s.slot_start === slotStart;
                  return (
                    <button
                      key={s.slot_start}
                      type='button'
                      disabled={!s.is_bookable}
                      onClick={() => setSlotStart(s.slot_start)}
                      className={[
                        'rounded-md border px-2 py-2 text-sm transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-accent',
                        s.is_bookable ? '' : 'cursor-not-allowed opacity-50',
                      ].join(' ')}
                    >
                      <div className='font-medium'>
                        {s.slot_start}–{s.slot_end}
                      </div>
                      {!s.is_bookable && (
                        <div className='text-[11px]'>
                          {SLOT_REASON_LABEL[s.reason ?? ''] ?? 'Unavailable'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label>Cleaner</Label>
            <Select value={cleanerChoice} onValueChange={setCleanerChoice}>
              <SelectTrigger>
                <SelectValue placeholder='Choose a cleaner' />
              </SelectTrigger>
              <SelectContent>
                {booking.cleaner_id && (
                  <SelectItem value={KEEP_CLEANER}>
                    Keep {booking.cleaner_name ?? 'the current cleaner'}
                  </SelectItem>
                )}
                <SelectItem value={NO_CLEANER}>
                  <span className='flex items-center gap-2'>
                    <UserX className='h-3.5 w-3.5' /> No cleaner yet
                  </span>
                </SelectItem>
                {cleaners.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className='flex items-center gap-2'>
                      {c.full_name}
                      {c.phone && (
                        <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                          <Phone className='h-3 w-3' />
                          {c.phone}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!cleanersLoading && cleaners.length === 0 && (
              <p className='text-xs text-muted-foreground'>
                No cleaner serves this block on that day — the booking can still be moved and
                assigned later.
              </p>
            )}
            {cleanerChoice === KEEP_CLEANER && (
              <p className='text-xs text-muted-foreground'>
                Kept cleaners are re-checked against the new day; if they do not work then, the
                move is refused so you can pick someone else.
              </p>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label>Reason</Label>
            <Select
              value={reasonCode}
              onValueChange={(v) => setReasonCode(v as RescheduleReasonCode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESCHEDULE_REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {RESCHEDULE_REASON_LABEL[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder={
                noteRequired
                  ? 'Required — the learner reads this'
                  : 'Optional note — the learner reads this'
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
            <p className='text-xs text-muted-foreground'>
              The learner sees this reason on their Room Cleaning page.
            </p>
          </div>
        </div>

        <DialogFooter className='gap-2'>
          <Button variant='ghost' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {reschedule.isPending && <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />}
            Move booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
