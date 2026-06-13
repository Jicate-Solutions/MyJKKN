'use client';

// app/(public)/book/reschedule/[uid]/_components/reschedule-widget.tsx
//
// Pick-a-new-time UI for the attendee reschedule page (U5, D16). Loads the
// booking's live slots, lets the attendee pick, confirms in one tap.
// Mirrors the cancel-widget + meet-booking-widget aesthetic so the whole
// email → action journey feels like one product.

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, Loader2 } from 'lucide-react';

export type ReschedulePageState = 'invalid' | 'not-confirmed' | 'pick';

interface RescheduleWidgetProps {
  uid: string;
  token: string;
  initialState: ReschedulePageState;
  meetingTitle: string;
  hostName: string;
  currentStart: string; // ISO; empty when state is 'invalid'
}

interface SlotsResponse {
  days?: Record<string, Array<{ start: string }>>;
  durationMin?: number;
  error?: string;
}

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
    timeZone: IST, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));

const istFull = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, weekday: 'long', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));

export function RescheduleWidget({
  uid,
  token,
  initialState,
  meetingTitle,
  hostName,
  currentStart,
}: RescheduleWidgetProps) {
  const [state, setState] = useState<ReschedulePageState | 'done'>(initialState);
  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStart, setNewStart] = useState<string | null>(null);

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

  const istDays = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const list of Object.values(slots?.days ?? {})) {
      for (const s of list) {
        // The current slot may appear (it frees on move) — offering it is harmless.
        const key = istDateKey(s.start);
        const arr = grouped.get(key) ?? [];
        arr.push(s.start);
        grouped.set(key, arr);
      }
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, starts]) => ({ key, starts: starts.sort() }));
  }, [slots]);

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
            Reschedule
          </h1>
        </header>

        {state === 'invalid' && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700" role="alert">
            This reschedule link is not valid. It may have been copied incompletely —
            please use the link from your confirmation email, or contact the institution.
          </div>
        )}

        {state === 'not-confirmed' && (
          <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-4 text-sm">
            <p className="font-medium">This booking is not active anymore.</p>
            <p className="mt-1 text-[#1C2B24]/65">
              It may have been cancelled. You&apos;re welcome to book a fresh slot instead.
            </p>
          </div>
        )}

        {state === 'done' && newStart && (
          <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-5 text-sm">
            <p className="flex items-center gap-2 text-base font-medium text-[#0E4D34]">
              <CheckCircle2 className="h-5 w-5" aria-hidden /> Rescheduled!
            </p>
            <p className="mt-2 text-[#1C2B24]/80">
              <strong>{meetingTitle}</strong> with {hostName}
            </p>
            <p className="mt-1 text-[#1C2B24]/80">{istFull(newStart)} (IST)</p>
            <p className="mt-3 text-xs text-[#1C2B24]/55">
              A confirmation of the new time is on its way to your inbox. Your
              existing cancel and reschedule links keep working.
            </p>
          </div>
        )}

        {state === 'pick' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-3.5 text-sm">
              <p className="font-semibold">{meetingTitle}</p>
              <p className="mt-0.5 text-[#1C2B24]/70">with {hostName}</p>
              <p className="mt-1.5 text-xs text-[#1C2B24]/60">
                Currently: {currentStart ? `${istFull(currentStart)} (IST)` : ''}
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            {busy && !slots && (
              <p className="flex items-center gap-2 text-xs text-[#1C2B24]/60">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading available times…
              </p>
            )}

            {slots && istDays.length === 0 && (
              <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-5 text-sm text-[#1C2B24]/65">
                No other times are open in the next two weeks. Your current
                booking stands unless you cancel it.
              </div>
            )}

            {istDays.map((day) => (
              <div key={day.key}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#0E4D34]/70">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {istDayLabel(day.starts[0])}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {day.starts.map((start) => (
                    <button
                      key={start}
                      type="button"
                      onClick={() => setSelected(start)}
                      className={`rounded-md border px-2 py-2 text-sm transition-colors ${
                        selected === start
                          ? 'border-[#0E4D34] bg-[#0E4D34] text-white'
                          : 'border-[#0E4D34]/25 bg-white hover:border-[#0E4D34]/60'
                      }`}
                    >
                      {istTime(start)}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {slots && istDays.length > 0 && (
              <button
                type="button"
                onClick={confirmMove}
                disabled={!selected || busy}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0E4D34] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0a3b28] disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Clock className="h-4 w-4" aria-hidden />
                )}
                {selected ? `Move to ${istTime(selected)} on ${istDayLabel(selected)}` : 'Pick a new time'}
              </button>
            )}

            <p className="text-center text-xs text-[#1C2B24]/50">
              Changed your mind? Just close this page — your current time stays booked.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
