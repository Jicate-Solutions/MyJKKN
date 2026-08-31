'use client';

// app/(routes)/meetings/[uid]/_components/switch-back-button.tsx
//
// Host control for "this does not need to be a video call after all" — the
// other half of SwitchToOnlineButton (Director ruling 2, 2026-08-21). HOST
// ONLY: the page renders this for the booking's host, and
// switchMyBookingBackFromOnline re-checks that server-side, so hiding the
// button is a courtesy rather than the control.
//
// Deliberately simpler than its forward sibling: there is no slot picker,
// because switching back never moves the meeting. That keeps reschedule_count
// out of it entirely and leaves the visitor's calendar entry at the time they
// already have.
//
// One confirmation step, unlike ModeSwitchRequestButtons. Undoing a video call
// can send someone travelling, so a stray click on a small outline button
// should not be enough — the confirm panel says what will happen first.
//
// Failures render INLINE for the same reason as the two neighbours: the
// messages are instructions ("connect your Google Calendar", "the calendar
// event may still show a video call"), and a self-dismissing toast would take
// the instruction away with it. Success toasts; success needs no reading.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { switchMyBookingBackFromOnline } from '../actions';

export function SwitchBackButton({
  uid,
  backTo,
}: {
  uid: string;
  /** Where the meeting lands once the override is cleared: its type's own mode. */
  backTo: 'in_person' | 'phone';
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onPhone = backTo === 'phone';
  const label = onPhone ? 'Switch back to a phone call' : 'Switch back to in person';
  const Icon = onPhone ? Phone : MapPin;

  function close() {
    setOpen(false);
    setError(null);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await switchMyBookingBackFromOnline(uid);
      if (result.success) {
        toast.success(
          onPhone
            ? 'Back to a phone call. Both of you have been emailed.'
            : 'Back to an in-person meeting. Both of you have been emailed.',
        );
        close();
        router.refresh();
      } else {
        setError(result.error ?? 'Could not change the booking.');
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Icon className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button variant="ghost" size="sm" onClick={close} disabled={pending}>
          Not now
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        The meeting stays booked and keeps its current time. The Google Meet link
        is removed from the calendar event and both of you are emailed
        {onPhone
          ? ', so they know to expect your call instead.'
          : ', so they know to come in person instead.'}
      </p>

      {error ? (
        <div className="rounded-md bg-destructive/10 p-2 text-xs" role="alert">
          {error}
        </div>
      ) : null}

      <Button size="sm" onClick={confirm} disabled={pending}>
        {pending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Icon className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        )}
        {label}
      </Button>
    </div>
  );
}
