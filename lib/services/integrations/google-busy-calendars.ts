// lib/services/integrations/google-busy-calendars.ts
//
// Which of a host's Google calendars count as "am I busy?".
//
// DELIBERATELY DEPENDENCY-FREE. This is the entire safety argument of the
// multi-calendar busy check, so it lives in its own module with no imports:
// google-calendar-service.ts transitively reaches the email layer, which needs
// a live API key at module load, and a rule this important must be testable
// without standing up half the app to do it.

/** One row of Google's calendarList, trimmed to the fields the rule uses. */
export interface GoogleCalendarListEntry {
  id: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
  summary?: string;
}

/**
 * Google caps a single freeBusy request's `items` array. We stay well under it
 * and report when we trim, because a silently dropped calendar is one the
 * engine will treat as free.
 */
export const FREEBUSY_MAX_CALENDARS = 50;

/**
 * THE RULE: the primary calendar, plus any calendar the host OWNS and has
 * ticked to show in Google's own sidebar.
 *
 * Why `accessRole === 'owner'` and not also 'writer':
 *   A shared department calendar usually grants 'writer'. Counting it would
 *   mark the host busy for every colleague's meeting and quietly kill their
 *   booking page — trading "sees too little" for "sees too much", which is the
 *   worse failure because it looks like nothing is wrong.
 *
 * Why `selected !== false`:
 *   That checkbox is Google's own "show this calendar", which hosts already
 *   understand and control. Reusing it means there is no second settings screen
 *   to find and no parallel preference to drift out of sync with what they see.
 *   Subscribed holiday and birthday calendars arrive as 'reader', so they are
 *   already excluded by the accessRole test — a national holiday must never
 *   mark somebody busy all day.
 */
export function selectBusyCalendarIds(
  entries: GoogleCalendarListEntry[],
): { ids: string[]; truncated: number } {
  const ids: string[] = [];
  let sawPrimary = false;

  for (const c of entries) {
    if (!c?.id) continue;
    if (c.primary) {
      sawPrimary = true;
      ids.unshift(c.id); // primary first — it is the one we cannot do without
      continue;
    }
    if (c.accessRole !== 'owner') continue;
    if (c.selected === false) continue;
    ids.push(c.id);
  }

  // If Google flagged none, keep the literal alias so behaviour can never
  // silently narrow to "no calendars at all" — which would report every host
  // free, always.
  if (!sawPrimary) ids.unshift('primary');

  const deduped = [...new Set(ids)];
  const truncated = Math.max(0, deduped.length - FREEBUSY_MAX_CALENDARS);
  return { ids: deduped.slice(0, FREEBUSY_MAX_CALENDARS), truncated };
}
