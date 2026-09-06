'use client';

// app/(routes)/meetings/[uid]/_components/reschedule-booking-button.tsx
//
// Host reschedule control for the native booking detail page. Mirrors
// CancelBookingButton: inline, no Radix dialog, server actions only.
//
// Why this is NOT a link to /book/reschedule/[uid]: that public page
// authenticates with the booking's cancel_token — the ATTENDEE's capability —
// so a host-facing link would either show the host an "invalid link" error or,
// if the token were appended, leak it into the host's address bar, browser
// history and referrer headers. The migration comment on the mb_host_select RLS
// policy is explicit that cancel_token must never reach the client. The host
// path therefore goes through server actions that identify the host by session.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMyBookingSlots, rescheduleMyBooking } from '../actions';

const IST = 'Asia/Kolkata';

const istDateKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));

const istDayLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(iso));

const istTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso));

interface DayGroup {
  key: string;
  starts: string[];
}

type Reason = 'missed' | 'repeat' | 'follow_up';

/**
 * The three things a host can mean when they give an ENDED meeting a new time.
 * Worded as the host would say them out loud, not as the database stores them.
 */
const REASONS: { value: Reason; label: string; hint: string }[] = [
  { value: 'missed', label: 'It was missed', hint: 'It never happened — move this meeting' },
  { value: 'repeat', label: 'Meet again', hint: 'It happened — book the next one' },
  { value: 'follow_up', label: 'Follow up', hint: 'It happened — more to discuss' },
];

export function RescheduleBookingButton({
  uid,
  /** True once the meeting has ended or been cancelled — then a reason is required. */
  hasEnded = false,
}: {
  uid: string;
  hasEnded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<DayGroup[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function loadSlots() {
    setLoading(true);
    setSelected(null);
    const result = await getMyBookingSlots(uid);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error ?? 'Could not load available times.');
      setOpen(false);
      return;
    }
    const grouped = new Map<string, string[]>();
    for (const list of Object.values(result.days ?? {})) {
      for (const slot of list) {
        const key = istDateKey(slot.start);
        const arr = grouped.get(key) ?? [];
        arr.push(slot.start);
        grouped.set(key, arr);
      }
    }
    setDays(
      [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, starts]) => ({ key, starts: starts.sort() })),
    );
  }

  function onOpen() {
    setOpen(true);
    void loadSlots();
  }

  function confirmMove() {
    if (!selected) return;
    // A meeting that has ended cannot be moved without saying which of the three
    // things is happening — 'missed' moves it, the other two create a new one.
    if (hasEnded && !reason) return;
    startTransition(async () => {
      const result = await rescheduleMyBooking(uid, selected, reason ?? undefined);
      if (result.success) {
        toast.success(
          reason === 'repeat' || reason === 'follow_up'
            ? 'New meeting booked and linked to this one. Both of you have been emailed.'
            : 'Meeting moved. Both you and the guest have been emailed.',
        );
        setOpen(false);
        setDays(null);
        setSelected(null);
        setReason(null);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Could not move the booking.');
        // The slot list is stale the moment a move fails on availability.
        void loadSlots();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={onOpen}>
        <CalendarClock className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {hasEnded ? 'Move or follow up' : 'Reschedule'}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {hasEnded ? 'This meeting has already ended' : 'Pick a new time'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setSelected(null);
            setReason(null);
          }}
          disabled={pending}
        >
          {hasEnded ? 'Leave it' : 'Keep current time'}
        </Button>
      </div>

      {/* Asked only for a meeting that has ended. 'It was missed' moves this
          meeting; the other two leave it as it is and book a new one linked
          back to it, so the thread stays readable later. */}
      {hasEnded ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">What happened?</p>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <Button
                key={r.value}
                type="button"
                variant={reason === r.value ? 'default' : 'outline'}
                size="sm"
                className="h-auto flex-col items-start gap-0.5 px-2.5 py-1.5 text-left"
                onClick={() => setReason(r.value)}
                disabled={pending}
                aria-pressed={reason === r.value}
              >
                <span className="text-xs font-medium">{r.label}</span>
                <span className="text-[11px] font-normal opacity-75">{r.hint}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading available times…
        </p>
      ) : null}

      {!loading && days && days.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No open slots in the next 14 days. Free up time in your availability, then try again.
        </p>
      ) : null}

      {!loading && days && days.length > 0 ? (
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {days.map((day) => (
            <div key={day.key}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {istDayLabel(day.starts[0])}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {day.starts.map((start) => (
                  <Button
                    key={start}
                    type="button"
                    variant={selected === start ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelected(start)}
                    disabled={pending}
                  >
                    {istTime(start)}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {selected ? (
        <>
          <Button size="sm" onClick={confirmMove} disabled={pending || (hasEnded && !reason)}>
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {reason === 'repeat' || reason === 'follow_up' ? 'Book' : 'Move to'}{' '}
            {istTime(selected)} on {istDayLabel(selected)}
          </Button>
          <p className="text-xs text-muted-foreground">
            {hasEnded && !reason
              ? 'Choose what happened above first.'
              : reason === 'repeat' || reason === 'follow_up'
                ? 'This meeting stays as it is. A new one is booked and linked to it.'
                : 'The guest will be emailed that you moved the meeting.'}
          </p>
        </>
      ) : null}
    </div>
  );
}
