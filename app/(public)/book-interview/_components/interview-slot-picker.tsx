'use client';

// app/(public)/book-interview/_components/interview-slot-picker.tsx
//
// The time step. Same IST regrouping rule as the /meet widget: the slots API
// keys days by the host's calendar date, so a slot is re-filed under its IST
// date here before it is shown.

import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';

const IST = 'Asia/Kolkata';

export const istDateKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));

export const istDayLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(iso));

export const istTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));

export const istFull = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, weekday: 'long', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));

/** Every offered start, grouped by IST date, both in order. */
export function groupByIstDay(
  days: Record<string, Array<{ start: string }>> | undefined,
): Array<{ key: string; starts: string[] }> {
  const grouped = new Map<string, string[]>();
  for (const list of Object.values(days ?? {})) {
    for (const s of list) {
      const key = istDateKey(s.start);
      const arr = grouped.get(key) ?? [];
      arr.push(s.start);
      grouped.set(key, arr);
    }
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, starts]) => ({ key, starts: starts.sort() }));
}

interface InterviewSlotPickerProps {
  days: Record<string, Array<{ start: string }>>;
  selectedStart: string | null;
  onPick: (start: string) => void;
}

export function InterviewSlotPicker({ days, selectedStart, onPick }: InterviewSlotPickerProps) {
  const istDays = useMemo(() => groupByIstDay(days), [days]);
  return (
    <div className="flex flex-col gap-5">
      {istDays.map((day) => (
        <section key={day.key} aria-label={istDayLabel(day.starts[0])}>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {istDayLabel(day.starts[0])}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {day.starts.map((start) => {
              const picked = selectedStart === start;
              return (
                <button
                  key={start}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onPick(start)}
                  className={`rounded-md border px-2 py-2.5 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    picked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary hover:bg-muted'
                  }`}
                >
                  {istTime(start)}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-center text-xs text-muted-foreground">All times are Indian Standard Time.</p>
    </div>
  );
}
