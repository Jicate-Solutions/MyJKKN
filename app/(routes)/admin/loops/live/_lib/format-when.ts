// ============================================================================
// LIVE LOOPS — every timestamp on the page, read in India time
// ============================================================================
// An Intl option bag with no `timeZone` renders in whatever zone the PROCESS
// sits in. Vercel runs in UTC, so a measurement taken at 01:00 on the 19th in
// Salem rendered as "18 Sept 2026, 07:30 pm" — the wrong DAY, under an en-IN
// label that promised otherwise. A reader checking whether last night's run
// landed would have found it filed under the day before.
//
// Both formatters therefore pin Asia/Kolkata explicitly. They live in this
// module rather than inside the table component so the rule can be tested
// without rendering React — and the test forces a non-Indian process zone
// first, because on a machine already set to IST the pinned and unpinned
// formatters agree and the bug hides behind a green check.
// ============================================================================

/** Every clock on this page is the Director's clock. */
const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

/** Shown wherever a timestamp is absent or unreadable. Never a fake date. */
const NO_DATE = '—';

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A day and its clock, in India time — e.g. "19 Sept 2026, 01:00 am". */
export function formatWhen(iso: string | null): string {
  const d = parse(iso);
  if (!d) return NO_DATE;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/** Just the day, in India time — e.g. "19 Sept 2026". */
export function formatDay(iso: string | null): string {
  const d = parse(iso);
  if (!d) return NO_DATE;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  });
}
