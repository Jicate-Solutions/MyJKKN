'use client';

// app/(public)/book/reschedule/[uid]/_components/reschedule-widget.tsx
//
// Pick-a-new-time UI for the attendee reschedule page (U5, D16). Loads the
// booking's live slots, lets the attendee pick, confirms in one tap.
//
// Built as a phone surface first, matching cancel-widget: one column, 48px slot
// targets, MyJKKN brand row, and the booking rendered as a pass stub so the
// meeting being moved is never in doubt. Times render in the VIEWER's own
// timezone with the zone named, resolved after mount; the server renders IST,
// which is what an Indian viewer sees anyway.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { SwitchToOnlineRequest } from './switch-to-online-request';

export type ReschedulePageState = 'invalid' | 'not-confirmed' | 'pick';

interface RescheduleWidgetProps {
  uid: string;
  token: string;
  initialState: ReschedulePageState;
  meetingTitle: string;
  hostName: string;
  currentStart: string; // ISO; empty when state is 'invalid'
  /** Server-decided: may this visitor ask for a video call instead? */
  canAskForVideo: boolean;
  /** Server-decided: is one of their requests already awaiting the host? */
  switchRequestPending: boolean;
}

interface SlotsResponse {
  days?: Record<string, Array<{ start: string }>>;
  durationMin?: number;
  error?: string;
}

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

export function RescheduleWidget({
  uid,
  token,
  initialState,
  meetingTitle,
  hostName,
  currentStart,
  canAskForVideo,
  switchRequestPending,
}: RescheduleWidgetProps) {
  const [state, setState] = useState<ReschedulePageState | 'done'>(initialState);
  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStart, setNewStart] = useState<string | null>(null);

  // The viewer's own zone, resolved post-hydration. IST until then. Slot
  // grouping follows it too, so a viewer abroad sees days that match their own
  // calendar rather than India's.
  const tz = useSyncExternalStore(subscribeToNothing, readBrowserZone, readServerZone);
  const prefersDark = useSyncExternalStore(
    subscribeToScheme,
    readPrefersDark,
    readServerPrefersDark,
  );

  const dateKey = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));

  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'short',
    }).format(new Date(iso));

  const shortDayLabel = (iso: string) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
    }).format(new Date(iso));

  const timeLabel = (iso: string) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: tz, hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));

  const whenLong = (iso: string) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));

  const zoneLabel = (iso: string) =>
    new Intl.DateTimeFormat('en-IN', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date(iso))
      .find((p) => p.type === 'timeZoneName')?.value ?? '';

  const apiUrl = `/api/public/booking/reschedule/${uid}`;

  async function loadSlots() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as SlotsResponse;
      if (!res.ok) throw new Error(json.error || 'Could not load available times.');
      setSlots(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load available times.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialState === 'pick') void loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load
  }, []);

  const days = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const list of Object.values(slots?.days ?? {})) {
      for (const s of list) {
        // The current slot may appear (it frees on move) — offering it is harmless.
        const key = dateKey(s.start);
        const arr = grouped.get(key) ?? [];
        arr.push(s.start);
        grouped.set(key, arr);
      }
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, starts]) => ({ key, starts: starts.sort() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dateKey is derived from tz
  }, [slots, tz]);

  async function confirmMove() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, start: selected }),
      });
      const json = await res.json();
      if (res.status === 409 && json.error === 'slot_taken') {
        setError('That time was just taken — please pick another slot.');
        setSelected(null);
        await loadSlots();
        return;
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not reschedule.');
      }
      setNewStart(json.start as string);
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reschedule.');
    } finally {
      setBusy(false);
    }
  }

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
          Move this meeting
        </h1>

        {state === 'invalid' && (
          <div
            className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm leading-relaxed text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
            role="alert"
          >
            <p className="font-semibold">This link isn&apos;t valid</p>
            <p className="mt-1">
              Links get cut short when they are copied by hand. Open the
              &ldquo;Reschedule&rdquo; link straight from your confirmation email, or
              contact the institution and they can move it for you.
            </p>
          </div>
        )}

        {state === 'not-confirmed' && (
          <>
            <p className="mt-2 text-sm text-[#12261D]/60 dark:text-[#e8f0ea]/60">
              Nothing left to do here.
            </p>
            <div className={`mt-5 px-4 py-5 ${CARD}`}>
              <p className="text-base font-semibold">This booking is no longer active</p>
              <p className="mt-2 text-sm leading-relaxed text-[#12261D]/70 dark:text-[#e8f0ea]/70">
                It was most likely cancelled, so there is no time left to move.
                Book a fresh slot instead.
              </p>
            </div>
            <BookAgainLink />
          </>
        )}

        {state === 'done' && newStart && (
          <>
            <p className="mt-2 text-sm text-[#12261D]/60 dark:text-[#e8f0ea]/60">
              Done — your new time is booked.
            </p>
            <div className={`mt-5 px-4 py-5 ${CARD}`}>
              <p className="flex items-center gap-2 text-base font-semibold text-[#0b6d41] dark:text-[#4fcb92]">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
                Meeting moved
              </p>
              <p className="mt-2 text-sm text-[#12261D]/75 dark:text-[#e8f0ea]/75">
                <span className="font-medium">{meetingTitle}</span> with {hostName}
              </p>
              <p className="mt-1 flex items-start gap-2 text-sm font-medium">
                <CalendarDays
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#0b6d41] dark:text-[#4fcb92]"
                  aria-hidden
                />
                <span>
                  {whenLong(newStart)}
                  <span className="ml-1 font-normal text-[#12261D]/55 dark:text-[#e8f0ea]/55">
                    {zoneLabel(newStart)}
                  </span>
                </span>
              </p>
              <p className="mt-3 text-xs leading-relaxed text-[#12261D]/55 dark:text-[#e8f0ea]/55">
                A confirmation of the new time is on its way to your inbox. Your
                existing cancel and reschedule links keep working.
              </p>
            </div>
            <BookAgainLink />
          </>
        )}

        {state === 'pick' && (
          <div className="flex flex-col gap-5">
            <p className="mt-2 text-sm text-[#12261D]/60 dark:text-[#e8f0ea]/60">
              Pick a new time below. Nothing changes until you confirm.
            </p>

            {/* The pass stub — the one place this page raises its voice. Notched
                and perforated so it reads as a reservation, not a summary box. */}
            <div className={`relative ${CARD}`}>
              <div className="px-4 pb-4 pt-4">
                <p className={EYEBROW}>You are moving</p>
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
                  <dt className={EYEBROW}>Booked for now</dt>
                  <dd className="mt-1 flex items-start gap-2 font-medium">
                    <CalendarDays
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#0b6d41] dark:text-[#4fcb92]"
                      aria-hidden
                    />
                    <span>
                      {currentStart ? whenLong(currentStart) : ''}
                      {currentStart && (
                        <span className="ml-1 font-normal text-[#12261D]/55 dark:text-[#e8f0ea]/55">
                          {zoneLabel(currentStart)}
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

            {error && (
              <div
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                role="alert"
              >
                {error}
              </div>
            )}

            {busy && !slots && (
              <p className="flex items-center gap-2 text-sm text-[#12261D]/60 dark:text-[#e8f0ea]/60">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading available times…
              </p>
            )}

            {slots && days.length === 0 && (
              <div className={`px-4 py-5 text-sm ${CARD}`}>
                <p className="font-semibold">No other times are open</p>
                <p className="mt-2 leading-relaxed text-[#12261D]/70 dark:text-[#e8f0ea]/70">
                  Nothing else is free in the next two weeks. Your current
                  booking stands unless you cancel it.
                </p>
              </div>
            )}

            {days.map((day) => (
              <div key={day.key}>
                <p className={`mb-2.5 flex items-center gap-1.5 ${EYEBROW}`}>
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {dayLabel(day.starts[0])}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {day.starts.map((start) => {
                    const isSelected = selected === start;
                    return (
                      <button
                        key={start}
                        type="button"
                        onClick={() => setSelected(start)}
                        aria-pressed={isSelected}
                        className={`flex min-h-[48px] items-center justify-center rounded-xl border px-1 text-center text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF7F0] dark:focus-visible:ring-[#4fcb92] dark:focus-visible:ring-offset-[#0b1411] ${
                          isSelected
                            ? 'border-[#0b6d41] bg-[#0b6d41] text-white dark:border-[#4fcb92] dark:bg-[#4fcb92] dark:text-[#07120e]'
                            : 'border-[#0b6d41]/25 bg-white hover:border-[#0b6d41]/60 dark:border-white/15 dark:bg-[#152420] dark:hover:border-[#4fcb92]/50'
                        }`}
                      >
                        {timeLabel(start)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {slots && days.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={confirmMove}
                  disabled={!selected || busy}
                  className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#0b6d41] px-4 text-[15px] font-semibold text-white transition-colors hover:bg-[#095434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF7F0] disabled:opacity-60 dark:focus-visible:ring-offset-[#0b1411]"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Clock className="h-4 w-4" aria-hidden />
                  )}
                  {selected
                    ? `Move to ${timeLabel(selected)}, ${shortDayLabel(selected)}`
                    : 'Pick a time above'}
                </button>
                <p className="mt-3 text-center text-xs leading-relaxed text-[#12261D]/50 dark:text-[#e8f0ea]/50">
                  Changed your mind? Close this page — your current time stays booked.
                </p>
              </div>
            )}

            {/* Separate from the picker above on purpose: moving the meeting and
                asking to meet by video are two different requests, and only one
                of them takes effect without the host. */}
            {(canAskForVideo || switchRequestPending) && (
              <SwitchToOnlineRequest
                uid={uid}
                token={token}
                hostName={hostName}
                alreadyRequested={switchRequestPending}
              />
            )}
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
