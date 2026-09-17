// lib/utils/academic/period-time-window.ts
//
// BUG-006133: "I have marked the attendance unfortunately for the upcoming Period"
//
// A faculty member marked CET P8 (15:45–16:30 IST) at 13:09 IST on the same day —
// 2h35m before the class had started — and then had no way to take it back. The
// guard that would have stopped him had been short-circuited in the UI:
//
//   const getTimeStatus = (startTime: string) => {
//     // TEMPORARY: Remove time-based restrictions
//     return 'current';
//     /* COMMENTED OUT - Original time-based logic ... */
//   }
//
// ...and there had never been an equivalent check in the service layer, so the
// only thing standing between a click and a written row was the approved-leave
// check. Across 2026-09-01..16, 113 of 682 stored period-slots carry a
// `marked_at` earlier than their own `start_time`.
//
// This module is the single source of truth for "has this period begun yet?".
// It lives apart from the components so the UI and the service cannot drift
// (the previous guard existed in two copy-pasted components and neither one
// was reachable from the write path).
//
// Times are resolved in IST. India has no DST and has not changed offset since
// 1945, so a fixed +05:30 is safe and keeps this dependency-free — the same
// reasoning already documented in lib/utils/date-format.ts.

/** Minutes before a period's start_time at which marking opens. */
export const MARK_GRACE_MINUTES = 5;

export type PeriodTimeStatus = 'upcoming' | 'current' | 'past';

const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * Parse a period start/end time into minutes-since-midnight.
 *
 * `attendance_data` stores this field in two different shapes depending on
 * which surface wrote the row — `"15:45:00"` (24h, straight off the `periods`
 * table) and `"2:45 PM"` (12h, built for display and then persisted). Both are
 * live in production on the same record, so both must parse or a guard keyed
 * on this field would silently pass whichever format it failed to read.
 *
 * Returns null for anything unparseable; callers decide how to fail.
 */
export function parsePeriodTimeToMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;

  const value = raw.trim().toUpperCase();
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[4];

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * The instant a period begins, as a real Date, given an IST calendar date
 * (`YYYY-MM-DD`) and a start time in either stored format.
 */
export function periodStartInstant(
  attendanceDate: string | null | undefined,
  startTime: string | null | undefined
): Date | null {
  if (!attendanceDate) return null;
  const dateMatch = attendanceDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;

  const minutesIntoDay = parsePeriodTimeToMinutes(startTime);
  if (minutesIntoDay === null) return null;

  const [, year, month, day] = dateMatch;
  const utcMidnight = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return new Date(utcMidnight + (minutesIntoDay - IST_OFFSET_MINUTES) * 60_000);
}

/**
 * True when the period has not begun yet (beyond the grace window) and so
 * cannot honestly have attendance recorded against it.
 *
 * Unparseable input returns false — fail open. A malformed `start_time` is a
 * data problem, and blocking every such period would take away the ability to
 * mark real, already-taught classes. The guard exists to catch the ordinary
 * mistake of marking tomorrow's class today, not to police data quality.
 */
export function isPeriodNotStarted(
  attendanceDate: string | null | undefined,
  startTime: string | null | undefined,
  now: Date = new Date(),
  graceMinutes: number = MARK_GRACE_MINUTES
): boolean {
  const start = periodStartInstant(attendanceDate, startTime);
  if (!start) return false;
  return now.getTime() < start.getTime() - graceMinutes * 60_000;
}

/**
 * Three-way status for the period cards.
 *
 * Note there is no 'past' cut-off that blocks anything: late marking stays
 * open indefinitely. The pre-existing commented-out implementation applied a
 * 4-hour buffer after which a period read as 'past', and reinstating that
 * would break legitimate back-dated correction — a separate decision from the
 * one this bug asks for. 'past' here is presentational only.
 */
export function getPeriodTimeStatus(
  attendanceDate: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  now: Date = new Date(),
  graceMinutes: number = MARK_GRACE_MINUTES
): PeriodTimeStatus {
  if (isPeriodNotStarted(attendanceDate, startTime, now, graceMinutes)) {
    return 'upcoming';
  }
  const end = periodStartInstant(attendanceDate, endTime);
  if (end && now.getTime() > end.getTime()) return 'past';
  return 'current';
}

/** "3:45 PM" — for telling a user when a period they clicked too early opens. */
export function formatPeriodTime(raw: string | null | undefined): string {
  const minutesIntoDay = parsePeriodTimeToMinutes(raw);
  if (minutesIntoDay === null) return '';
  const hours24 = Math.floor(minutesIntoDay / 60);
  const minutes = minutesIntoDay % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}
