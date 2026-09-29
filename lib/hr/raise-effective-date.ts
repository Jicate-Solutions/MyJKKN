/**
 * When a raise worked out from a salary suggestion may start.
 *
 * The Director's rulings: nothing is backdated (18 September 2026), and an
 * approved raise starts on the 1st of the month AFTER approval (29 September
 * 2026). So when "Use this figure" fills in Update salary, Effective from
 * starts on the 1st of next month and a date in the past is refused.
 *
 * India time, not the browser's: a laptop set to another zone must not move
 * the month. `now` is an argument so the rollover (December → January, and
 * the last evening of a month in UTC being the 1st in India) is testable.
 */

const IST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today in India, yyyy-MM-dd. */
export function todayIST(now: Date = new Date()): string {
  return IST_DATE.format(now);
}

/** The 1st of next month in India, yyyy-MM-dd. */
export function firstOfNextMonthIST(now: Date = new Date()): string {
  const [y, m] = todayIST(now).split('-').map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** True when a yyyy-MM-dd date is before today in India. */
export function isBeforeTodayIST(date: string, now: Date = new Date()): boolean {
  return date < todayIST(now);
}

/** "1 October 2026" — for the sentence on screen. */
export function formatLongDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const month = new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
  return `${d} ${month} ${y}`;
}
