// lib/admission/first-touch-response.ts
//
// How fast an enquiry was first answered, rendered as the two raw clock times
// rather than as a computed duration.
//
// Director's ruling, 2026-09-13 (specs/whats-new/unused-data-rulings-2026-09-13.md):
//   * `admission_leads.first_touch_at` goes on the counsellor's OWN list — not a
//     manager-only view and not a side-by-side comparison between counsellors.
//   * Edge case 5: response time counts REAL time, always — never working hours.
//     An enquiry that arrives at 23:00 Sunday and is answered at 09:00 Monday
//     waited ten hours, because the enquirer genuinely waited all night.
//   * Mitigation shipped with the ruling: do NOT render a bare "10 hours". Show
//     the arrival time beside the answer time, so the counsellor can judge
//     fairness from the raw facts without a second computed number to argue
//     about.
//
// This module therefore computes NO duration at all. Printing both timestamps
// is what makes the measurement real-time by construction: there is no clock to
// pause and no working-hours window to apply.

/** Institution timezone. Every JKKN campus is in Tamil Nadu. */
const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

/** Arrivals older than this render with a date instead of a weekday. */
const WEEKDAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type FirstTouchState = 'answered' | 'awaiting';

export interface FirstTouchResponse {
  /** `awaiting` means the enquiry has never been contacted — not "zero minutes". */
  state: FirstTouchState;
  /** e.g. `11:04pm Sun`, or `11:04pm 14 Sep` for an older enquiry. */
  arrivedAt: string;
  /** Same shape as `arrivedAt`; null while `state` is `awaiting`. */
  answeredAt: string | null;
  /** Ready-to-render line, e.g. `Arrived 11:04pm Sun · answered 9:12am Mon`. */
  label: string;
}

export interface FirstTouchOptions {
  /** Injectable clock — the weekday/date choice is relative to this. */
  now?: Date;
  /** IANA timezone. Defaults to Asia/Kolkata. */
  timeZone?: string;
}

/** Parses a timestamp, returning null for anything unusable. */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `11:04pm` — lowercase, no space, so it reads as one token on a phone. */
function clockLabel(d: Date, timeZone: string): string {
  return d
    .toLocaleString('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * `Sun` for a recent arrival, `14 Sep` for an older one.
 *
 * Day and month are formatted separately and joined by hand: `en-GB` renders
 * September as "Sept", and `en-US` puts the month first. Neither matches how a
 * date is written here, so the locale decides the words and this decides the
 * order.
 */
function dayLabel(d: Date, timeZone: string, useWeekday: boolean): string {
  if (useWeekday) {
    return d.toLocaleDateString('en-US', { timeZone, weekday: 'short' });
  }
  const day = d.toLocaleDateString('en-US', { timeZone, day: 'numeric' });
  const month = d.toLocaleDateString('en-US', { timeZone, month: 'short' });
  return `${day} ${month}`;
}

function stamp(d: Date, timeZone: string, useWeekday: boolean): string {
  return `${clockLabel(d, timeZone)} ${dayLabel(d, timeZone, useWeekday)}`;
}

/**
 * Builds the response-time line for one enquiry.
 *
 * @param createdAt     `admission_leads.created_at` — when the enquiry arrived.
 * @param firstTouchAt  `admission_leads.first_touch_at` — when it was first
 *                      answered. NULL on an enquiry nobody has contacted yet.
 * @returns null when the arrival time is missing or unparseable, so the caller
 *          renders nothing rather than inventing a time.
 */
export function formatFirstTouchResponse(
  createdAt: string | null | undefined,
  firstTouchAt: string | null | undefined,
  options: FirstTouchOptions = {},
): FirstTouchResponse | null {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const now = options.now ?? new Date();

  const arrived = toDate(createdAt);
  if (!arrived) return null;

  const useWeekday = now.getTime() - arrived.getTime() < WEEKDAY_WINDOW_MS;
  const arrivedAt = stamp(arrived, timeZone, useWeekday);

  const answered = toDate(firstTouchAt);

  if (!answered) {
    return {
      state: 'awaiting',
      arrivedAt,
      answeredAt: null,
      label: `Arrived ${arrivedAt} · not yet contacted`,
    };
  }

  const answeredAt = stamp(answered, timeZone, useWeekday);

  return {
    state: 'answered',
    arrivedAt,
    answeredAt,
    label: `Arrived ${arrivedAt} · answered ${answeredAt}`,
  };
}
