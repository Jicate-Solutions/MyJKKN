/**
 * Which dates of a date-keyed ("batch") timetable belong on the learner's
 * weekly view.
 *
 * Batch timetables (clinical postings, rotations) key their slots by calendar
 * date — a whole year of them. The learner page shows ONE week as Monday–
 * Saturday, so only the dates of that week may be folded onto weekdays.
 * Folding every date onto its weekday stacked all eight postings of a CRRI
 * year onto each day, and the "current class" badge picked the first posting
 * (BUG-006116).
 *
 * The week is judged on the India calendar, whatever clock the code runs on.
 * On a Sunday the page opens on Monday, so the week shown is the coming one.
 */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function istDateString(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday..Sunday (YYYY-MM-DD, inclusive) of the week the learner page shows. */
export function displayWeek(now: Date = new Date()): { from: string; to: string } {
  const today = istDateString(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const monday = weekday === 0 ? addDays(today, 1) : addDays(today, 1 - weekday);
  return { from: monday, to: addDays(monday, 6) };
}

/** True for a date key inside the displayed week. Non-date keys are not judged here. */
export function isDateKeyInDisplayWeek(key: string, now: Date = new Date()): boolean {
  if (!DATE_KEY.test(key)) return true;
  const { from, to } = displayWeek(now);
  return key >= from && key <= to;
}
