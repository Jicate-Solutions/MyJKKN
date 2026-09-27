/**
 * next_run_at maths for AI Assistant scheduled questions — the TypeScript
 * mirror of public.fn_ai_query_schedule_next_run
 * (supabase/migrations/20270305090000_ai_query_schedules.sql).
 *
 * The DATABASE is authoritative: it sets next_run_at on create, resume and every
 * run. This mirror only drives the dialog's "Next: …" preview, so the person sees
 * the same time the database will pick. The same rules, both places:
 *   daily   → today at the time, else tomorrow
 *   weekly  → the next chosen weekday at the time (today counts if still ahead)
 *   monthly → the chosen date this month, else next month; a month shorter than
 *             the date runs on its LAST day (31 → 30 Apr, 28/29 Feb)
 * Always the next occurrence STRICTLY AFTER `after`. IST has no daylight
 * saving, so the wall clock is a fixed UTC+05:30.
 */

import type { ScheduleCadence } from './types';

const IST_OFFSET_MS = 330 * 60 * 1000;

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Parse 'HH:MM' or 'HH:MM:SS' into minutes after midnight; null when invalid. */
export function parseTimeIst(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The next time the schedule runs, strictly after `after`, or null when the
 * inputs do not describe a schedule (missing weekday / date, bad time).
 */
export function computeNextRun(
  cadence: ScheduleCadence,
  weekday: number | null,
  dayOfMonth: number | null,
  timeIst: string,
  after: Date,
): Date | null {
  const minutes = parseTimeIst(timeIst);
  if (minutes === null) return null;

  // "IST wall clock" expressed as a UTC timestamp, so getUTC* read IST fields.
  const nowWall = after.getTime() + IST_OFFSET_MS;
  const today = new Date(nowWall);
  const y = today.getUTCFullYear();
  const mo = today.getUTCMonth();
  const d = today.getUTCDate();
  const wall = (year: number, month: number, day: number) =>
    Date.UTC(year, month, day, Math.floor(minutes / 60), minutes % 60);
  const toReal = (wallMs: number) => new Date(wallMs - IST_OFFSET_MS);

  if (cadence === 'daily') {
    let cand = wall(y, mo, d);
    if (cand <= nowWall) cand = wall(y, mo, d + 1);
    return toReal(cand);
  }

  if (cadence === 'weekly') {
    if (weekday === null || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
    const ahead = (weekday - today.getUTCDay() + 7) % 7;
    let cand = wall(y, mo, d + ahead);
    if (cand <= nowWall) cand = wall(y, mo, d + ahead + 7);
    return toReal(cand);
  }

  if (cadence === 'monthly') {
    if (dayOfMonth === null || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return null;
    }
    for (let i = 0; i < 2; i++) {
      const monthStart = new Date(Date.UTC(y, mo + i, 1));
      const yy = monthStart.getUTCFullYear();
      const mm = monthStart.getUTCMonth();
      const day = Math.min(dayOfMonth, daysInMonth(yy, mm));
      const cand = wall(yy, mm, day);
      if (cand > nowWall) return toReal(cand);
    }
  }
  return null;
}

/** 'HH:MM[:SS]' → '9:00 am' */
export function formatTimeIst(time: string): string {
  const minutes = parseTimeIst(time);
  if (minutes === null) return time;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Plain English: "every Monday at 9:00 am (IST)". */
export function describeSchedule(s: {
  cadence: ScheduleCadence;
  weekday: number | null;
  day_of_month: number | null;
  time_ist: string;
}): string {
  const at = `at ${formatTimeIst(s.time_ist)} (IST)`;
  if (s.cadence === 'daily') return `every day ${at}`;
  if (s.cadence === 'weekly') {
    const name = s.weekday !== null ? WEEKDAY_NAMES[s.weekday] : undefined;
    return name ? `every ${name} ${at}` : `every week ${at}`;
  }
  if (s.day_of_month === null) return `every month ${at}`;
  const lastDayNote = s.day_of_month > 28 ? ' (or the last day of a shorter month)' : '';
  return `every month on the ${ordinal(s.day_of_month)}${lastDayNote} ${at}`;
}

/** A timestamp shown in IST: "Mon, 28 Sep, 9:00 am". */
export function formatIstDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
