// The run window (events.start_date / end_date, timestamptz) as the edit dialog
// saves it.
//
// An event row stores its time twice: the wall clock the event page shows
// (event_date + start_time / end_time) and the run window that scheduling,
// calendar feeds and availability read. The create page already derives the run
// window from the clock (create/page.tsx, buildDaySlots). The edit dialog used to
// save its own 'Runs from / Runs until' inputs instead, so an organiser who moved
// the date or the hours left the run window on the old values — the divergence
// scripts/ci/check-event-time-consistency.mjs reports.
//
// Rule: when the clock is filled in, it is the one source of truth.
//   start_date = event_date at start_time (IST)
//   end_date   = last day at end_time (IST), where last day is the day already
//                on 'Runs until' ONLY when it is later than event_date (a
//                multi-day event); otherwise event_date.
// When ANY clock field is blank, both typed 'Runs from / until' values are kept
// as typed, so older rows without hours stay editable.

import { istDateTimeToIso, istLocalInputToIso } from '@/lib/utils/date-format';

export interface RunWindowFormInput {
  /** yyyy-MM-dd */
  event_date: string;
  /** HH:mm or HH:mm:ss, India time */
  start_time: string;
  end_time: string;
  /** datetime-local values (yyyy-MM-ddTHH:mm, India time) */
  start_date: string;
  end_date: string;
}

export interface RunWindow {
  start_date: string | undefined;
  end_date: string | undefined;
}

/** The last day of the event: the 'Runs until' day when it is after event_date. */
export function runWindowLastDay(eventDate: string, endLocal: string): string {
  const endDay = (endLocal ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(endDay) && endDay > eventDate
    ? endDay
    : eventDate;
}

/** True when the clock fields fully decide the run window. */
export function runWindowFollowsClock(form: RunWindowFormInput): boolean {
  return (
    !!form.event_date.trim() &&
    !!form.start_time.trim() &&
    !!form.end_time.trim()
  );
}

export function deriveRunWindow(form: RunWindowFormInput): RunWindow {
  // All-or-nothing: with any clock field blank the dialog shows the editable
  // 'Runs from / until' boxes, so the save must use what the organiser typed
  // there — deriving one side alone would drop their edit silently.
  if (!runWindowFollowsClock(form)) {
    return {
      start_date: istLocalInputToIso(form.start_date) ?? undefined,
      end_date: istLocalInputToIso(form.end_date) ?? undefined,
    };
  }
  const eventDate = form.event_date.trim();
  return {
    start_date: istDateTimeToIso(eventDate, form.start_time.trim()) ?? undefined,
    end_date:
      istDateTimeToIso(runWindowLastDay(eventDate, form.end_date), form.end_time.trim()) ??
      undefined,
  };
}
