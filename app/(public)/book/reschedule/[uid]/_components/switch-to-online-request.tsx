'use client';

// app/(public)/book/reschedule/[uid]/_components/switch-to-online-request.tsx
//
// "Can we do this over video instead?" — the visitor's side of the mode switch,
// rendered inside the reschedule page they already reach from their
// confirmation email. Same token-in-body shape as the reschedule widget's own
// POST; the sibling route is /api/public/booking/switch-to-online/[uid].
//
// The visitor is ASKING, never changing (decision 4: the route can only ever
// create a PENDING request). Every piece of copy here says so, and the success
// state deliberately does NOT read like a confirmation: it names the host, says
// the meeting is still in person, and offers no video link — because there is
// none until the host approves.
//
// Time is deliberately NOT part of this request even though the API accepts an
// optional `start`. The visitor is standing in front of a slot picker for a
// different purpose (moving the meeting), and letting one selection feed two
// buttons would make "did I just move my meeting?" ambiguous. Asking to go
// online keeps the booked time; moving the time is the button above.
//
// Error copy: the API answers with short machine codes for the cases it has
// decided about (too_late, calendar_not_connected, …) and with plain sentences
// for everything else. Known codes are turned into sentences here — the same
// thing the reschedule widget already does for slot_taken — and anything else
// is shown exactly as the server worded it. No branch produces a generic
// "something went wrong".

import { useState } from 'react';
import { Clock, Loader2, Video } from 'lucide-react';

interface SwitchToOnlineRequestProps {
  uid: string;
  token: string;
  hostName: string;
  /** True when this booking already carries a live request awaiting the host. */
  alreadyRequested: boolean;
}

const CODE_MESSAGES: Record<string, string> = {
  already_online: 'This meeting is already a video call.',
  // No longer "this is a phone call": since ruling 1 (2026-08-21) a phone call
  // can be made into a video call, so this is only reached by a mode nobody has
  // decided about.
  unsupported_mode:
    'This booking is not set up in a way a video link can be added to.',
  too_late:
    'It is too close to the start time to change how this meeting happens.',
  calendar_not_connected:
    'The host does not have a connected calendar right now, so a video link cannot be created. Please contact the institution.',
  slot_taken: 'That time was just taken — please pick another slot.',
};

export function SwitchToOnlineRequest({
  uid,
  token,
  hostName,
  alreadyRequested,
}: SwitchToOnlineRequestProps) {
  const [sent, setSent] = useState(alreadyRequested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function askToSwitch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/booking/switch-to-online/${uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const code = typeof json.error === 'string' ? json.error : '';
        throw new Error(
          CODE_MESSAGES[code] || code || 'Could not send the request. Please try again.',
        );
      }
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not send the request. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#0b6d41]/15 bg-white px-4 py-4 text-sm dark:border-white/10 dark:bg-[#152420]">
      <p className="flex items-center gap-2 font-semibold">
        <Video className="h-4 w-4 shrink-0 text-[#0b6d41] dark:text-[#4fcb92]" aria-hidden />
        Would a video call be easier?
      </p>

      {sent ? (
        <>
          <p className="mt-2 flex items-center gap-2 text-[#12261D]/80 dark:text-[#e8f0ea]/80">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            Waiting for {hostName} to reply.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#12261D]/60 dark:text-[#e8f0ea]/60">
            Your request has been sent. Nothing has changed yet — this meeting is
            still in person at the time above. If {hostName} agrees, you will be
            emailed a joining link.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1.5 leading-relaxed text-[#12261D]/70 dark:text-[#e8f0ea]/70">
            You can ask {hostName} to turn this into a video call instead. Your
            booked time stays exactly as it is.
          </p>

          {error && (
            <div
              className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={askToSwitch}
            disabled={busy}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#0b6d41]/40 px-4 text-[15px] font-semibold text-[#0b6d41] transition-colors hover:bg-[#0b6d41]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF7F0] disabled:opacity-60 dark:border-[#4fcb92]/40 dark:text-[#4fcb92] dark:hover:bg-[#4fcb92]/[0.08] dark:focus-visible:ring-[#4fcb92] dark:focus-visible:ring-offset-[#0b1411]"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Video className="h-4 w-4" aria-hidden />
            )}
            Ask to meet by video instead
          </button>

          <p className="mt-2 text-xs leading-relaxed text-[#12261D]/50 dark:text-[#e8f0ea]/50">
            This only sends a request. {hostName} has to agree before anything
            changes.
          </p>
        </>
      )}
    </div>
  );
}
