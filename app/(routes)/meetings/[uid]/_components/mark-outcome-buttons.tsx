'use client';

// app/(routes)/meetings/[uid]/_components/mark-outcome-buttons.tsx
//
// "Did this meeting happen?" — the two-button answer on a finished booking,
// shown to the booking's host and (since 20260926010000) to a super admin
// closing it on the host's behalf. Whoever presses it is recorded BY NAME, so
// the dialog and the confirmation both say so rather than implying the host
// answered. Structure, confirm-dialog UX and copy are lifted from the module
// that already solved this exact problem:
// app/(routes)/campus-living/housekeeping/bookings/_components/booking-day-board.tsx
// (Mark complete / No-show behind an AlertDialog, mutation pending keeps the
// dialog open, feedback via toast). The one difference is the transport: that
// board calls its RPC through a React Query hook because it lives in a client
// list; this page is a server component, so the same RPC is reached through
// the page's own server action and router.refresh() re-renders the badge.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { markMeetingOutcome, type MeetingOutcome } from '../actions';

export function MarkOutcomeButtons({ uid }: { uid: string }) {
  const [pendingOutcome, setPendingOutcome] = useState<MeetingOutcome | null>(null);
  const [saving, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    if (!pendingOutcome) return;
    const outcome = pendingOutcome;
    startTransition(async () => {
      const result = await markMeetingOutcome(uid, outcome);
      setPendingOutcome(null);
      if (result.success) {
        const what = outcome === 'completed' ? 'Marked as happened' : 'Marked as a no-show';
        // Only say "in your name" when the caller is NOT the host — for a host
        // it is the obvious default and reads as noise, but for a super admin
        // closing someone else's meeting it is the fact they need confirmed.
        toast.success(result.markedBy === 'admin' ? `${what}, in your name.` : `${what}.`);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Could not save the outcome.');
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-green-700 hover:text-green-800"
          disabled={saving}
          onClick={() => setPendingOutcome('completed')}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Mark happened
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-amber-700 hover:text-amber-800"
          disabled={saving}
          onClick={() => setPendingOutcome('no_show')}
        >
          <UserX className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Mark no-show
        </Button>
      </div>

      <AlertDialog
        open={pendingOutcome !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPendingOutcome(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingOutcome === 'completed'
                ? 'Mark this meeting as happened?'
                : 'Mark this meeting as a no-show?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingOutcome === 'completed'
                ? 'The booking moves to Completed.'
                : 'The booking moves to No-show, recording that the attendee did not turn up.'}{' '}
              Your name is saved as the person who closed it — not the host&apos;s, if you
              are closing this on their behalf. This is the record of what happened — it
              cannot be changed from this screen afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open while the action runs; confirm() closes it.
                e.preventDefault();
                confirm();
              }}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {pendingOutcome === 'completed' ? 'Mark happened' : 'Mark no-show'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
