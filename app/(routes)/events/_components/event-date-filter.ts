// Events Hub — "find events by Month / Date" (BUG-006221).
//
// An event matches when the days it RUNS overlap the chosen day or month, so a
// three-day event from 30 Oct to 1 Nov shows under October, under November, and
// under 31 Oct.
//
// Which days an event runs, in India time (Asia/Kolkata):
//   first day = event_date (the date the event page shows), else the IST day of
//               start_date
//   last day  = the IST day of end_date when it is later than the first day
//               (a multi-day event), else the first day
// That is the same rule the edit dialog saves by (event-run-window.ts,
// runWindowLastDay): end_date's day only extends the event when it is after
// event_date. Days are compared as 'yyyy-MM-dd' strings, which sort as dates.

import { isoToIstDateInput } from '@/lib/utils/date-format';

/** URL values: ?month=yyyy-MM and ?date=yyyy-MM-dd. */
export interface EventDateFilter {
  month?: string | null;
  date?: string | null;
}

/** Inclusive day range, both ends 'yyyy-MM-dd'. */
export interface DayRange {
  from: string;
  to: string;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isValidFilterMonth = (v: string | null | undefined): v is string =>
  !!v && MONTH_RE.test(v);

export function isValidFilterDate(v: string | null | undefined): v is string {
  if (!v || !DAY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** '2026-02' → { from: '2026-02-01', to: '2026-02-28' }. */
export function monthDayRange(month: string): DayRange {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`Invalid month: ${month}`);
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * The day range the filter asks for, or null when no (valid) filter is set.
 * With both a month and a date, the range is their intersection — and a date
 * outside the month yields an empty range ({from > to}), which matches nothing.
 */
export function eventDateFilterRange(filter: EventDateFilter): DayRange | null {
  const month = isValidFilterMonth(filter.month) ? monthDayRange(filter.month) : null;
  const day = isValidFilterDate(filter.date) ? { from: filter.date, to: filter.date } : null;
  if (month && day) {
    return {
      from: month.from > day.from ? month.from : day.from,
      to: month.to < day.to ? month.to : day.to,
    };
  }
  return month ?? day;
}

type EventDates = {
  event_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

/** The IST days an event runs, or null when it carries no date at all. */
export function eventDaySpan(event: EventDates): DayRange | null {
  const eventDay = (event.event_date ?? '').slice(0, 10);
  const startDay = isoToIstDateInput(event.start_date);
  const endDay = isoToIstDateInput(event.end_date);
  const first = DAY_RE.test(eventDay) ? eventDay : startDay || endDay;
  if (!first) return null;
  const last = endDay && endDay > first ? endDay : first;
  return { from: first, to: last };
}

/** Does the event run on at least one day inside the range? Undated events never match. */
export function eventOverlapsRange(event: EventDates, range: DayRange): boolean {
  const span = eventDaySpan(event);
  if (!span) return false;
  return span.from <= range.to && span.to >= range.from;
}

/** Rows that overlap the filter; the rows unchanged when no filter is set. */
export function filterEventsByDate<T extends EventDates>(rows: T[], filter: EventDateFilter): T[] {
  const range = eventDateFilterRange(filter);
  if (!range) return rows;
  return rows.filter((e) => eventOverlapsRange(e, range));
}

/** '2026-10' → 'October 2026' (chip label). */
export function formatFilterMonth(month: string): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
