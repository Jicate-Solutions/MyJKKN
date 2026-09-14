/**
 * Reading an entry's timestamp — the day it belongs to, and the time to show.
 *
 * Director, 2026-09-12: "can we also add time to the whatsnew so that we know
 * when the change happened."
 *
 * ─── WHY THIS IS A lib/ FILE AND NOT TWO LINES IN THE VIEW ──────────────────
 *
 * Because of a bug this page has already had once. The recent/archive split is
 * drawn on dates, and a single day once rendered in BOTH halves through
 * IST-midnight drift; the fix was pinning the cutoff to meta.recentFrom on the
 * client. Commits carry a +05:30 offset, and a timestamp compared or formatted
 * in the wrong zone re-opens exactly that seam — the row would show a time from
 * one day under a header naming another.
 *
 * So the day-of-an-instant rule and the time-to-display rule are one function
 * each, in lib/, where __tests__/lib/changelog/entry-time.test.ts can hold them
 * to the required assertion: an entry committed at 23:50 IST and one at 00:10
 * IST the next day each belong to exactly one day, and it is the day printed
 * above them.
 *
 * ─── ONE CLOCK, END TO END ──────────────────────────────────────────────────
 *
 * Asia/Kolkata, everywhere, and nothing is read in the machine's timezone at any
 * step:
 *
 *   · scripts/generate-changelog.mjs reads git with `--date=iso-strict-local`
 *     under TZ=Asia/Kolkata, so `entry_date` is the IST day and `entry_at` is
 *     the same instant with `+05:30` attached.
 *   · Postgres stores `entry_at` as `timestamptz` — an INSTANT. The `+05:30` is
 *     not kept; PostgREST hands the value back as `...+00:00`. That is the same
 *     moment written differently, which is why the reading below re-applies the
 *     zone rather than trusting the string's own offset.
 *   · app/api/whats-new/route.ts already draws every date boundary in this same
 *     zone (istDate, recentFrom), after a bug that printed "Updated 5 September"
 *     above an entry dated 6 September.
 *
 * The upshot is that istDayOf(entry_at) === entry_date for every row the sync
 * writes, whatever timezone the browser is in — which is the invariant the test
 * asserts, and the one that keeps the two halves of the page from overlapping.
 */

/** The clock the changelog is written and read in. Matches scripts/generate-changelog.mjs. */
export const CHANGELOG_TZ = 'Asia/Kolkata';

/**
 * `en-CA` formats as YYYY-MM-DD, which is the shape `entry_date` already has, so
 * the two are directly comparable as strings. Built once: constructing an
 * Intl.DateTimeFormat per row is the expensive part of formatting, and this page
 * renders up to 4,900 of them.
 */
const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHANGELOG_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * `en-GB` with hour12 gives "11:50 pm" — lower case, no leading zero. India
 * reads a 12-hour clock, and lower case sits better next to a name than the
 * "11:50 PM" that en-US produces.
 */
const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: CHANGELOG_TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Parse, or null. An unreadable timestamp must never become "now". */
function instant(at: string | null | undefined): Date | null {
  if (!at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The IST day an instant belongs to, as YYYY-MM-DD — directly comparable with
 * `entry_date`, and with the recent/archive cutoff the route draws.
 *
 * null for an absent or unreadable value, which is a real state: every row
 * written before 2026-09-12 has no `entry_at` until the next sync fills it.
 */
export function istDayOf(at: string | null | undefined): string | null {
  const d = instant(at);
  return d ? DAY_FMT.format(d) : null;
}

/**
 * The time to show on the row, e.g. "7:40 pm" — or null when there is none, in
 * which case the caller shows the date alone, exactly as the page did before
 * this column existed. Half the rows on the page are in that state for the
 * window between this deploy and the first sync.
 */
export function formatEntryTime(at: string | null | undefined): string | null {
  const d = instant(at);
  return d ? TIME_FMT.format(d) : null;
}
