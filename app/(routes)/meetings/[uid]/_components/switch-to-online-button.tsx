'use client';

// app/(routes)/meetings/[uid]/_components/switch-to-online-button.tsx
//
// Host control for "turn this face-to-face meeting into a Google Meet without
// cancelling it" (Director-approved 2026-08-19). Structure follows the two
// neighbours in this folder — inline panel, no Radix dialog, server actions
// only — and the slot picker is the one RescheduleBookingButton already uses,
// reached through the same getMyBookingSlots action.
//
// Keeping the current time is the DEFAULT. Decision 5 makes moving OPTIONAL,
// which is why switchMyBookingToOnline takes startIso as an optional argument:
// the primary button switches the mode on its own, and picking a new time is a
// second step the host has to open on purpose.
//
// Failures render INLINE and stay on screen, where the sibling controls toast
// them. The messages this action returns are instructions — "your Google
// Calendar is not connected, connect it under Availability", "the calendar
// event may still show a video call, please open it and check" — and a toast
// that dismisses itself after a few seconds would take the instruction away
// with it. Success still toasts: success needs no reading.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMyBookingSlots, switchMyBookingToOnline } from '../actions';

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

export function SwitchToOnlineButton({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<DayGroup[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function loadSlots() {
    setLoading(true);
    setSelected(null);
    const result = await getMyBookingSlots(uid);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'Could not load available times.');
      setMoving(false);
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

  function openTimePicker() {
    setError(null);
    setMoving(true);
    void loadSlots();
  }

  function keepCurrentTime() {
    setMoving(false);
    setSelected(null);
    setDays(null);
  }

  function close() {
    setOpen(false);
    keepCurrentTime();
    setError(null);
  }

  function confirmSwitch() {
    setError(null);
    startTransition(async () => {
      // No slot picked → no second argument, so the meeting keeps its time.
      const result = await switchMyBookingToOnline(uid, selected ?? undefined);
      if (result.success) {
        // The switch worked either way. When the meeting kept a time the host's
        // ONLINE hours do not offer, say so instead of a plain success — it was
        // deliberately not moved to fit, and the host is the only one who can
        // decide whether that matters.
        if (result.outsideOnlineHours) {
          toast.warning(
            'Switched to Google Meet. Both of you have been emailed — but this time is outside the hours you keep for online meetings. It was not moved; change the time yourself if you need to.',
          );
        } else {
          toast.success(
            result.timeMoved
              ? 'Switched to Google Meet and moved. Both of you have been emailed.'
              : 'Switched to Google Meet. Both of you have been emailed.',
          );
        }
        close();
        router.refresh();
      } else {
        setError(result.error ?? 'Could not change the booking.');
        // A failed move is nearly always an availability failure, so the list
        // on screen is stale the moment it happens.
        if (selected) void loadSlots();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Video className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Switch to Google Meet
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Switch to Google Meet</p>
        <Button variant="ghost" size="sm" onClick={close} disabled={pending}>
          Not now
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        The meeting stays booked and keeps its current time. A Google Meet link is
        added to the calendar event and both of you are emailed.
      </p>

      {error ? (
        <div className="rounded-md bg-destructive/10 p-2 text-xs" role="alert">
          {error}
        </div>
      ) : null}

      {!moving ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={confirmSwitch} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Video className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            Switch, keep this time
          </Button>
          <Button variant="ghost" size="sm" onClick={openTimePicker} disabled={pending}>
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Also move it to another time
          </Button>
        </div>
      ) : null}

      {moving ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Pick a new time</p>
            <Button variant="ghost" size="sm" onClick={keepCurrentTime} disabled={pending}>
              Keep current time
            </Button>
          </div>

          {loading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Loading available times…
            </p>
          ) : null}

          {!loading && days && days.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No open slots in the next 14 days. You can still switch to Google Meet
              at the current time.
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

          <Button size="sm" onClick={confirmSwitch} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Video className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {selected
              ? `Switch and move to ${istTime(selected)} on ${istDayLabel(selected)}`
              : 'Switch, keep this time'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
