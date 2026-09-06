'use client';

// app/(public)/book/cancel/[uid]/_components/cancel-widget.tsx
//
// Confirm-or-bail UI for the attendee cancel page. Reached from a phone, in a
// browser, from a calendar invite — so it is built as a phone surface first:
// one column, 44px+ targets, brand row at the top, and the booking itself
// rendered as a pass stub (the vocabulary meet-booking-widget already uses for
// its confirmation) so there is never a question about WHICH meeting this is.
//
// Times render in the VIEWER's own timezone with the zone named, resolved after
// mount. Server render uses IST, which is what an Indian viewer would see
// anyway, so there is no swap for almost everyone and no hydration mismatch.
//
// Light + dark are both painted explicitly here; the page's `colorScheme`
// viewport export makes the browser's own canvas match, so nothing shows
// through around the column on a tall phone.

import { useState, useSyncExternalStore, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { cancelAsAttendee } from '../actions';

const IST = 'Asia/Kolkata';

/** The browser's own timezone, read as an external value so the server snapshot
 *  (IST — what an Indian viewer sees anyway) and the client snapshot agree
 *  without a setState-in-effect swap. */
const subscribeToNothing = () => () => {};
const readBrowserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || IST;
const readServerZone = () => IST;

// The app's ThemeProvider pins anonymous visitors to light (defaultTheme='light'
// in app/layout.tsx), so the global `dark` class never appears for someone
// arriving from an email. These pages therefore read the phone's own setting and
// scope a `dark` class to their own wrapper — Tailwind's dark variant is
// `.dark &`, so every dark: class below lights up without touching the app-wide
// theme. Server snapshot is false, matching what ThemeProvider renders.
const DARK_QUERY = '(prefers-color-scheme: dark)';
const subscribeToScheme = (onChange: () => void) => {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const readPrefersDark = () => window.matchMedia(DARK_QUERY).matches;
const readServerPrefersDark = () => false;

/** Card shell — white on cream, deep green-black in dark. */
const CARD =
  'rounded-2xl border border-[#0b6d41]/15 bg-white dark:border-white/10 dark:bg-[#152420]';

/** Small caps label used for eyebrows and the pass stub's field names. */
const EYEBROW =
  'text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0b6d41] dark:text-[#4fcb92]';

export type CancelPageState = 'invalid' | 'already-cancelled' | 'past' | 'confirm';

interface CancelWidgetProps {
  uid: string;
  token: string;
  initialState: CancelPageState;
  meetingTitle: string;
  hostName: string;
  startTime: string; // ISO; empty when state is 'invalid'
  /** Wave-3 lifecycle: free-text policy from the meeting type, or null. */
  cancellationPolicy?: string | null;
}

export function CancelWidget({
  uid,
  token,
  initialState,
  meetingTitle,
  hostName,
  startTime,
  cancellationPolicy,
}: CancelWidgetProps) {
  const [state, setState] = useState<CancelPageState | 'cancelled'>(initialState);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The viewer's own zone, resolved post-hydration. IST until then.
  const tz = useSyncExternalStore(subscribeToNothing, readBrowserZone, readServerZone);
  const prefersDark = useSyncExternalStore(
    subscribeToScheme,
    readPrefersDark,
    readServerPrefersDark,
  );

  const whenLong = (iso: string) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));

  const zoneLabel = (iso: string) =>
    new Intl.DateTimeFormat('en-IN', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date(iso))
      .find((p) => p.type === 'timeZoneName')?.value ?? '';

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
    <div className={prefersDark ? 'dark' : undefined}>
    <div
      className="min-h-[100dvh] bg-[#FAF7F0] text-[#12261D] dark:bg-[#0b1411] dark:text-[#e8f0ea]"
      style={{ fontFamily: 'var(--font-ibm-plex-sans), sans-serif' }}
    >
      <div className="h-1 w-full bg-[#0b6d41]" />

      <div className="mx-auto w-full max-w-md px-4 pb-12 pt-4 sm:px-5">
        {/* Brand row — the "this is MyJKKN" anchor, styled like the app's own
            header rather than an anonymous form banner. */}
        <div className="flex items-center gap-2.5 pb-6">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#0b6d41] text-[15px] leading-none text-white"
            style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
            aria-hidden
          >
            J
          </span>
          <span className="text-[15px] font-semibold tracking-tight">MyJKKN</span>
          <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.14em] text-[#12261D]/45 dark:text-[#e8f0ea]/45">
            JKKN Institutions
          </span>
        </div>

        <h1
          className="text-[2rem] leading-[1.15] text-[#0b6d41] dark:text-[#4fcb92]"
          style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
        >
          Cancel booking
        </h1>

        {state === 'invalid' && (
          <div
            className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm leading-relaxed text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
            role="alert"
          >
            <p className="font-semibold">This link isn&apos;t valid</p>
            <p className="mt-1">
              Links get cut short when they are copied by hand. Open the
              &ldquo;Cancel booking&rdquo; link straight from your confirmation email, or
              contact the institution and they can cancel it for you.
            </p>
          </div>
        )}

        {state === 'already-cancelled' && (
          <>
            <p className="mt-2 text-sm text-[#12261D]/60 dark:text-[#e8f0ea]/60">
              Nothing left to do here.
            </p>
            <div className={`mt-5 px-4 py-5 ${CARD}`}>
              <p className="flex items-center gap-2 text-base font-semibold text-[#0b6d41] dark:text-[#4fcb92]">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
                Already cancelled
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#12261D]/70 dark:text-[#e8f0ea]/70">
                This booking was cancelled earlier, so it is already off the
                calendar. You can book a new time whenever you need one.
              </p>
            </div>
            <BookAgainLink />
          </>
        )}

        {state === 'past' && (
          <>
            <p className="mt-2 text-sm text-[#12261D]/60 dark:text-[#e8f0ea]/60">
              Nothing left to do here.
            </p>
            <div className={`mt-5 px-4 py-5 ${CARD}`}>
              <p className="text-base font-semibold">This meeting time has passed</p>
              <p className="mt-2 text-sm leading-relaxed text-[#12261D]/70 dark:text-[#e8f0ea]/70">
                A meeting that has already happened can&apos;t be cancelled. If you
                missed it, book a fresh slot instead.
              </p>
            </div>
            <BookAgainLink />
          </>
        )}

        {state === 'cancelled' && (
          <>
            <p className="mt-2 text-sm text-[#12261D]/60 dark:text-[#e8f0ea]/60">
              Done — the slot is free again.
            </p>
            <div className={`mt-5 px-4 py-5 ${CARD}`}>
              <p className="flex items-center gap-2 text-base font-semibold text-[#0b6d41] dark:text-[#4fcb92]">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
                Booking cancelled
              </p>
              {meetingTitle && (
                <p className="mt-2 text-sm text-[#12261D]/75 dark:text-[#e8f0ea]/75">
                  <span className="font-medium">{meetingTitle}</span> with {hostName}
                </p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-[#12261D]/70 dark:text-[#e8f0ea]/70">
                A confirmation email is on its way. Book a new time whenever you
                need one.
              </p>
            </div>
            <BookAgainLink />
          </>
        )}

        {state === 'confirm' && (
          <div className="flex flex-col gap-5">
            <p className="mt-2 text-sm text-[#12261D]/60 dark:text-[#e8f0ea]/60">
              Check the details, then confirm below.
            </p>

            {/* The pass stub — the one place this page raises its voice. Notched
                and perforated so it reads as a reservation, not a summary box. */}
            <div className={`relative ${CARD}`}>
              <div className="px-4 pb-4 pt-4">
                <p className={EYEBROW}>You are cancelling</p>
                <p
                  className="mt-1.5 text-[1.4rem] leading-snug"
                  style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
                >
                  {meetingTitle}
                </p>
              </div>

              <div className="relative" aria-hidden>
                <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[#FAF7F0] dark:bg-[#0b1411]" />
                <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[#FAF7F0] dark:bg-[#0b1411]" />
                <div className="mx-4 border-t border-dashed border-[#0b6d41]/25 dark:border-white/15" />
              </div>

              <dl className="space-y-3 px-4 pb-4 pt-4 text-sm">
                <div>
                  <dt className={EYEBROW}>When</dt>
                  <dd className="mt-1 flex items-start gap-2 font-medium">
                    <CalendarDays
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#0b6d41] dark:text-[#4fcb92]"
                      aria-hidden
                    />
                    <span>
                      {startTime ? whenLong(startTime) : ''}
                      {startTime && (
                        <span className="ml-1 font-normal text-[#12261D]/55 dark:text-[#e8f0ea]/55">
                          {zoneLabel(startTime)}
                        </span>
                      )}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className={EYEBROW}>With</dt>
                  <dd className="mt-1 font-medium">{hostName}</dd>
                </div>
                <div>
                  <dt className={EYEBROW}>Reference</dt>
                  <dd
                    className="mt-1 break-all text-xs text-[#12261D]/60 dark:text-[#e8f0ea]/60"
                    style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}
                  >
                    {uid}
                  </dd>
                </div>
              </dl>
            </div>

            {cancellationPolicy && (
              <div className="rounded-2xl border border-[#0b6d41]/20 bg-[#0b6d41]/[0.05] px-4 py-3.5 text-sm dark:border-[#4fcb92]/20 dark:bg-[#4fcb92]/[0.07]">
                <p className={`flex items-center gap-1.5 ${EYEBROW}`}>
                  <Info className="h-3.5 w-3.5" aria-hidden />
                  Cancellation policy
                </p>
                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-[#12261D]/80 dark:text-[#e8f0ea]/80">
                  {cancellationPolicy}
                </p>
              </div>
            )}

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Reason (optional)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Let the host know why you're cancelling"
                className="w-full rounded-xl border border-[#0b6d41]/25 bg-white px-3.5 py-3 text-base outline-none placeholder:text-[#12261D]/35 focus:border-[#0b6d41] focus:ring-2 focus:ring-[#0b6d41]/25 dark:border-white/15 dark:bg-[#152420] dark:placeholder:text-[#e8f0ea]/35 dark:focus:border-[#4fcb92] dark:focus:ring-[#4fcb92]/25"
              />
            </label>

            {error && (
              <div
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                role="alert"
              >
                {error}
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isPending}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#a01d1d] px-4 text-[15px] font-semibold text-white transition-colors hover:bg-[#861717] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a01d1d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF7F0] disabled:opacity-60 dark:focus-visible:ring-offset-[#0b1411]"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <XCircle className="h-4 w-4" aria-hidden />
                )}
                {isPending ? 'Cancelling…' : 'Cancel this booking'}
              </button>
              <p className="mt-3 text-center text-xs leading-relaxed text-[#12261D]/50 dark:text-[#e8f0ea]/50">
                Changed your mind? Close this page — your booking stays as it is.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

/** Onward route back into MyJKKN. /meet is the public booking directory, so it
 *  works for a visitor who has never signed in. */
function BookAgainLink() {
  return (
    <Link
      href="/meet"
      className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-[#0b6d41]/30 bg-white px-4 text-[15px] font-semibold text-[#0b6d41] transition-colors hover:bg-[#0b6d41]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF7F0] dark:border-[#4fcb92]/30 dark:bg-[#152420] dark:text-[#4fcb92] dark:hover:bg-[#4fcb92]/[0.08] dark:focus-visible:ring-[#4fcb92] dark:focus-visible:ring-offset-[#0b1411]"
    >
      Book a meeting at JKKN
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}
