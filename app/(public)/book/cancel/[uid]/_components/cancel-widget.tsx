'use client';

// app/(public)/book/cancel/[uid]/_components/cancel-widget.tsx
//
// Confirm-or-bail UI for the attendee cancel page. Mirrors the public
// booking widget's aesthetic (evergreen + cream, DM Serif headline) so the
// email → cancel journey feels like one product.

import { useState, useTransition } from 'react';
import { CalendarDays, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cancelAsAttendee } from '../actions';

const IST = 'Asia/Kolkata';

const istFull = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

export type CancelPageState = 'invalid' | 'already-cancelled' | 'past' | 'confirm';

interface CancelWidgetProps {
  uid: string;
  token: string;
  initialState: CancelPageState;
  meetingTitle: string;
  hostName: string;
  startTime: string; // ISO; empty when state is 'invalid'
}

export function CancelWidget({
  uid,
  token,
  initialState,
  meetingTitle,
  hostName,
  startTime,
}: CancelWidgetProps) {
  const [state, setState] = useState<CancelPageState | 'cancelled'>(initialState);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelAsAttendee(uid, token, reason);
      if (result.success) {
        setState('cancelled');
      } else {
        setError(result.error ?? 'Could not cancel the booking. Please try again.');
      }
    });
  };

  return (
    <div
      className="min-h-screen bg-[#FAF7F0] text-[#1C2B24]"
      style={{ fontFamily: 'var(--font-ibm-plex-sans), sans-serif' }}
    >
      <div className="h-2 w-full bg-[#0E4D34]" />
      <div className="mx-auto flex min-h-[calc(100vh-0.5rem)] w-full max-w-md flex-col px-5 pb-10 pt-8">
        <header className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0E4D34]/70">
            JKKN Institutions
          </p>
          <h1
            className="mt-1 text-[1.9rem] leading-tight text-[#0E4D34]"
            style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
          >
            Cancel booking
          </h1>
        </header>

        {state === 'invalid' && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700" role="alert">
            This cancellation link is not valid. It may have been copied incompletely —
            please use the link from your confirmation email, or contact the institution.
          </div>
        )}

        {state === 'already-cancelled' && (
          <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-[#0E4D34]">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              This booking has already been cancelled.
            </p>
            <p className="mt-1 text-[#1C2B24]/65">No further action is needed.</p>
          </div>
        )}

        {state === 'past' && (
          <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-4 text-sm">
            <p className="font-medium">This meeting time has already passed.</p>
            <p className="mt-1 text-[#1C2B24]/65">
              Past meetings can&apos;t be cancelled. If you missed it, you can simply book a new slot.
            </p>
          </div>
        )}

        {state === 'cancelled' && (
          <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-5 text-sm">
            <p className="flex items-center gap-2 text-base font-medium text-[#0E4D34]">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
              Your booking has been cancelled.
            </p>
            <p className="mt-2 text-[#1C2B24]/65">
              A confirmation email is on its way. You&apos;re welcome to book a new slot at any time.
            </p>
          </div>
        )}

        {state === 'confirm' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0E4D34]/60">
                You are about to cancel
              </p>
              <p className="mt-2 text-base font-semibold">{meetingTitle}</p>
              <p className="mt-1 text-sm text-[#1C2B24]/75">with {hostName}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-[#1C2B24]/75">
                <CalendarDays className="h-4 w-4 shrink-0 text-[#0E4D34]" aria-hidden />
                {startTime ? `${istFull(startTime)} (IST)` : ''}
              </p>
              <p className="mt-3 text-xs text-[#1C2B24]/50">Reference: {uid}</p>
            </div>

            <label className="text-sm">
              <span className="mb-1 block font-medium">Reason (optional)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Let the counselor know why you're cancelling"
                className="w-full rounded-md border border-[#0E4D34]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[#0E4D34] focus:ring-1 focus:ring-[#0E4D34]"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4" aria-hidden />
              )}
              {isPending ? 'Cancelling…' : 'Cancel this booking'}
            </button>

            <p className="text-center text-xs text-[#1C2B24]/50">
              Changed your mind? Just close this page — your booking stays confirmed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
