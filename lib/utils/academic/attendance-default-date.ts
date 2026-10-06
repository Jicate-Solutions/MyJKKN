/**
 * The date the attendance page should move to when it is shown again, or null
 * to leave it alone.
 *
 * Only the date the page chose by itself (`autoDate`) rolls over; a date the
 * user picked stays put. Dates are YYYY-MM-DD in local time.
 */
export function rolledOverAttendanceDate(
  current: string,
  autoDate: string | null,
  today: string
): string | null {
  if (!autoDate || current !== autoDate || current === today) return null;
  return today;
}
