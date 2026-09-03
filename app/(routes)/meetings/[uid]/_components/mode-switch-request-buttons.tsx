'use client';

// app/(routes)/meetings/[uid]/_components/mode-switch-request-buttons.tsx
//
// Approve / Decline for a visitor's pending "can we make this a video call?"
// request. Same shape as MarkOutcomeButtons in this folder: the page owns the
// Card, the heading and every fact about the request (who asked, when, what
// time they proposed) because those are server data; this component is only
// the two buttons and their result.
//
// No confirmation step. Unlike marking an outcome — which writes a permanent
// record of what happened — approving is one deliberate click on a button that
// says exactly what it does, and declining leaves the visitor free to ask again
// while the notice window is still open.
//
// Failures render INLINE for the same reason as SwitchToOnlineButton: on
// approval the returned messages are instructions the host has to act on
// ("connect your Google Calendar", "the calendar event may still show a video
// call"), and a self-dismissing toast would remove the instruction.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveBookingModeSwitchRequest } from '../actions';

export function ModeSwitchRequestButtons({ uid }: { uid: string }) {
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<'approve' | 'decline' | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function resolve(decision: 'approve' | 'decline') {
    setError(null);
    setActing(decision);
    startTransition(async () => {
      const result = await resolveBookingModeSwitchRequest(uid, decision);
      setActing(null);
      if (result.success) {
        // Approving keeps the meeting's time unless the visitor asked for a new
        // one, so the same warning applies here: the host is told when the time
        // they just approved sits outside their online hours.
        if (decision === 'approve' && result.outsideOnlineHours) {
          toast.warning(
            'Switched to Google Meet. Both of you have been emailed — but this time is outside the hours you keep for online meetings. It was not moved; change the time yourself if you need to.',
          );
        } else {
          toast.success(
            decision === 'approve'
              ? result.timeMoved
                ? 'Switched to Google Meet and moved. Both of you have been emailed.'
                : 'Switched to Google Meet. Both of you have been emailed.'
              : 'Request declined. The meeting stays in person.',
          );
        }
        router.refresh();
      } else {
        setError(result.error ?? 'Could not change the booking.');
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md bg-destructive/10 p-2 text-xs" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => resolve('approve')} disabled={pending}>
          {pending && acting === 'approve' ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Approve — switch to Google Meet
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => resolve('decline')}
          disabled={pending}
        >
          {pending && acting === 'decline' ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Decline — keep it in person
        </Button>
      </div>
    </div>
  );
}
