// lib/utils/academic/attendance-auto-date.ts
//
// BUG-006152 (17 Sep): the attendance page sets its date ONCE, when it opens.
// Left open overnight (the installed app keeps it alive), it still showed
// 16 Sep on 17 Sep, and "Mark" opened the day before. The page now asks this
// on every return to the screen.

/**
 * The date the attendance page should move to when the viewer comes back, or
 * null to leave it alone. It moves only when the page is still on the date it
 * set by itself (`autoSet`) and the calendar day has changed since; a date the
 * viewer picked is never overridden.
 */
export function rolledOverAttendanceDate(
  current: string,
  autoSet: string | null,
  today: string,
): string | null {
  if (!autoSet || current !== autoSet) return null;
  return today !== current ? today : null;
}
