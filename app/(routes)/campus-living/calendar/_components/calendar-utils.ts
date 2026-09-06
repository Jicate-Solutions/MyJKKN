import type { CalendarEvent } from '@/types/campus-living/calendar';

/** Parse an ISO date or datetime to a date-only `YYYY-MM-DD`. */
export function toIsoDate(input: string): string {
  if (!input) return '';
  // Already date-only?
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  // Use UTC slice to avoid TZ drift on date-only events.
  return d.toISOString().slice(0, 10);
}

/** Inclusive day list between two ISO date strings (YYYY-MM-DD). */
export function daysBetween(startIso: string, endIso: string): string[] {
  const a = toIsoDate(startIso);
  const b = toIsoDate(endIso);
  if (!a || !b) return a ? [a] : [];
  const out: string[] = [];
  const start = new Date(`${a}T00:00:00Z`);
  const end = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [a];
  const cursor = new Date(start);
  // Safety cap — never spread an event over more than 90 days on the grid.
  let safety = 0;
  while (cursor <= end && safety < 90) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    safety += 1;
  }
  return out;
}

/** First day of the month for a given Date, normalised to UTC midnight. */
export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Days-in-month for a given Date. */
export function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Build the 6-week (42-cell) month grid for the month containing `anchor`.
 * Weeks start on Sunday. Returns ISO date strings; out-of-month cells are
 * still included (the UI greys them out).
 */
export function buildMonthGrid(anchor: Date): string[] {
  const first = startOfMonth(anchor);
  const startDay = first.getUTCDay(); // 0=Sun
  const total = 42;
  const days: string[] = [];
  const cursor = new Date(first);
  cursor.setUTCDate(cursor.getUTCDate() - startDay);
  for (let i = 0; i < total; i += 1) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Group events by their occupied date (one event can occupy many days). */
export function bucketEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const dates = daysBetween(ev.start, ev.end);
    for (const d of dates) {
      const arr = map.get(d) ?? [];
      arr.push(ev);
      map.set(d, arr);
    }
  }
  return map;
}

/** Format YYYY-MM-DD → "20 May 2026". */
export function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Format YYYY-MM → "May 2026". */
export function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
